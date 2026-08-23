# Corpus provenance

Every document in the knowledge base, with where it came from, when it was
retrieved, and under what terms. Generated and maintained by the
`ingest-provenance` agent — see `.claude/agents/ingest-provenance.md`.

> **Status: EMPTY — nothing has been ingested yet.**
> Phase 0 is bootstrap only. The table below is the scaffold that Phase 2 fills.

## Rules this table exists to enforce

1. **Licence check happens BEFORE download.** Terms of use and `robots.txt` are
   checked first. If reuse is unclear or prohibited, the document is recorded
   **link-only**: citation and URL, no reproduced full text.
2. **`licence_note` is never blank.** "Not yet checked" is not a licence note; it
   is a blocker.
3. **Official structured exports beat scraping.** Prefer statute XML over HTML.
4. **Synthetic content is segregated and labelled** — filed under
   `corpus/synthetic/`, `is_synthetic: true`, badged **SIMULIERT** in the UI.

## Ingested documents

| # | Title | Gesetz / Abk. | § / Abs. | Source repo | URL | Retrieved | Licence note | Mode | Synthetic? |
|---|-------|---------------|----------|-------------|-----|-----------|--------------|------|------------|
| _(none yet — Phase 2 populates this table)_ | | | | | | | | | |

**Mode** is `full-text` (reuse permitted, text stored and chunked) or `link-only`
(reuse unclear or prohibited — citation and link stored, no reproduced text).

## Downgraded to link-only

| Source | Why | What we store instead |
|--------|-----|----------------------|
| _(none yet)_ | | |

## Sources evaluated and rejected

| Source | Reason for rejection |
|--------|---------------------|
| _(none yet)_ | |
