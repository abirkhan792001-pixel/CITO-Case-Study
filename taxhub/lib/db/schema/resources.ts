import { sql } from "drizzle-orm";
import { text, varchar, timestamp, pgTable, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";

import { nanoid } from "@/lib/utils";
import { provenanceSchema, type Provenance } from "./provenance";
import { jsonbObject } from "./jsonb";

/**
 * A `resource` is one whole source document: a statute section, a BMF-Schreiben,
 * or one page of the (clearly-labelled) synthetic Kanzlei-Wiki.
 * It is chunked into rows of the `embeddings` table for retrieval.
 */
export const resources = pgTable("resources", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  content: text("content").notNull(),

  /** Document-level provenance. NOT NULL by design — no document without a source. */
  provenance: jsonbObject<Provenance>("provenance").notNull(),

  /**
   * Denormalised copy of provenance.is_synthetic so "show me everything real"
   * is a plain indexed boolean rather than a JSON traversal.
   */
  isSynthetic: boolean("is_synthetic").notNull().default(false),

  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`now()`),
});

/**
 * Validates an incoming resource. Provenance is REQUIRED: the ingest path cannot
 * store a document that has no recorded source and licence note.
 */
export const insertResourceSchema = z.object({
  content: z.string().min(1),
  provenance: provenanceSchema,
});

export type NewResourceParams = z.infer<typeof insertResourceSchema>;
