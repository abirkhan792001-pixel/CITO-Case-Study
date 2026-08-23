/**
 * German full-text retrieval.
 *
 * This is the retrieval path in use while no embeddings API key is available
 * (ADR-013). It is NOT a mock: it queries the same chunks, returns the same
 * shape, and enforces the same "return nothing rather than something weak"
 * contract, so the refusal behaviour the product depends on is unchanged.
 *
 * What it genuinely cannot do is match a paraphrase. A question that shares no
 * word stems with the statute will miss here even when it means exactly the same
 * thing — which is the entire reason embeddings remain the intended design.
 */
import { sql } from "drizzle-orm";

import { db } from "../db";
import { embeddings } from "../db/schema/embeddings";
import { KEYWORD_THRESHOLD, MAX_DOCUMENT_FREQUENCY, RETRIEVAL_TOP_K } from "./config";
import type { RetrievedChunk } from "./retrieval-types";

/**
 * High-frequency German function words plus question scaffolding
 * ("wie", "lange", "muss") that carry no topical signal. Left in, they match
 * everywhere and flatten the ranking.
 *
 * This list handles grammar. It cannot handle words that are common *in this
 * corpus specifically* ("steuer", "gesetzlich", "deutschland") — that is what
 * the document-frequency filter below is for.
 */
const STOPWORDS = new Set([
  "aber", "alle", "allem", "aller", "alles", "als", "also", "auch", "auf",
  "aus", "bei", "beim", "bin", "bis", "damit", "dann", "das", "dass", "dem",
  "den", "denn", "der", "des", "dessen", "die", "dies", "diese", "diesem",
  "diesen", "dieser", "dieses", "doch", "dort", "durch", "ein", "eine",
  "einem", "einen", "einer", "eines", "einige", "etwa", "für", "gegen",
  "gibt", "hat", "haben", "hier", "hoch", "ich", "ihr", "ihre", "ihrem",
  "ihren", "ist", "kann", "können", "man", "mehr", "mein", "meine", "mit",
  "muss", "müssen", "nach", "nicht", "noch", "nur", "ob", "oder", "ohne",
  "sein", "seine", "sich", "sie", "sind", "soll", "sollen", "über", "und",
  "uns", "unser", "unsere", "vom", "von", "vor", "war", "waren", "was",
  "wann", "wenn", "wer", "werde", "werden", "wie", "wieviel", "will", "wir",
  "wird", "wo", "wurde", "zu", "zum", "zur", "lange", "viel", "gilt",
  "gelten", "welche", "welcher", "welchem", "welchen", "bitte", "denen",
  "gehören", "gehört", "eines", "einen", "unter", "neuen", "neue",
]);

/** Content words from a question, before any corpus-aware filtering. */
export const candidateTerms = (question: string): string[] => {
  const terms = (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length > 3 && !STOPWORDS.has(w),
  );
  return [...new Set(terms)];
};

/**
 * Drop query terms that appear in too much of the corpus to discriminate.
 *
 * This is the crucial half. Postgres text search has no IDF: `ts_rank_cd` scores
 * a match on "deutschland" exactly as enthusiastically as a match on
 * "kleinunternehmer". Without this filter, "Wie hoch ist der gesetzliche
 * Mindestlohn?" — a question whose one distinctive word appears NOWHERE in the
 * corpus — still retrieved six statute sections on the strength of "gesetzlich"
 * and "deutschland", and the assistant would have answered instead of refusing.
 *
 * After filtering, that question reduces to "mindestlohn", which matches nothing,
 * and the refusal is restored for the right reason.
 */
export type WeightedTerm = { term: string; df: number; idf: number };

const discriminativeTerms = async (terms: string[]): Promise<WeightedTerm[]> => {
  if (terms.length === 0) return [];

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(embeddings);
  if (total === 0) return [];

  const values = sql.join(
    terms.map((t) => sql`(${t})`),
    sql`, `,
  );

  const rows = (await db.execute(sql`
    with q(term) as (values ${values})
    select q.term as term,
           (select count(*) from ${embeddings} e
             where to_tsvector('german', e.content)
                   @@ websearch_to_tsquery('german', q.term))::int as df
    from q
  `)) as unknown as Array<{ term: string; df: number }>;

  // Inverse document frequency, the standard rarity weight. A term matching 12
  // chunks out of 2,717 ("kleinunternehmer") must count for far more than one
  // matching 455 ("gesetzliche") — Postgres text search weights them equally,
  // which is why the right section lost to near-misses before this existed.
  return rows
    .filter((r) => Number(r.df) / total <= MAX_DOCUMENT_FREQUENCY)
    .map((r) => ({
      term: r.term,
      df: Number(r.df),
      idf: Math.log(total / (1 + Number(r.df))),
    }));
};

/**
 * Build the tsquery expression, or null when the question cannot discriminate.
 *
 * OR rather than AND is deliberate: AND requires every content word to appear,
 * and a practitioner's phrasing almost never shares its full vocabulary with
 * statute language. Measured on this corpus, AND scored 0 on two of three test
 * questions that OR retrieves correctly.
 */
export const weightedQueryTerms = async (
  question: string,
): Promise<WeightedTerm[]> => discriminativeTerms(candidateTerms(question));

/** Human-readable form of the query actually executed. Used by the probe. */
export const buildKeywordQuery = async (
  question: string,
): Promise<string | null> => {
  const kept = await weightedQueryTerms(question);
  return kept.length > 0 ? kept.map((t) => t.term).join(" OR ") : null;
};

/**
 * Retrieve chunks by German full-text match, ranked, above KEYWORD_THRESHOLD.
 *
 * Returns [] when nothing clears the threshold — the same refusal signal
 * searchByVector produces, so the answer layer needs no special case.
 */
export const searchByKeywords = async (
  question: string,
): Promise<RetrievedChunk[]> => {
  const terms = await weightedQueryTerms(question);
  if (terms.length === 0) return [];

  // 'german' must match the configuration of the GIN index on embeddings.content.
  const tsVector = sql`to_tsvector('german', ${embeddings.content})`;
  const tsQuery = sql`websearch_to_tsquery('german', ${terms
    .map((t) => t.term)
    .join(" OR ")})`;

  // Score = sum over terms of (rank for that term alone) * IDF(term).
  // Normalisation flag 1 divides by 1 + log(length), so a long section cannot
  // out-rank a precise short one merely by repeating a term.
  const rank = sql<number>`(${sql.join(
    terms.map(
      (t) =>
        sql`ts_rank_cd(${tsVector}, websearch_to_tsquery('german', ${t.term}), 1) * ${t.idf}`,
    ),
    sql` + `,
  )})`;

  return db
    .select({
      content: embeddings.content,
      similarity: rank,
      provenance: embeddings.provenance,
    })
    .from(embeddings)
    .where(sql`${tsVector} @@ ${tsQuery} and ${rank} > ${KEYWORD_THRESHOLD}`)
    .orderBy(sql`${rank} desc`)
    .limit(RETRIEVAL_TOP_K) as unknown as Promise<RetrievedChunk[]>;
};
