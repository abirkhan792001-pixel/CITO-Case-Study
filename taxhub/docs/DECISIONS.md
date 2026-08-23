# Architecture Decision Record

Append-only. One entry per significant decision: date, options considered, the
choice, why, and — the part that matters in a walkthrough — **what would reverse it**.

Never edit a past entry to match a new reality. Append a superseding entry instead.

---

## ADR-001 — Base the build on `vercel/ai-sdk-rag-starter`, with fresh git history
**Date:** 2026-08-23 · **Status:** Accepted

**Options considered**
- **A.** Greenfield Next.js app, RAG written from scratch.
- **B.** `vercel/ai-sdk-rag-starter`, re-pointed at our providers and schema. ← chosen
- **C.** A Python stack (FastAPI / Streamlit) with a Python RAG service.

**Choice:** B. Clone the starter, delete the upstream history, `git init` fresh.

**Why:** the starter supplies the boring, error-prone half — Next.js App Router,
Drizzle wired to Postgres, pgvector migration plumbing, shadcn/Tailwind — so the
build time goes into grounding and provenance, which is what the case grades. A
fresh history keeps this a new build rather than a fork.

**Material finding, recorded honestly:** the upstream repo is the *starter* for
Vercel's RAG guide, not the finished project. It ships `app/page.tsx` returning
`Hello, world!`, no `ai` dependency, no embeddings table, and no chat route. The
"only answers from its knowledge base, otherwise refuse" behaviour is what the
guide *walks you through building* — it did not exist in the code we cloned.
So that behaviour was **implemented here**, not preserved. See ADR-005.

**What would reverse it:** if the starter's Drizzle/Next scaffolding fought the
provenance schema harder than writing it fresh, the remaining value would be near
zero — drop it and go greenfield.

---

## ADR-002 — Generation model: Anthropic Claude, replacing the starter's OpenAI
**Date:** 2026-08-23 · **Status:** Accepted

**Options considered**
- **A.** Keep OpenAI (the starter default).
- **B.** Anthropic Claude (`claude-opus-5`). ← chosen

**Choice:** B, via `@ai-sdk/anthropic`, configured in `lib/ai/config.ts`.

**Why:** the product's core behaviour is *abstention* — answer strictly from the
retrieved passages, and decline otherwise. That is a negative-instruction
following problem, and it is the behaviour we most need to be reliable, because a
single confident invented § in front of a Steuerberater ends the sale. Claude is
strong at holding that kind of hard constraint. Keeping generation and embeddings
with different vendors is also deliberate: they are independently swappable.

**What would reverse it:** measured refusal or citation failures in the Phase 4
`red-team` pass that a competing model does not exhibit.

---

## ADR-003 — Embeddings: multilingual, OpenAI `text-embedding-3-large` at 1536 dims
**Date:** 2026-08-23 · **Status:** Accepted

**Options considered**
- **A.** An English-first embedding model (the starter's default posture).
- **B.** OpenAI `text-embedding-3-large`, Matryoshka-reduced 3072 → 1536. ← chosen
- **C.** Cohere `embed-multilingual-v3.0` (1024 dims).

**Choice:** B, with C prepared as a one-line switch in `lib/ai/config.ts`.

**Why:** the entire corpus is German — statutes, BMF-Schreiben, the Kanzlei-Wiki —
so an English-first model is disqualified on the only axis that matters here.
`text-embedding-3-large` is multilingual by training and strong on formal legal
prose.

The reduction to 1536 is **forced, not stylistic**: pgvector's HNSW index supports
at most 2000 dimensions, so a native 3072-dim column could not be indexed at all
and every query would degrade to a sequential scan. 1536 keeps the index at
documented low quality loss.

**What would reverse it:** poor recall on German statute phrasing in Phase 3 →
switch to Cohere (step-by-step instructions are in `lib/ai/config.ts`). Note the
switch is a schema migration *and* a full corpus re-embed — vectors from different
models are not comparable, and mixing them silently destroys retrieval quality.

---

## ADR-004 — Provenance is a NOT NULL column on both resources and chunks
**Date:** 2026-08-23 · **Status:** Accepted

**Options considered**
- **A.** Provenance on the document only, inherited by its chunks.
- **B.** A separate provenance table joined at query time.
- **C.** A `jsonb` provenance column on **both** `resources` and `embeddings`. ← chosen

**Choice:** C, shape validated by `provenanceSchema` in
`lib/db/schema/provenance.ts`, `NOT NULL` on both tables.

**Why:** the citation shown to a user must name the paragraph the answer actually
came from — "EStG § 9 Abs. 1", not merely "EStG". Document-level provenance (A)
cannot express that, because one statute document spans many §§. A join table (B)
adds a hop to the hottest query path for no gain at this scale. `NOT NULL` makes
an uncitable chunk *structurally impossible* rather than a thing we promise not to
create.

Two fields extend the agreed eight: `title` (so `corpus/PROVENANCE.md` can be
generated mechanically) and `is_synthetic` (so simulated firm content is
distinguishable at every layer — DB, API, and UI badge).

**What would reverse it:** if provenance grew into something with its own
lifecycle — versioned licences, re-verification dates, per-source review state —
it would earn its own table.

---

## ADR-005 — The refusal is enforced in code, not only in the prompt
**Date:** 2026-08-23 · **Status:** Accepted

**Options considered**
- **A.** Instruct the model to refuse when context is weak (prompt-only).
- **B.** Pass everything retrieved and let the model judge sufficiency.
- **C.** Filter by similarity threshold; if nothing clears it, return a fixed
  German refusal and **never call the model at all**. ← chosen

**Choice:** C, in `app/api/chat/route.ts`, with `SIMILARITY_THRESHOLD` in
`lib/ai/config.ts`. The prompt *also* carries the rules — belt and braces.

**Why:** a prompt-only guard (A) is a request; this is a guarantee. If no passage
clears the threshold, the model is not invoked, so there is no generation step in
which a hallucination could occur. This is the single behaviour the case grades
hardest, and it is the most convincing thing to demo live. The disclaimer is
likewise appended in code so the model cannot drop it.

**What would reverse it:** if calibration in Phase 3 shows no single threshold
separates in-scope from out-of-scope questions, the *gate* stays but its input
changes — move to hybrid retrieval (BM25 + embeddings) with a reranker score.

---

## ADR-006 — Answer API returns JSON, not a token stream
**Date:** 2026-08-23 · **Status:** Accepted

**Options considered**
- **A.** Stream tokens via the AI SDK's chat transport and `useChat` (starter posture).
- **B.** One request → one JSON payload: `{ answer, sources, citedSources, refused }`. ← chosen

**Choice:** B.

**Why:** three reasons, in order of weight. (1) The answer and its **Quellen**
panel must arrive together — a streamed answer whose citations resolve afterwards
can show an uncited claim on screen, which is exactly the failure this product
exists to prevent. (2) The same code path serves `scripts/eval`, so what the
`citation-auditor` audits is byte-identical to what a user sees. (3) The UI the
case actually calls for is a question box with an answer and a sources panel, not
a multi-turn chat — and pinning the UI to a fast-moving streaming API is
version risk for no user-visible gain at this scale.

**What would reverse it:** answers long enough that time-to-first-token hurts the
demo. The fix is then to stream the prose while keeping the sources panel gated on
the completed payload.

---

## ADR-007 — Store: Supabase Postgres + pgvector, HNSW / cosine
**Date:** 2026-08-23 · **Status:** Accepted

**Options considered**
- **A.** A dedicated vector database (Pinecone / Qdrant / Weaviate).
- **B.** Supabase Postgres with pgvector. ← chosen

**Choice:** B. HNSW index, `vector_cosine_ops`, matching the cosine distance used
in `findRelevantContent`.

**Why:** one store for chunks, vectors **and** provenance means a retrieved row
arrives with its citation already attached — no second lookup that could
desynchronise an answer from its source. It is also the account the project
already has, which keeps deploy a one-step affair. At MVP corpus size a dedicated
vector DB buys nothing.

**Operational note:** the index opclass and the query distance function must stay
in agreement. Changing one without the other silently degrades retrieval to
nonsense ranking rather than producing an error.

**What would reverse it:** corpus growth into the millions of chunks, or a need
for filtered ANN search that pgvector handles poorly.

---

## Still open — owed by the Phase 1 stress test

- **Retrieval strategy** (naive fixed-size chunks vs. hybrid BM25 + embeddings vs.
  section-aware chunking carrying citation spans). Current code implements
  paragraph-boundary chunking as the working default; this is **not yet an ADR**.
- **Corpus scope** — which mix of {statutes, BMF-Schreiben, synthetic wiki} buys
  the most recognisable value for the least ingest effort.
- **Deployment target** — Vercel is the presumption given the stack, not yet decided.
