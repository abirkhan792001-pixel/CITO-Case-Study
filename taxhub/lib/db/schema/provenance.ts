import { z } from "zod";

/**
 * Provenance — attached to every resource AND every chunk.
 *
 * Non-negotiable for this project: an answer is only trustworthy if we can show
 * exactly which document, which paragraph, which URL, retrieved when, and under
 * what licence. A chunk without provenance must never reach the answer layer.
 *
 * The eight core fields are the agreed contract. `title` and `is_synthetic` are
 * additions: `title` so corpus/PROVENANCE.md can be generated mechanically, and
 * `is_synthetic` because the case requires real and simulated content to be
 * distinguishable at a glance, everywhere. See docs/DECISIONS.md ADR-004.
 */
export const provenanceSchema = z.object({
  /** Full statute name, e.g. "Einkommensteuergesetz". Null for wiki pages. */
  gesetz: z.string().nullable(),
  /** Official abbreviation, e.g. "EStG", "UStG", "AO". Null for wiki pages. */
  abkuerzung: z.string().nullable(),
  /** Section identifier, e.g. "§ 9". Null when not a statute. */
  paragraph: z.string().nullable(),
  /** Sub-section, e.g. "Abs. 1 Satz 3". Null when not applicable. */
  absatz: z.string().nullable(),
  /** Canonical link back to the source. Repo-relative path for synthetic docs. */
  source_url: z.string().min(1),
  /** Where it came from, e.g. "gesetze-im-internet.de" or "corpus/synthetic". */
  source_repo: z.string().min(1),
  /** ISO-8601 date the document was retrieved. Drives the "Stand:" label in the UI. */
  retrieved_at: z.string().min(1),
  /** Licence / terms-of-use finding recorded BEFORE ingest. Never left blank. */
  licence_note: z.string().min(1),

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
