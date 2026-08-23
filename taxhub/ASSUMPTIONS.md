# Assumptions register

Every open assumption behind TaxHub, with a confidence, how to verify it, and what
would flip it. The case rewards **defensible** assumptions and clearly marked
uncertainty over flattering ones.

> **Rule (enforced repo-wide):** any number in any deliverable is either
> (a) backed by a real source with a link, or (b) written as `Assumption:` in
> plain sight. No naked numbers.

**Status legend:** 🔴 unverified · 🟡 partially verified · 🟢 verified with a link

| # | Assumption | Confidence | Status | Basis / how to verify | What would flip it |
|---|---|---|---|---|---|
| A1 | Public German tax statutes (EStG, UStG, AO) are usable as an ingestible corpus with attribution | High | 🟢 | **VERIFIED in Phase 2.** Statutes are amtliche Werke, exempt from copyright under § 5 UrhG. All three ingested from official XML via the maintained mirror, pinned to commit `3982ae47`. Recorded in corpus/PROVENANCE.md | Terms prohibit reuse → switch to summarising/linking only, or use a licensed dataset |
| A2 | BMF-Schreiben (ministry letters) are publicly available and citable | Med | 🔴 | bundesfinanzministerium.de publishes them. **Verify reuse terms before ingest** | Reuse restricted → cite by reference + link instead of reproducing full text |
| A3 | A *synthetic* "Kanzlei-Wiki" is an acceptable stand-in for a firm's private docs in an MVP | High | 🟡 | We cannot obtain a real firm's private documents for a case study; labelling it simulated is the honest move. Enforced by `is_synthetic` + the SIMULIERT badge | Interviewer wants real firm docs → offer to ingest theirs live in the walkthrough |
| A4 | The buyer's pain is time lost to repetitive intake + junior staff re-answering the same questions from regulations | Med | 🔴 | Consistent with the fragmentation + staffing-shortage framing in the brief. **State as a hypothesis to test in the Loom's first 60 seconds** — do not assert it to the buyer | Discovery surfaces a different top pain → reframe the value story |
| A5 | Market sizing figures (≈90k Steuerberater; ≈1M+ Handwerk businesses; ≈6M employees) are directionally correct | Med | 🔴 | These come from the **case brief itself**. Treat as *to-be-verified*, not fact. The one-pager phase audits them against Destatis / BStBK | Verified sources differ → correct the one-pager and note the discrepancy |
| A6 | Willingness to pay exists for a tool that saves billable hours | Med-High | 🔴 | Kanzleien monetise time directly; incumbents already extract SaaS budget | Discovery shows no budget authority / no urgency → adjust ICP to larger firms |
| A7 | A cosine-similarity threshold of `0.35` correctly separates "supported" from "refuse" | Low | 🔴 | Chosen as a starting value with **no corpus to tune against yet**. Must be calibrated in Phase 3 against the seed question set — the 2 out-of-scope questions must refuse and the 5 in-scope ones must not | Calibration shows false refusals or false answers → retune; if no single value separates them, move to hybrid retrieval + reranking |
| A8 | `text-embedding-3-large` retrieves German statute language well enough at 1536 dimensions | Med | 🔴 | Multilingual by training; Matryoshka reduction 3072→1536 is documented as low-loss. Reduction is forced by pgvector's 2000-dim HNSW ceiling (ADR-003) | Recall on German legal phrasing disappoints in Phase 3 → switch to Cohere `embed-multilingual-v3.0` (one-line switch already prepared in `lib/ai/config.ts`) |
| A9 | Paragraph-boundary chunking preserves citability for statutes | High | 🟢 | **VERIFIED in Phase 2.** The XML is structured by `<norm>` (one §) and `<P>` (one Absatz); 2,283 statute chunks were produced and every one carries a § identifier. Spot-checked against EStG § 9, UStG § 19, AO § 147 | Statute XML structure turns out irregular for a law we add later |
| A10 | The corpus reflects **current** German tax law | **LOW** | 🔴 **KNOWN FALSE TODAY** | The mirror's last commit is 2025-04-02 and the XML build dates are Feb 2025, so the corpus is roughly 18 months stale as of 2026-08-23. Every chunk carries its true `stand` date and the UI displays it | Re-ingest from live gesetze-im-internet.de XML. **This must happen before any real-world use** — a confidently cited but repealed provision is exactly the failure this product exists to prevent |
| A11 | The synthetic wiki does not assert tax law | High | 🟢 | Deliberate: the 10 wiki documents describe firm **process** (onboarding, fristen, belegablage, honorar) and point at statutes rather than restating thresholds. Inventing a plausible-but-wrong threshold would be indistinguishable from a hallucination to a reader | A wiki doc is later written with substantive legal claims — then it needs the same sourcing discipline as a statute |

---

## What is real vs synthetic vs assumed (current state)

As of Phase 2 (corpus built, **not yet embedded** — see the gate report):

- **Real content:** 2,283 chunks from three statutes — EStG (904), UStG (413),
  AO (966) — taken from official gesetze-im-internet.de XML via the maintained
  mirror, pinned to commit `3982ae47`. Gemeinfrei under § 5 UrhG. **Stand:
  February 2025, not today** (see A10).
- **Synthetic content:** 57 chunks from 10 SIMULATED Kanzlei-Wiki documents under
  `corpus/synthetic/`. Every file carries a "SIMULIERTER KANZLEI-INHALT — NICHT
  ECHT" header, every chunk carries `is_synthetic: true`, and the UI badges them
  SIMULIERT. The ingest pipeline **refuses** to ingest an unlabelled file.
- **Assumed:** everything in the table above.

This section is updated at every phase gate.
