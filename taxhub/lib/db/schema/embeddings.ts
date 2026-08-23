import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
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

    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),

    /** Chunk-level provenance. NOT NULL — an uncitable chunk is a bug, not a row. */
    provenance: jsonb("provenance").$type<Provenance>().notNull(),

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
  }),
);
