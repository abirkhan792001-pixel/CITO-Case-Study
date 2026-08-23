import { env } from "@/lib/env.mjs";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const runMigrate = async () => {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
  }

  // max: 1 so migrations run in order on a single connection.
  // prepare: false for the same reason as lib/db/index.ts — Supabase's
  // transaction-mode pooler (port 6543) cannot support prepared statements.
  const connection = postgres(env.DATABASE_URL, { max: 1, prepare: false });

  const db = drizzle(connection);

  console.log("⏳ Running migrations...");

  const start = Date.now();

  await migrate(db, { migrationsFolder: "lib/db/migrations" });

  const end = Date.now();

  console.log("✅ Migrations completed in", end - start, "ms");

  process.exit(0);
};

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
