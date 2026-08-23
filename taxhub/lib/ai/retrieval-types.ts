import type { Provenance } from "../db/schema/provenance";

/**
 * One retrieved passage, whatever the retrieval mode produced it.
 *
 * Lives in its own module so keyword.ts and embedding.ts can share it without
 * importing each other — embedding.ts dispatches to keyword.ts, and a cycle
 * would break that.
 *
 * `similarity` is mode-dependent and NOT comparable across modes: cosine
 * similarity (0..1) under vector retrieval, ts_rank_cd under keyword retrieval.
 * Each mode carries its own threshold in config for exactly this reason.
 */
export type RetrievedChunk = {
  content: string;
  similarity: number;
  provenance: Provenance;
};
