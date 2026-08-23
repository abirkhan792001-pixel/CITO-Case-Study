import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env.mjs";

/**
 * `prepare: false` is REQUIRED, not an optimisation choice.
 *
 * Supabase's shared pooler runs in transaction mode on port 6543, and
 * transaction-mode pooling cannot support prepared statements — a prepared
 * statement is bound to one backend connection, while transaction mode hands
 * out a different backend per transaction. postgres.js prepares by default, so
 * leaving this on produces intermittent "prepared statement does not exist"
 * errors under concurrency: it works in local testing and fails in production.
 *
 * Harmless on a direct or session-mode connection, so it is set unconditionally
 * rather than sniffed from the port — one behaviour in every environment.
 */
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client);
