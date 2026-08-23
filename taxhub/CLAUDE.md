# TaxHub — working rules

Grounded, source-cited Q&A over real German tax material plus a clearly-labelled
synthetic Kanzlei-Wiki, for owners of 15–60 person Steuerkanzleien.

These rules are binding for every change in this repo. If a change cannot satisfy
them, the change is wrong — not the rule.

---

## The five non-negotiables

### 1. Product answers are in GERMAN
The UI, the answers, the refusal text and the disclaimer are German. A Kanzlei's
tool that speaks English does not feel like their tool.
**Code, comments, commit messages, ADRs and all repo documentation stay ENGLISH.**

### 2. Grounded only — refuse when no source carries the answer
The assistant answers **exclusively** from retrieved passages. It must never fall
back on the model's general tax knowledge, however confident it feels.

This is enforced in **code**, not merely requested in the prompt: when no chunk
clears `SIMILARITY_THRESHOLD`, `app/api/chat/route.ts` returns `REFUSAL_ANSWER`
and **never calls the model at all** — so there is nothing to hallucinate from.
Any change that lets an unsupported question reach the model is a regression.

**The refusal is the feature.** It is what separates this from a chatbot, and it
is the single most convincing thing to demo. Never soften it into a hedged guess.

### 3. Every chunk carries provenance
`provenance` is `NOT NULL` on both `resources` and `embeddings`. No document and
no chunk enters the knowledge base without:

```
{ gesetz, abkuerzung, paragraph, absatz,
  source_url, source_repo, retrieved_at, licence_note,
  title, is_synthetic }
```

Rules that follow from this:
- **Licence first.** Check terms of use / robots *before* download. If reuse is
  unclear or prohibited, store the document **link-only** — citation and URL, no
  reproduced full text. Record the finding in `licence_note`; never leave it blank.
- **Prefer official structured exports** (e.g. statute XML) over HTML scraping.
- **Synthetic content is labelled everywhere** — `is_synthetic: true`, filed under
  `corpus/synthetic/`, and badged **SIMULIERT** in the UI. Never let simulated
  firm content read as real.
- Every ingested document is listed in `corpus/PROVENANCE.md`.

### 4. Every number is sourced or marked "Assumption:"
In the one-pager, the README, the UI, and every document in this repo: a figure is
either backed by a real source with a link, or written inline as `Assumption: …`.
**No naked numbers.** Figures from the case brief are *not* verified facts — mark
them as brief figures to be validated.
Open assumptions live in `ASSUMPTIONS.md` with a confidence and a flip condition.

### 5. Ship live at every gate
Never end a session with the build broken. Each phase ends at a gate that must
pass before the next begins. A live, simple app beats a broken, clever one.

---

## Definition of done, per phase

| Phase | Done when |
|---|---|
| 0 Bootstrap | Repo + rules + agents exist; app boots; DB connected; pgvector on; **no corpus yet** |
| 1 Decisions | `docs/DECISIONS.md` holds an ADR per major choice, each with a reversal condition |
| 2 Ingest | `corpus/PROVENANCE.md` lists every doc with a licence note; synthetic segregated |
| 3 Retrieval | 5 real questions return relevant passages carrying correct § identifiers |
| 4 Answers | Every answered question cites ≥1 retrieved chunk; out-of-corpus questions refuse |
| 5 UI | Seed questions answer with sources; refusal visible on an out-of-scope question |
| 6 Live | Public URL works from incognito; README honest about real vs synthetic vs assumed |

---

## Architecture, briefly

- **Next.js 14 App Router**, TypeScript, Tailwind. Base: `vercel/ai-sdk-rag-starter`
  (fresh git history — this is a new build, not a fork).
- **Generation: Anthropic Claude** (`claude-opus-5`) — swapped from the starter's
  OpenAI default. ADR-002.
- **Embeddings: multilingual**, OpenAI `text-embedding-3-large` at 1536 dims, with
  a documented one-line switch to Cohere `embed-multilingual-v3.0`. ADR-003.
- **Store: Supabase Postgres + pgvector**, HNSW / cosine. ADR-007.
- **All model config lives in `lib/ai/config.ts`** — a provider swap is one file.

## Conventions

- Retrieval and generation knobs belong in `lib/ai/config.ts`, never inline.
- Changing `EMBEDDING_DIMENSIONS` is a migration **and** a full corpus re-embed;
  vectors from different models are not comparable.
- Secrets only ever in `.env` (gitignored) and in the host's env panel. Never in
  the repo, never in a commit, never in a screenshot.
- Every significant decision gets an ADR in `docs/DECISIONS.md`: date, options,
  choice, why, and **what would reverse it**. Append-only.
