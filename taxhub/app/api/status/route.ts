import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { embeddings } from "@/lib/db/schema/embeddings";
import { resources } from "@/lib/db/schema/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Corpus status. Doubles as the liveness probe for the database connection —
 * the UI uses it to state plainly how big the knowledge base is, which keeps the
 * "grounded, not a demo" claim checkable rather than asserted.
 */
export async function GET() {
  try {
    const [{ count: resourceCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources);
    const [{ count: chunkCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(embeddings);
    const [{ count: syntheticCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(sql`${resources.isSynthetic} = true`);

    return NextResponse.json({
      connected: true,
      resourceCount,
      chunkCount,
      syntheticCount,
      realCount: resourceCount - syntheticCount,
    });
  } catch (e) {
    console.error("[status] db unreachable:", e);
    return NextResponse.json(
      { connected: false, error: "Datenbank nicht erreichbar." },
      { status: 503 },
    );
  }
}
