import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { generationModel } from "@/lib/ai/config";
import { findRelevantContent } from "@/lib/ai/embedding";
import {
  DISCLAIMER,
  REFUSAL_ANSWER,
  SYSTEM_PROMPT,
  buildContextBlock,
} from "@/lib/ai/prompt";
import { formatCitation } from "@/lib/db/schema/provenance";

// The postgres driver needs the Node runtime — the Edge runtime cannot open a TCP socket.
export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ question: z.string().min(1).max(2000) });

/** Pull the [Quelle N] markers the model actually used, so we can audit them. */
const extractCitedIndices = (answer: string): number[] => {
  const found = new Set<number>();
  for (const m of answer.matchAll(/\[Quelle\s+(\d+)\]/gi)) {
    found.add(Number(m[1]));
  }
  return [...found].sort((a, b) => a - b);
};

export async function POST(req: Request) {
  let question: string;
  try {
    question = requestSchema.parse(await req.json()).question;
  } catch {
    return NextResponse.json(
      { error: "Ungültige Anfrage: 'question' fehlt." },
      { status: 400 },
    );
  }

  let chunks;
  try {
    chunks = await findRelevantContent(question);
  } catch (e) {
    console.error("[chat] retrieval failed:", e);
    return NextResponse.json(
      { error: "Die Wissensbasis ist derzeit nicht erreichbar." },
      { status: 503 },
    );
  }

  // ---------------------------------------------------------------------
  // REFUSAL PATH. Enforced in CODE, not merely requested in the prompt:
  // with no supporting passage the model is never called at all, so it has
  // nothing to hallucinate from. This is the core behaviour of the product.
  // ---------------------------------------------------------------------
  if (chunks.length === 0) {
    return NextResponse.json({
      question,
      answer: REFUSAL_ANSWER,
      refused: true,
      sources: [],
      citedSources: [],
      disclaimer: DISCLAIMER,
    });
  }

  const sources = chunks.map((chunk, i) => ({
    n: i + 1,
    label: formatCitation(chunk.provenance),
    title: chunk.provenance.title,
    url: chunk.provenance.source_url,
    sourceRepo: chunk.provenance.source_repo,
    retrievedAt: chunk.provenance.retrieved_at,
    licenceNote: chunk.provenance.licence_note,
    isSynthetic: chunk.provenance.is_synthetic,
    similarity: Number(chunk.similarity.toFixed(4)),
  }));

  let text: string;
  try {
    const result = await generateText({
      model: generationModel,
      system: SYSTEM_PROMPT,
      prompt: [
        `FRAGE: ${question}`,
        "",
        "AUSZÜGE AUS DER WISSENSBASIS:",
        "",
        buildContextBlock(chunks),
      ].join("\n"),
    });
    text = result.text;
  } catch (e) {
    console.error("[chat] generation failed:", e);
    return NextResponse.json(
      { error: "Die Antwortgenerierung ist fehlgeschlagen." },
      { status: 502 },
    );
  }

  // The disclaimer is appended in code so it cannot be dropped by the model.
  const answer = text.includes(DISCLAIMER) ? text : `${text}\n\n${DISCLAIMER}`;

  return NextResponse.json({
    question,
    answer,
    refused: false,
    sources,
    citedSources: extractCitedIndices(answer),
    disclaimer: DISCLAIMER,
  });
}
