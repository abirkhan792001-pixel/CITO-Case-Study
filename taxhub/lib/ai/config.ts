/**
 * TaxHub — central model & provider configuration.
 *
 * Two deliberate departures from the ai-sdk-rag-starter defaults:
 *   1. GENERATION : OpenAI  ->  Anthropic (Claude).  docs/DECISIONS.md ADR-002
 *   2. EMBEDDINGS : English-first  ->  MULTILINGUAL, because the whole corpus
 *      (German statutes, BMF-Schreiben, Kanzlei-Wiki) is German. ADR-003
 *
 * Everything model-related lives here so a provider swap is a one-file change.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
// import { cohere } from "@ai-sdk/cohere"; // <- uncomment to switch embeddings to Cohere

import { EMBEDDING_DIMENSIONS } from "./embedding-config";

export { EMBEDDING_DIMENSIONS };

/* -------------------------------------------------------------------------- */
/*  GENERATION MODEL — Anthropic (replaces the starter's OpenAI default)       */
/* -------------------------------------------------------------------------- */

export const GENERATION_MODEL_ID = "claude-opus-5" as const;

/** Answer generation. Reads ANTHROPIC_API_KEY from the environment. */
export const generationModel = anthropic(GENERATION_MODEL_ID);

/* -------------------------------------------------------------------------- */
/*  EMBEDDING MODEL — multilingual (replaces the starter's default)            */
/* -------------------------------------------------------------------------- */

/**
 * DEFAULT: OpenAI `text-embedding-3-large` — multilingual by training and
 * strong on German legal prose.
 *
 * NOTE (AI SDK v7): `openai.embedding()` takes the model id ONLY. Per-call
 * options such as `dimensions` are passed as `providerOptions` on embed() /
 * embedMany() — see EMBEDDING_PROVIDER_OPTIONS below.
 */
export const embeddingModel = openai.embedding("text-embedding-3-large");

/**
 * Matryoshka reduction 3072 -> 1536. pgvector's HNSW index tops out at 2000
 * dimensions, so the native width could not be indexed at all. ADR-003.
 */
export const EMBEDDING_PROVIDER_OPTIONS = {
  openai: { dimensions: EMBEDDING_DIMENSIONS },
} as const;

/* ---------------------------------------------------------------------------
 *  ALTERNATIVE EMBEDDINGS — Cohere embed-multilingual-v3  (switch instructions)
 *  ---------------------------------------------------------------------------
 *  embed-multilingual-v3.0 is trained explicitly for cross-lingual retrieval and
 *  is the credible swap if OpenAI recall on German statute language disappoints.
 *
 *  TO SWITCH:
 *    1. Uncomment the `cohere` import above.
 *    2. Replace the two exports above with:
 *
 *         export const embeddingModel = cohere.embedding("embed-multilingual-v3.0");
 *         export const EMBEDDING_PROVIDER_OPTIONS = {
 *           cohere: { inputType: "search_document" },   // "search_query" when embedding a question
 *         } as const;
 *
 *    3. Set EMBEDDING_DIMENSIONS = 1024 in lib/ai/embedding-config.ts
 *       (Cohere v3 is 1024-dim, not 1536).
 *    4. Set COHERE_API_KEY in .env (already declared in lib/env.mjs).
 *    5. Re-generate + re-run the migration — the vector column width changes:
 *         pnpm db:generate && pnpm db:migrate
 *    6. RE-EMBED THE ENTIRE CORPUS. Vectors from different models are not
 *       comparable; mixing them silently destroys retrieval quality.
 * ------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  RETRIEVAL / GROUNDING THRESHOLD                                           */
/* -------------------------------------------------------------------------- */

/**
 * Cosine-similarity floor (0..1). Chunks below this are NOT returned, which is
 * precisely what makes the assistant refuse instead of inventing an answer.
 * Assumption: 0.35 is a starting value — it MUST be tuned against the seed
 * question set once a corpus exists (Phase 3). Recorded in ASSUMPTIONS.md A7.
 */
export const SIMILARITY_THRESHOLD = 0.35;

/** How many chunks to retrieve per question. */
export const RETRIEVAL_TOP_K = 6;
