/**
 * Inspect RETRIEVAL ONLY — no answer generation.
 *
 *   pnpm corpus:probe
 *
 * The gate for this phase is that a human can eyeball whether the right passages
 * come back with the right section identifiers, BEFORE any model is allowed to
 * write prose over them. Generation can make bad retrieval look convincing; this
 * script cannot.
 *
 * Runs whichever retrieval mode is live (RETRIEVAL_MODE). When nothing clears the
 * threshold — the refusal case — it also prints the nearest misses and their
 * scores, so the threshold can be calibrated on evidence rather than by feel.
 */
import { sql } from "drizzle-orm";

import {
  KEYWORD_THRESHOLD,
  RETRIEVAL_MODE,
  RETRIEVAL_TOP_K,
  SIMILARITY_THRESHOLD,
} from "../lib/ai/config";
import { findRelevantContent } from "../lib/ai/embedding";
import { buildKeywordQuery } from "../lib/ai/keyword";
import { db } from "../lib/db";
import { embeddings } from "../lib/db/schema/embeddings";
import { formatCitation } from "../lib/db/schema/provenance";

type Probe = {
  question: string;
  expect: string;
  /** Substring that MUST appear in a retrieved citation. Without this the probe
   *  would pass whenever anything came back, however wrong. */
  expectCitation?: string;
  mustRefuse?: boolean;
};

/**
 * The seed set: one question per corpus area plus one deliberately outside it.
 * The same list serves as demo script and eval set — keeping them identical is
 * what stops the demo from drifting away from what is actually tested.
 */
const PROBES: Probe[] = [
  {
    question: "Was sind Werbungskosten und bei welcher Einkunftsart werden sie abgezogen?",
    expect: "EStG § 9",
    expectCitation: "EStG § 9",
  },
  {
    question: "Wann ist ein Kleinunternehmer von der Umsatzsteuer befreit?",
    expect: "UStG § 19",
    expectCitation: "UStG § 19 ",
  },
  {
    question: "Welche Unterlagen müssen aufbewahrt werden und wie lange?",
    expect: "AO § 147",
    expectCitation: "AO § 147",
  },
  {
    question: "Welche Schritte gehören bei uns zum Onboarding eines neuen Mandanten?",
    expect: "Kanzlei-Wiki (SIMULIERT)",
    expectCitation: "Onboarding",
  },
  {
    question: "Wie hoch ist der gesetzliche Mindestlohn in Deutschland?",
    expect: "AUSSERHALB DES KORPUS",
    mustRefuse: true,
  },
];

/** Nearest chunks IGNORING the threshold — shows how close a miss actually was. */
const nearestKeywordMisses = async (question: string, limit = 3) => {
  const orQuery = await buildKeywordQuery(question);
  if (!orQuery) return [];
  const tsQuery = sql`websearch_to_tsquery('german', ${orQuery})`;
  const tsVector = sql`to_tsvector('german', ${embeddings.content})`;
  const rank = sql<number>`ts_rank_cd(${tsVector}, ${tsQuery})`;
  return db
    .select({
      content: embeddings.content,
      similarity: rank,
      provenance: embeddings.provenance,
    })
    .from(embeddings)
    .where(sql`${tsVector} @@ ${tsQuery}`)
    .orderBy(sql`${rank} desc`)
    .limit(limit);
};

const oneLine = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

const main = async () => {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(embeddings);
  if (count === 0) {
    console.error("\nABORT: knowledge base is empty. Run `pnpm corpus:embed` first.\n");
    process.exit(1);
  }

  const threshold =
    RETRIEVAL_MODE === "vector" ? SIMILARITY_THRESHOLD : KEYWORD_THRESHOLD;

  console.log(
    `\nRetrieval probe — mode=${RETRIEVAL_MODE}, ${count} chunks, ` +
      `threshold ${threshold}, top_k ${RETRIEVAL_TOP_K}\n`,
  );

  let failures = 0;

  for (const probe of PROBES) {
    console.log("=".repeat(78));
    console.log(`FRAGE:    ${probe.question}`);
    console.log(`ERWARTET: ${probe.expect}`);

    const hits = await findRelevantContent(probe.question);

    if (hits.length === 0) {
      const verdict = probe.mustRefuse ? "KORREKT" : "PROBLEM";
      if (!probe.mustRefuse) failures++;
      console.log(`\n  >>> NICHTS ÜBER DEM SCHWELLENWERT — ABLEHNUNG (${verdict})`);
      if (RETRIEVAL_MODE === "keyword") {
        const misses = await nearestKeywordMisses(probe.question);
        if (misses.length > 0) {
          console.log("      nächste Treffer unterhalb der Schwelle:");
          for (const m of misses) {
            console.log(
              `        ${Number(m.similarity).toFixed(4)}  ` +
                `${formatCitation(m.provenance)}  ${oneLine(m.content, 60)}`,
            );
          }
        }
      }
      console.log();
      continue;
    }

    if (probe.mustRefuse) {
      failures++;
      console.log("\n  >>> PROBLEM: hätte ablehnen müssen, hat aber Treffer geliefert.");
    }

    if (probe.expectCitation) {
      const found = hits.some((h) =>
        `${formatCitation(h.provenance)} ${h.provenance.title}`.includes(
          probe.expectCitation as string,
        ),
      );
      if (!found) {
        failures++;
        console.log(
          `\n  >>> PROBLEM: "${probe.expectCitation}" kam in den Treffern NICHT vor.`,
        );
      }
    }

    console.log();
    for (const hit of hits) {
      const p = hit.provenance;
      const tag = p.is_synthetic ? "[SIMULIERT]" : "[amtlich]  ";
      console.log(
        `  ${Number(hit.similarity).toFixed(4)}  ${tag} ` +
          `${formatCitation(p).padEnd(30)} Stand ${p.stand}`,
      );
      console.log(`            ${oneLine(hit.content, 108)}`);
    }
    console.log();
  }

  console.log("=".repeat(78));
  console.log(
    failures === 0
      ? "\nAlle Sondierungen wie erwartet.\n"
      : `\n${failures} Sondierung(en) NICHT wie erwartet.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
