/**
 * Build the TaxHub corpus: statute XML + synthetic firm wiki -> chunk JSON.
 *
 *   pnpm corpus:build
 *
 * Deliberately SEPARATE from embedding (scripts/embed-corpus.ts). Parsing and
 * chunking need no API key and no network, so they stay reviewable and rerunnable
 * on their own — and the chunk file becomes an inspectable artefact you can diff
 * before anything is written to a database.
 *
 * Fails loudly. A statute whose title does not match what we expected is a hard
 * stop, not a warning: ingesting the wrong law would poison every citation.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import type { Provenance } from "../lib/db/schema/provenance";
import {
  childrenOf,
  descend,
  findAll,
  parser,
  renderText,
  textAt,
  tidy,
  type Node,
} from "./corpus/xml";
import { writeProvenanceDoc } from "./corpus/provenance-doc";

/* -------------------------------------------------------------------------- */
/*  Configuration                                                             */
/* -------------------------------------------------------------------------- */

/** Where the sparse checkout of the mirror lives. Override with GII_REPO. */
const REPO = process.env.GII_REPO ?? join(process.cwd(), ".gii-mirror");

const OUT_DIR = join(process.cwd(), "corpus", "chunks");
const SYNTHETIC_DIR = join(process.cwd(), "corpus", "synthetic");

/**
 * Statutes are amtliche Werke and carry no copyright; gesetze-im-internet.de
 * publishes the XML for third-party use. The exemption covers the statute text
 * only — not commercial or derived commentary, none of which is in scope here.
 */
const STATUTE_LICENCE = "§ 5 UrhG – amtliches Werk, gemeinfrei";

const SYNTHETIC_LICENCE =
  "Synthetisch erzeugter Demo-Inhalt, kein Fremdmaterial - frei verwendbar";

/**
 * Only these three. `expect*` are assertions, not labels: the build aborts if the
 * XML does not identify itself as the law we intended to ingest.
 */
const STATUTES = [
  {
    slug: "estg",
    file: "gesetze/estg/estg.xml",
    expectAbk: "EStG",
    expectTitle: "Einkommensteuergesetz",
  },
  {
    slug: "ustg_1980",
    file: "gesetze/ustg_1980/ustg_1980.xml",
    expectAbk: "UStG",
    expectTitle: "Umsatzsteuergesetz",
  },
  {
    slug: "ao_1977",
    file: "gesetze/ao_1977/ao_1977.xml",
    expectAbk: "AO",
    expectTitle: "Abgabenordnung",
  },
] as const;

/**
 * A section shorter than this stays one chunk. Longer, and it splits per Absatz.
 * Chosen so a typical section survives intact — splitting costs context, and a
 * chunk that begins mid-argument cannot be cited honestly.
 */
const MAX_SINGLE_CHUNK = 1800;
/** Below this a section is a repeal stub like "(weggefallen)" - not retrievable. */
const MIN_CHUNK_CHARS = 40;

/* -------------------------------------------------------------------------- */

export type ChunkRecord = { content: string; provenance: Provenance };
export type DocumentRecord = {
  content: string;
  provenance: Provenance;
  chunks: ChunkRecord[];
};

const today = () => new Date().toISOString().slice(0, 10);

const fail = (msg: string): never => {
  console.error(`\nABORT: ${msg}\n`);
  process.exit(1);
};

/** yyyymmddhhmmss -> yyyy-mm-dd */
const formatBuildDate = (raw: string | undefined): string | null =>
  raw && raw.length >= 8
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : null;

const repoCommitSha = (): string => {
  try {
    return execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return fail(
      `cannot read the commit SHA of the mirror at ${REPO}. ` +
        "Without it the corpus is not pinned to a verifiable revision. " +
        "Clone it first, or set GII_REPO.",
    );
  }
};

/* -------------------------------------------------------------------------- */
/*  Statutes                                                                  */
/* -------------------------------------------------------------------------- */

/** Split a rendered section into (Absatz label, text) blocks. */
const splitAbsaetze = (
  text: string,
): Array<{ absatz: string | null; text: string }> => {
  const blocks: Array<{ absatz: string | null; text: string }> = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^\((\d+[a-z]?)\)\s*/);
    if (m) {
      blocks.push({ absatz: `Abs. ${m[1]}`, text: line });
    } else if (blocks.length > 0) {
      // Continuation (list item, table row) - belongs to the Absatz above it.
      blocks[blocks.length - 1].text += "\n" + line;
    } else {
      blocks.push({ absatz: null, text: line });
    }
  }
  return blocks;
};

const buildStatute = (
  cfg: (typeof STATUTES)[number],
  commitSha: string,
): DocumentRecord => {
  const path = join(REPO, cfg.file);
  if (!existsSync(path)) {
    fail(
      `${cfg.expectAbk}: XML not found at ${path}. Nothing was invented - fetch the source first.`,
    );
  }

  const tree = parser.parse(readFileSync(path, "utf8")) as Node[];
  const dokumente = findAll(tree, "dokumente")[0];
  if (!dokumente) fail(`${cfg.expectAbk}: no <dokumente> root in ${cfg.file}`);

  const buildDate = formatBuildDate(
    (dokumente[":@"] as Record<string, string>)?.["@_builddate"],
  );
  const norms = findAll(childrenOf(dokumente), "norm");
  if (norms.length === 0) fail(`${cfg.expectAbk}: no <norm> elements found`);

  // --- Identity check. Wrong law -> hard stop. ---
  const headMeta = childrenOf(norms[0]);
  const amtabk = textAt(headMeta, ["metadaten", "amtabk"]);
  const langue = textAt(headMeta, ["metadaten", "langue"]);
  if (amtabk !== cfg.expectAbk || langue !== cfg.expectTitle) {
    fail(
      `${cfg.file} identifies itself as "${amtabk}" / "${langue}", but we expected ` +
        `"${cfg.expectAbk}" / "${cfg.expectTitle}". Refusing to ingest.`,
    );
  }

  // The mirror derives each folder slug from the gesetze-im-internet URL path
  // (see scraper.rb: short_name = Pathname.new(uri.path).dirname), so this
  // law-level URL is verified by that mapping rather than guessed.
  const sourceUrl = `https://www.gesetze-im-internet.de/${cfg.slug}/`;

  const base = {
    gesetz: langue,
    abkuerzung: amtabk,
    source_url: sourceUrl,
    source_repo: "jandinter/gesetze-im-internet",
    commit_sha: commitSha,
    retrieved_at: today(),
    licence_note: STATUTE_LICENCE,
    stand: buildDate,
    is_synthetic: false,
  };

  const chunks: ChunkRecord[] = [];
  const fullText: string[] = [];

  for (const norm of norms) {
    const kids = childrenOf(norm);
    const enbez = textAt(kids, ["metadaten", "enbez"]);
    if (!enbez.startsWith("§")) continue; // headers, TOC, footnotes

    const titel = textAt(kids, ["metadaten", "titel"]);
    const contentNodes = descend(kids, ["textdaten", "text"]);
    if (!contentNodes) continue;
    const body = tidy(renderText(contentNodes));
    if (body.length < MIN_CHUNK_CHARS) continue; // repeal stubs

    const heading = titel ? `${enbez} ${titel}` : enbez;
    fullText.push(`${heading}\n${body}`);

    const blocks = splitAbsaetze(body);
    const shouldSplit = body.length > MAX_SINGLE_CHUNK && blocks.length > 1;

    if (!shouldSplit) {
      chunks.push({
        content: `${heading}\n\n${body}`,
        provenance: { ...base, paragraph: enbez, absatz: null, title: heading },
      });
      continue;
    }

    for (const block of blocks) {
      if (block.text.length < MIN_CHUNK_CHARS) continue;
      const label = block.absatz ? `${heading}, ${block.absatz}` : heading;
      chunks.push({
        // Heading repeated on every chunk so a retrieved fragment always
        // announces which section it came from, even out of context.
        content: `${heading}\n\n${block.text}`,
        provenance: {
          ...base,
          paragraph: enbez,
          absatz: block.absatz,
          title: label,
        },
      });
    }
  }

  if (chunks.length === 0) {
    fail(`${cfg.expectAbk}: produced 0 chunks - parsing is broken`);
  }

  return {
    content: fullText.join("\n\n"),
    provenance: {
      ...base,
      paragraph: null,
      absatz: null,
      title: `${langue} (${amtabk})`,
    },
    chunks,
  };
};

/* -------------------------------------------------------------------------- */
/*  Synthetic firm wiki                                                       */
/* -------------------------------------------------------------------------- */

const SYNTHETIC_MARKER = "SIMULIERTER KANZLEI-INHALT";

const buildSynthetic = (): DocumentRecord[] => {
  const files = readdirSync(SYNTHETIC_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (files.length === 0) fail(`no synthetic documents found in ${SYNTHETIC_DIR}`);

  return files.map((file) => {
    const raw = readFileSync(join(SYNTHETIC_DIR, file), "utf8");

    // Refuse to ingest unlabelled simulated content - it must never read as real.
    if (!raw.includes(SYNTHETIC_MARKER)) {
      fail(`${file} is missing the "${SYNTHETIC_MARKER}" label. Refusing to ingest.`);
    }

    const title = (raw.match(/^#\s+(.+)$/m)?.[1] ?? basename(file, ".md")).trim();
    const base = {
      gesetz: null,
      abkuerzung: null,
      source_url: `corpus/synthetic/${file}`,
      source_repo: "synthetic",
      commit_sha: null,
      retrieved_at: today(),
      licence_note: SYNTHETIC_LICENCE,
      stand: today(),
      is_synthetic: true,
    };

    // Chunk on markdown headings - the document's own structure, same principle
    // as chunking statutes on their sections.
    const sections = raw
      .split(/\n(?=##\s)/)
      .map((s) => tidy(s))
      .filter((s) => s.length >= MIN_CHUNK_CHARS);

    const chunks: ChunkRecord[] = sections.map((section) => {
      const sub = section.match(/^##\s+(.+)$/m)?.[1]?.trim();
      return {
        content: sub ? `${title} - ${sub}\n\n${section}` : section,
        provenance: {
          ...base,
          paragraph: null,
          absatz: null,
          title: sub ? `${title} - ${sub}` : title,
        },
      };
    });

    return {
      content: raw,
      provenance: { ...base, paragraph: null, absatz: null, title },
      chunks,
    };
  });
};

/* -------------------------------------------------------------------------- */

const main = () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const commitSha = repoCommitSha();
  console.log(`\nBuilding corpus from mirror @ ${commitSha.slice(0, 12)}\n`);

  const docs: DocumentRecord[] = [];

  for (const cfg of STATUTES) {
    const doc = buildStatute(cfg, commitSha);
    docs.push(doc);
    console.log(
      `  ${(doc.provenance.abkuerzung ?? "").padEnd(6)}` +
        `${String(doc.chunks.length).padStart(5)} chunks  ` +
        `Stand ${doc.provenance.stand}  ${doc.provenance.title}`,
    );
  }

  const synthetic = buildSynthetic();
  docs.push(...synthetic);
  console.log(
    `  WIKI  ${String(
      synthetic.reduce((n, d) => n + d.chunks.length, 0),
    ).padStart(5)} chunks  across ${synthetic.length} SIMULATED documents`,
  );

  const payload = { builtAt: new Date().toISOString(), commitSha, documents: docs };
  const out = join(OUT_DIR, "corpus.json");
  writeFileSync(out, JSON.stringify(payload, null, 2));

  writeProvenanceDoc(docs, commitSha);

  const total = docs.reduce((n, d) => n + d.chunks.length, 0);
  const digest = createHash("sha256")
    .update(docs.flatMap((d) => d.chunks.map((c) => c.content)).join(" "))
    .digest("hex")
    .slice(0, 16);

  console.log(`\n  total ${total} chunks from ${docs.length} documents`);
  console.log(`  content digest ${digest}`);
  console.log(`  written to ${out}\n`);
};

main();
