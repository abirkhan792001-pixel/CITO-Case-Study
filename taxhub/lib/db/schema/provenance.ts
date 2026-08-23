import { z } from "zod";

/**
 * Provenance — attached to every resource AND every chunk.
 *
 * Non-negotiable for this project: an answer is only trustworthy if we can show
 * exactly which document, which paragraph, which URL, retrieved when, pinned to
 * which revision, and under what licence. A chunk without provenance must never
 * reach the answer layer.
 */
export const provenanceSchema = z.object({
  /** Full statute name, e.g. "Einkommensteuergesetz". Null for wiki pages. */
  gesetz: z.string().nullable(),
  /** Official abbreviation (amtabk), e.g. "EStG", "UStG", "AO". Null for wiki. */
  abkuerzung: z.string().nullable(),
  /** Section identifier, e.g. "§ 9". Null when not a statute. */
  paragraph: z.string().nullable(),
  /** Sub-section, e.g. "Abs. 1". Null when the whole § is one chunk. */
  absatz: z.string().nullable(),

  /** Canonical link back to the source. Repo-relative path for synthetic docs. */
  source_url: z.string().min(1),
  /** Where it came from, e.g. "jandinter/gesetze-im-internet" or "synthetic". */
  source_repo: z.string().min(1),
  /**
   * Exact upstream revision the text was taken from. Pins the corpus to a
   * verifiable point in history — without it "we ingested the AO" is unfalsifiable.
   * Null for synthetic content, which has no upstream.
   */
  commit_sha: z.string().nullable(),
  /** ISO-8601 date this pipeline retrieved the document. */
  retrieved_at: z.string().min(1),
  /** Licence / terms-of-use finding recorded BEFORE ingest. Never blank. */
  licence_note: z.string().min(1),

  /**
   * The upstream XML `builddate` — when the FEDERAL MINISTRY last rebuilt this
   * statute, which is the only honest "Stand:" to show a Steuerberater.
   * Distinct from retrieved_at: a document fetched today can carry law from
   * eighteen months ago. Cited-but-stale is a real failure mode in tax.
   */
  stand: z.string().nullable(),

  /** Human-readable document title, for the Quellen panel and PROVENANCE.md. */
  title: z.string().min(1),
  /** TRUE for the simulated Kanzlei-Wiki. Surfaced in the UI — never hidden. */
  is_synthetic: z.boolean(),
});

export type Provenance = z.infer<typeof provenanceSchema>;

/** Short citation label for the UI, e.g. "EStG § 9 Abs. 1" or a wiki title. */
export const formatCitation = (p: Provenance): string => {
  const statute = [p.abkuerzung, p.paragraph, p.absatz].filter(Boolean).join(" ");
  return statute.length > 0 ? statute : p.title;
};

/** The date to show as "Stand:" — the law's own build date beats our fetch date. */
export const standDate = (p: Provenance): string => p.stand ?? p.retrieved_at;
