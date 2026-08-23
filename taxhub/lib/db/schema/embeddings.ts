import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

import { nanoid } from "@/lib/utils";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai/embedding-config";
import { resources } from "./resources";
import { type Provenance } from "./provenance";
import { jsonbObject } from "./jsonb";

/**
 * One retrievable chunk. Every row carries its OWN provenance, because a single
 * statute document spans many paragraphs and the citation shown to the user must
 * name the paragraph the answer actually came from — not just the document.
 */
export const embeddings = pgTable(
  "embeddings",
  {
    id: varchar("id", { length: 191 })
      .primaryKey()
      .$defaultFn(() => nanoid()),

    resourceId: varchar("resource_id", { length: 191 })
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),

    content: text("content").notNull(),

    /**
     * NULLABLE by necessity, not by preference.
     *
     * Semantic retrieval is the intended design (ADR-003), but embeddings require
     * an API key this deployment does not have. Rather than block ingestion or
     * fabricate vectors, chunks are stored without one and retrieved by German
     * full-text search until a key exists. A fake vector would be far worse than
     * a null: it would look like semantic retrieval while behaving randomly.
     * See ADR-013.
     */
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),

    /** Chunk-level provenance. NOT NULL — an uncitable chunk is a bug, not a row. */
    provenance: jsonbObject<Provenance>("provenance").notNull(),

    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    /** HNSW + cosine: the distance metric must match the query in lib/ai/embedding.ts. */
    embeddingIndex: index("embedding_index").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    resourceIdx: index("embeddings_resource_id_idx").on(table.resourceId),

    /**
     * GIN index over the GERMAN text-search vector of the chunk. The 'german'
     * configuration matters: it stems "Werbungskosten" to "werbungskost" and
     * "aufzubewahren" to "aufbewahr", which is what lets a practitioner's
     * phrasing reach statute language. The 'english' config would not.
     * Must match the configuration used in lib/ai/keyword.ts.
     */
    contentSearchIndex: index("embeddings_content_de_idx").using(
      "gin",
      sql`to_tsvector('german', ${table.content})`,
    ),
  }),
);
