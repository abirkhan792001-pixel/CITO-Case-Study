import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import "dotenv/config";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    /** Supabase Postgres (pgvector enabled). Pooled connection string. */
    DATABASE_URL: z.string().min(1),

    /** Answer generation — Anthropic (Claude). Replaces the starter's OpenAI. */
    ANTHROPIC_API_KEY: z.string().min(1),

    /** Embeddings — OpenAI text-embedding-3-large (multilingual). */
    OPENAI_API_KEY: z.string().min(1),

    /**
     * Optional. Only needed if lib/ai/config.ts is switched to
     * Cohere embed-multilingual-v3.0.
     */
    COHERE_API_KEY: z.string().optional(),
  },
  client: {},
  experimental__runtimeEnv: {},
});
