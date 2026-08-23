/**
 * Embedding vector width — the single source of truth.
 *
 * Imported by lib/db/schema/embeddings.ts (column width) AND lib/ai/config.ts
 * (the `dimensions` provider option). Deliberately free of any provider import
 * so `drizzle-kit generate` can parse the schema without loading the AI SDK.
 *
 * 1536 = OpenAI text-embedding-3-large, Matryoshka-reduced from its native 3072.
 * Why reduced: pgvector's HNSW index tops out at 2000 dimensions, so a native
 * 3072-dim column could not be indexed at all. See docs/DECISIONS.md ADR-003.
 *
 * CHANGING THIS VALUE IS A MIGRATION *AND* A FULL RE-EMBED.
 * (e.g. Cohere embed-multilingual-v3.0 would be 1024.)
 */
export const EMBEDDING_DIMENSIONS = 1536;
