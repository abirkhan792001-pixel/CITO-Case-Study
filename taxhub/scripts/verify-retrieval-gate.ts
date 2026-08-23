/**
 * Verifies the grounding gate against a REAL database, with no embeddings API.
 *
 * The gate — "return nothing unless a passage genuinely matches" — is what makes
 * the assistant refuse instead of inventing an answer. It is the single most
 * important behaviour in this product, so it gets a test that runs anywhere a
 * Postgres with pgvector is reachable.
 *
 *   pnpm verify:gate
 *
 * Uses hand-built orthogonal vectors instead of real embeddings, so it needs no
 * API key and is deterministic.
 */
import { sql } from "drizzle-orm";

import { SIMILARITY_THRESHOLD } from "../lib/ai/config";
import { EMBEDDING_DIMENSIONS } from "../lib/ai/embedding-config";
import { searchByVector } from "../lib/ai/embedding";
import { db } from "../lib/db";
import { embeddings } from "../lib/db/schema/embeddings";
import { resources } from "../lib/db/schema/resources";
import type { Provenance } from "../lib/db/schema/provenance";

/** Unit vector with a single 1 at `axis` — two such vectors are orthogonal. */
const unitVector = (axis: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0));

const TEST_PROVENANCE: Provenance = {
  gesetz: "TESTGESETZ (verify-retrieval-gate)",
  abkuerzung: "TESTG",
  paragraph: "§ 1",
  absatz: "Abs. 1",
  source_url: "test://verify-retrieval-gate",
  source_repo: "test-fixture",
  commit_sha: null,
  retrieved_at: "1970-01-01",
  stand: null,
  licence_note: "Test fixture — deleted at the end of this script.",
  title: "Retrieval gate test fixture",
  is_synthetic: true,
};

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  if (!ok) failures++;
};

const main = async () => {
  console.log(
    `\nRetrieval gate verification (threshold ${SIMILARITY_THRESHOLD}, ${EMBEDDING_DIMENSIONS} dims)\n`,
  );

  const matching = unitVector(0);
  const orthogonal = unitVector(1);

  // 1. Empty corpus must retrieve nothing — this is what triggers the refusal.
  const onEmpty = await searchByVector(matching);
  check(
    "empty corpus retrieves nothing",
    onEmpty.length === 0,
    `${onEmpty.length} chunk(s) returned`,
  );

  // Seed one chunk so the gate can be tested in the open direction too.
  const [resource] = await db
    .insert(resources)
    .values({
      content: "Testinhalt für die Prüfung des Schwellenwerts.",
      provenance: TEST_PROVENANCE,
      isSynthetic: true,
    })
    .returning();

  await db.insert(embeddings).values({
    resourceId: resource.id,
    content: "Testinhalt für die Prüfung des Schwellenwerts.",
    embedding: matching,
    provenance: TEST_PROVENANCE,
  });

  try {
    // 2. Gate OPEN: an identical vector is similarity 1.0 and must come back.
    const hit = await searchByVector(matching);
    check(
      "matching vector clears the threshold",
      hit.length === 1 && hit[0].similarity > 0.99,
      `${hit.length} chunk(s), similarity ${hit[0]?.similarity?.toFixed(4) ?? "n/a"}`,
    );

    // 3. Citation survives retrieval — an uncitable hit would be useless.
    check(
      "retrieved chunk carries its provenance",
      hit[0]?.provenance?.abkuerzung === "TESTG" &&
        hit[0]?.provenance?.paragraph === "§ 1",
      `${hit[0]?.provenance?.abkuerzung ?? "?"} ${hit[0]?.provenance?.paragraph ?? "?"}`,
    );

    // 4. Gate CLOSED: an orthogonal vector is similarity 0 and must be filtered.
    //    This is the case that produces a refusal instead of a hallucination.
    const miss = await searchByVector(orthogonal);
    check(
      "unrelated vector is filtered out",
      miss.length === 0,
      `${miss.length} chunk(s) returned`,
    );
  } finally {
    await db.delete(resources).where(sql`${resources.id} = ${resource.id}`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(embeddings);
  check("test fixture cleaned up", count === 0, `${count} chunk(s) remain`);

  console.log(
    `\n${failures === 0 ? "GATE VERIFIED" : `GATE BROKEN — ${failures} failure(s)`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error("verification errored:", e);
  process.exit(1);
});
