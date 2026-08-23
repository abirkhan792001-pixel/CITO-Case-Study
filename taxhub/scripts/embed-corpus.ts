/**
 * Embed the built corpus and store it in Postgres/pgvector.
 *
 *   pnpm corpus:embed            # refuses if the knowledge base is not empty
 *   pnpm corpus:embed --replace  # wipes the knowledge base first
 *
 * Reads corpus/chunks/corpus.json (produced by `pnpm corpus:build`). Every
 * chunk's provenance is re-validated against the schema here, at the last moment
 * before it becomes retrievable — a chunk that cannot be cited must never reach
 * the knowledge base, and this is the final place to stop it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { embedMany } from "ai";
import { sql } from "drizzle-orm";

import { EMBEDDING_PROVIDER_OPTIONS, embeddingModel } from "../lib/ai/config";
import { db } from "../lib/db";
import { embeddings as embeddingsTable } from "../lib/db/schema/embeddings";
import { provenanceSchema } from "../lib/db/schema/provenance";
import { resources } from "../lib/db/schema/resources";
import type { DocumentRecord } from "./build-corpus";

/** How many chunks per embedding request. */
const BATCH_SIZE = 96;

const CORPUS_FILE = join(process.cwd(), "corpus", "chunks", "corpus.json");

const fail = (msg: string): never => {
  console.error(`\nABORT: ${msg}\n`);
  process.exit(1);
};

/**
 * Refuse to start on an obviously unset key rather than burning half the corpus
 * and dying at chunk 900 with a partially-populated knowledge base.
 */
const assertUsableKey = () => {
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key || key.includes("PLACEHOLDER") || !key.startsWith("sk-")) {
    fail(
      "OPENAI_API_KEY is missing or still a placeholder.\n" +
        "  Embeddings cannot be generated, so nothing was written to the database.\n" +
        "  The corpus is already built and inspectable at corpus/chunks/corpus.json —\n" +
        "  set a real key in .env and re-run `pnpm corpus:embed`.",
    );
  }
};

const main = async () => {
  assertUsableKey();

  const replace = process.argv.includes("--replace");

  let payload: { commitSha: string; documents: DocumentRecord[] };
  try {
    payload = JSON.parse(readFileSync(CORPUS_FILE, "utf8"));
  } catch {
    return fail(`cannot read ${CORPUS_FILE}. Run \`pnpm corpus:build\` first.`);
  }

  // --- Validate every chunk BEFORE touching the database. ---
  let validated = 0;
  for (const doc of payload.documents) {
    const docCheck = provenanceSchema.safeParse(doc.provenance);
    if (!docCheck.success) {
      return fail(
        `document "${doc.provenance?.title}" has invalid provenance: ` +
          JSON.stringify(docCheck.error.issues.slice(0, 3)),
      );
    }
    for (const chunk of doc.chunks) {
      const check = provenanceSchema.safeParse(chunk.provenance);
      if (!check.success) {
        return fail(
          `a chunk of "${doc.provenance.title}" has invalid provenance: ` +
            JSON.stringify(check.error.issues.slice(0, 3)),
        );
      }
      validated++;
    }
  }
  console.log(`\n  provenance validated on ${validated} chunks`);

  const [{ count: existing }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(embeddingsTable);

  if (existing > 0 && !replace) {
    return fail(
      `the knowledge base already holds ${existing} chunks. ` +
        "Re-run with --replace to wipe and re-ingest.",
    );
  }
  if (existing > 0) {
    console.log(`  --replace: deleting ${existing} existing chunks`);
    await db.delete(resources); // embeddings cascade
  }

  let storedChunks = 0;

  for (const doc of payload.documents) {
    const [resource] = await db
      .insert(resources)
      .values({
        content: doc.content,
        provenance: doc.provenance,
        isSynthetic: doc.provenance.is_synthetic,
      })
      .returning();

    for (let i = 0; i < doc.chunks.length; i += BATCH_SIZE) {
      const batch = doc.chunks.slice(i, i + BATCH_SIZE);
      const { embeddings: vectors } = await embedMany({
        model: embeddingModel,
        values: batch.map((c) => c.content),
        providerOptions: EMBEDDING_PROVIDER_OPTIONS,
      });

      await db.insert(embeddingsTable).values(
        batch.map((chunk, j) => ({
          resourceId: resource.id,
          content: chunk.content,
          embedding: vectors[j],
          provenance: chunk.provenance,
        })),
      );
      storedChunks += batch.length;
      process.stdout.write(
        `\r  ${doc.provenance.abkuerzung ?? "WIKI"}: ${Math.min(
          i + BATCH_SIZE,
          doc.chunks.length,
        )}/${doc.chunks.length}   (total ${storedChunks})     `,
      );
    }
    process.stdout.write("\n");
  }

  const [{ count: finalChunks }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(embeddingsTable);
  const [{ count: finalDocs }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resources);

  console.log(
    `\n  stored ${finalChunks} chunks across ${finalDocs} documents ` +
      `(mirror @ ${payload.commitSha.slice(0, 12)})\n`,
  );
  process.exit(0);
};

main().catch((e) => {
  console.error("\nembedding failed:", e);
  process.exit(1);
});
