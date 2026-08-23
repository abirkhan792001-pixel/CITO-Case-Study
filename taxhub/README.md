# TaxHub

Grounded, source-cited German Q&A over a Steuerkanzlei's knowledge — statutes plus
the firm's own material. Every answer names its sources. When no source carries the
answer, it says so instead of guessing.

**Status: Phase 0 — bootstrap. The knowledge base is empty by design.**
Every question is currently refused. That is the expected behaviour at this gate,
not a bug.

---

## What is real vs synthetic vs assumed

Stated up front, because the whole premise of this project is not overclaiming.

| | Current state |
|---|---|
| **Real content** | **None ingested yet.** Planned for Phase 2: EStG / UStG / AO sections, a small set of BMF-Schreiben, GoBD — each subject to a licence + `robots.txt` check *before* download. |
| **Synthetic content** | **None yet.** Planned: 8–12 short Kanzlei-Wiki documents under `corpus/synthetic/`. Simulated firm content, labelled `SIMULIERT` in the UI and `is_synthetic: true` in the database. Never presented as real. |
| **Assumed** | Everything in [`ASSUMPTIONS.md`](./ASSUMPTIONS.md), with a confidence and a flip condition for each. Figures taken from the case brief are marked to-be-verified, not fact. |

Provenance for every ingested document lives in
[`corpus/PROVENANCE.md`](./corpus/PROVENANCE.md).

## How the grounding actually works

1. The question is embedded and matched against chunk vectors (pgvector, HNSW, cosine).
2. Chunks below `SIMILARITY_THRESHOLD` are discarded.
3. **If nothing clears the threshold, the model is never called.** A fixed German
   refusal is returned. There is no generation step in which a hallucination could
   occur — the guarantee is structural, not a prompt request.
4. Otherwise the surviving chunks are passed to Claude with a German system prompt
   requiring an inline `[Quelle N]` citation on every substantive claim.
5. The disclaimer is appended **in code**, so the model cannot drop it.
6. The response returns the answer *and* its sources together, so the UI can never
   show a claim whose citation has not yet resolved.

`provenance` is `NOT NULL` on both tables — an uncitable chunk is structurally
impossible, not merely discouraged.

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind — based on `vercel/ai-sdk-rag-starter`, fresh history
- **Generation:** Anthropic Claude (`claude-opus-5`) — replaces the starter's OpenAI default
- **Embeddings:** OpenAI `text-embedding-3-large` at 1536 dims (multilingual), with a one-line switch to Cohere `embed-multilingual-v3.0`
- **Store:** Supabase Postgres + pgvector

All model configuration is in `lib/ai/config.ts` — a provider swap is one file.

## Run locally

```bash
pnpm install
cp .env.example .env      # then fill in real values
pnpm db:migrate           # creates the pgvector extension, tables and HNSW index
pnpm dev                  # http://localhost:3000
```

Required in `.env`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string |
| `ANTHROPIC_API_KEY` | Answer generation |
| `OPENAI_API_KEY` | Embeddings |
| `COHERE_API_KEY` | Optional — only if switched to Cohere embeddings |

`.env` is gitignored. Secrets belong in `.env` locally and in the host's environment
panel in production — never in the repo.

`GET /api/status` reports the live corpus size and doubles as the database liveness
probe.

## Repo map

```
app/api/chat/     the grounded answer route — refusal enforced here
app/api/status/   corpus size + DB liveness
lib/ai/           config (providers, threshold), embedding/retrieval, German prompt
lib/db/schema/    resources, embeddings, provenance (NOT NULL on both tables)
corpus/           PROVENANCE.md + synthetic/ (simulated firm content)
docs/DECISIONS.md architecture decisions, each with a reversal condition
CLAUDE.md         the rules this repo is built under
ASSUMPTIONS.md    open assumptions, confidence, and what would flip them
```

## Disclaimer

Kein Ersatz für steuerliche Beratung.
