"use server";

import { db } from "../db";
import { generateEmbeddings } from "../ai/embedding";
import { embeddings as embeddingsTable } from "../db/schema/embeddings";
import type { Provenance } from "../db/schema/provenance";
import {
  insertResourceSchema,
  resources,
  type NewResourceParams,
} from "../db/schema/resources";

/**
 * Store one source document and its embedded chunks.
 *
 * Provenance is mandatory at the type level AND validated at runtime, so there is
 * no code path that puts an uncitable chunk into the knowledge base. The ingest
 * pipeline (Phase 2) may override provenance per chunk — a statute document spans
 * several §§, and the citation shown to the user must name the right one.
 *
 * NOTE: nothing is ingested yet. This is the wiring, not the corpus.
 */
export const createResource = async (
  input: NewResourceParams,
  chunkProvenance?: (chunkContent: string, index: number) => Provenance,
) => {
  try {
    const { content, provenance } = insertResourceSchema.parse(input);

    const [resource] = await db
      .insert(resources)
      .values({
        content,
        provenance,
        isSynthetic: provenance.is_synthetic,
      })
      .returning();

    const embedded = await generateEmbeddings(content);

    if (embedded.length > 0) {
      await db.insert(embeddingsTable).values(
        embedded.map((chunk, i) => ({
          resourceId: resource.id,
          content: chunk.content,
          embedding: chunk.embedding,
          provenance: chunkProvenance
            ? chunkProvenance(chunk.content, i)
            : provenance,
        })),
      );
    }

    return `Resource stored: ${embedded.length} chunk(s) from "${provenance.title}".`;
  } catch (e) {
    if (e instanceof Error) {
      return e.message.length > 0 ? e.message : "Error, please try again.";
    }
    return "Error, please try again.";
  }
};
