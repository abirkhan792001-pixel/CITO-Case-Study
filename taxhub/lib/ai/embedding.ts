import { embed, embedMany } from "ai";
import { cosineDistance, desc, gt, sql } from "drizzle-orm";

import { db } from "../db";
import { embeddings } from "../db/schema/embeddings";
import { type Provenance } from "../db/schema/provenance";
import {
  EMBEDDING_PROVIDER_OPTIONS,
  RETRIEVAL_TOP_K,
  SIMILARITY_THRESHOLD,
  embeddingModel,
} from "./config";

/**
 * Split a document into retrievable chunks.
 *
 * Section-aware by design: German statutes are already structured by § / Absatz,
 * and a chunk that straddles two paragraphs cannot be cited honestly. The ingest
 * pipeline (Phase 2) is responsible for passing one logical section at a time;
 * this function is the fallback splitter for long prose such as wiki pages.
 */
export const generateChunks = (input: string): string[] =>
  input
    .trim()
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

/** Embed many chunks at once (ingest path). */
export const generateEmbeddings = async (
  value: string,
): Promise<Array<{ content: string; embedding: number[] }>> => {
  const chunks = generateChunks(value);
  const { embeddings: vectors } = await embedMany({
    model: embeddingModel,
    values: chunks,
    providerOptions: EMBEDDING_PROVIDER_OPTIONS,
  });
  return vectors.map((e, i) => ({ content: chunks[i], embedding: e }));
};

/** Embed a single user question (query path). */
export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll("\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
    providerOptions: EMBEDDING_PROVIDER_OPTIONS,
  });
  return embedding;
};

export type RetrievedChunk = {
  content: string;
  similarity: number;
  provenance: Provenance;
};

/**
 * Vector search with the grounding threshold applied.
 *
 * Split out from findRelevantContent so the threshold gate can be exercised
 * against a real database WITHOUT calling an embeddings API — see
 * scripts/verify-retrieval-gate.ts. The gate is the behaviour this product
 * lives or dies on, so it must be testable in isolation.
 */
export const searchByVector = async (
  queryEmbedding: number[],
): Promise<RetrievedChunk[]> => {
  // Cosine similarity = 1 - cosine distance. Must match the HNSW opclass
  // (vector_cosine_ops) declared on the embeddings table.
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
    .where(gt(similarity, SIMILARITY_THRESHOLD))
    .orderBy((t) => desc(t.similarity))
    .limit(RETRIEVAL_TOP_K);
};

/**
 * Retrieve the passages that can support an answer.
 *
 * Returns [] when nothing clears SIMILARITY_THRESHOLD. That empty array is the
 * refusal signal — the answer layer must NOT fall back to general knowledge.
 */
export const findRelevantContent = async (
  userQuery: string,
): Promise<RetrievedChunk[]> => searchByVector(await generateEmbedding(userQuery));
