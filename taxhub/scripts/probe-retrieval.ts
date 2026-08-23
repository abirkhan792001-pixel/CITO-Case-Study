/**
 * Inspect RETRIEVAL ONLY — no answer generation.
 *
 *   pnpm corpus:probe
 *
 * Phase 3's gate is that a human can eyeball whether the right passages come back
 * with the right section identifiers, BEFORE any model is allowed to write prose
 * over them. Generation can make bad retrieval look convincing; this script
 * cannot.
 *
 * For every question it prints what cleared SIMILARITY_THRESHOLD. When nothing
 * clears it — the refusal case — it also prints the nearest misses and their
 * scores, so the threshold can be calibrated on evidence rather than by feel.
 */
import { cosineDistance, desc, gt, sql } from "drizzle-orm";

import { RETRIEVAL_TOP_K, SIMILARITY_THRESHOLD } from "../lib/ai/config";
import { generateEmbedding, searchByVector } from "../lib/ai/embedding";
import { db } from "../lib/db";
import { embeddings } from "../lib/db/schema/embeddings";
import { formatCitation } from "../lib/db/schema/provenance";

type Probe = { question: string; expect: string };

/**
 * The seed set: one question per corpus area plus one that is deliberately
 * outside it. Same list serves as demo script and eval set — keeping them
 * identical is what stops the demo from drifting away from what is tested.
 */
const PROBES: Probe[] = [
  {
    question: "Was sind Werbungskosten und bei welcher Einkunftsart werden sie abgezogen?",
    expect: "EStG § 9",
  },
  {
    question: "Wann muss ein Kleinunternehmer keine Umsatzsteuer ausweisen?",
    expect: "UStG § 19",
  },
  {
    question: "Wie lange müssen Buchungsbelege und Jahresabschlüsse aufbewahrt werden?",
    expect: "AO § 147",
  },
  {
    question: "Welche Schritte gehören bei uns zum Onboarding eines neuen Mandanten?",
    expect: "Kanzlei-Wiki (SIMULIERT)",
  },
  {
    question: "Wie hoch ist der gesetzliche Mindestlohn in Deutschland?",
    expect: "OUT OF SCOPE - must retrieve nothing",
  },
];

const assertUsableKey = () => {
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key || key.includes("PLACEHOLDER") || !key.startsWith("sk-")) {
    console.error(
      "\nABORT: OPENAI_API_KEY is missing or still a placeholder.\n" +
        "  A question must be embedded with the SAME model as the corpus before it\n" +
        "  can be searched. Nothing was probed; no fallback was substituted, because\n" +
        "  a lexical stand-in would not tell you anything about real retrieval.\n",
    );
    process.exit(1);
  }
};

/** Nearest chunks IGNORING the threshold — used to show how close a miss was. */
const nearestMisses = async (queryEmbedding: number[], limit = 3) => {
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    queryEmbedding,
  )})`;
  return db
    .select({
      content: embeddings.content,
      similarity,
      provenance: embeddings.provenance,
    })
    .from(embeddings)
    .where(gt(similarity, sql`-1`))
    .orderBy((t) => desc(t.similarity))
    .limit(limit);
};

const oneLine = (s: string, n: number) =>
  s.replace(/\s+/g, " ").trim().slice(0, n);

const main = async () => {
  assertUsableKey();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(embeddings);
  if (count === 0) {
    console.error("\nABORT: knowledge base is empty. Run `pnpm corpus:embed` first.\n");
    process.exit(1);
  }

  console.log(
    `\nRetrieval probe — ${count} chunks, threshold ${SIMILARITY_THRESHOLD}, top_k ${RETRIEVAL_TOP_K}\n`,
  );

  for (const probe of PROBES) {
    console.log("=".repeat(78));
    console.log(`FRAGE:    ${probe.question}`);
    console.log(`ERWARTET: ${probe.expect}`);

    const vector = await generateEmbedding(probe.question);
    const hits = await searchByVector(vector);

    if (hits.length === 0) {
      console.log("\n  >>> NICHTS ÜBER DEM SCHWELLENWERT — das System würde ABLEHNEN.");
      const misses = await nearestMisses(vector);
      console.log("      nächste Treffer (unterhalb der Schwelle):");
      for (const m of misses) {
        console.log(
          `        ${m.similarity.toFixed(4)}  ${formatCitation(m.provenance)}  ` +
            `${oneLine(m.content, 70)}`,
        );
      }
      console.log();
      continue;
    }

    console.log();
    for (const hit of hits) {
      const p = hit.provenance;
      const tag = p.is_synthetic ? "[SIMULIERT]" : "[amtlich]  ";
      console.log(
        `  ${hit.similarity.toFixed(4)}  ${tag} ${formatCitation(p).padEnd(24)} ` +
          `Stand ${p.stand}`,
      );
      console.log(`            ${oneLine(hit.content, 110)}`);
    }
    console.log();
  }

  console.log("=".repeat(78));
  process.exit(0);
};

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
