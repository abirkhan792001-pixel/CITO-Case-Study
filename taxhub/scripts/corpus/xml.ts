/**
 * Minimal reader for the gesetze-im-internet XML format (DTD gii-norm 1.01).
 *
 * Parsed with preserveOrder because statute text is MIXED content: sentence
 * numbers and list markup are interleaved with the prose, and a non-ordered
 * parse silently reorders a sentence's parts. Getting this wrong would corrupt
 * the text we later cite, which is the one thing this project cannot afford.
 */
import { XMLParser } from "fast-xml-parser";

export type Node = Record<string, unknown>;

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  processEntities: true,
  // Keep every text node as a STRING. With the default (parseTagValue: true)
  // fast-xml-parser coerces numeric-looking text, so a statute list marker
  // "<DT>1.</DT>" silently becomes the number 1 and loses its period. Statute
  // numbering is load-bearing for citation, so no value may be reinterpreted.
  parseTagValue: false,
  parseAttributeValue: false,
});

export const tagOf = (n: Node): string =>
  Object.keys(n).find((k) => k !== ":@") ?? "";

export const childrenOf = (n: Node): Node[] => {
  const v = n[tagOf(n)];
  return Array.isArray(v) ? (v as Node[]) : [];
};

export const attrsOf = (n: Node): Record<string, string> =>
  (n[":@"] as Record<string, string>) ?? {};

export const findAll = (nodes: Node[], tag: string): Node[] =>
  nodes.filter((n) => tagOf(n) === tag);

export const findOne = (nodes: Node[], tag: string): Node | undefined =>
  findAll(nodes, tag)[0];

/** Follow a path of tags, e.g. descend(norm, ["metadaten", "enbez"]). */
export const descend = (nodes: Node[], path: string[]): Node[] | undefined => {
  let cur: Node[] | undefined = nodes;
  for (const tag of path) {
    if (!cur) return undefined;
    const next = findOne(cur, tag);
    if (!next) return undefined;
    cur = childrenOf(next);
  }
  return cur;
};

/** Plain concatenated text of a node list, no formatting rules applied. */
export const rawText = (nodes: Node[]): string =>
  nodes
    .map((n) => (tagOf(n) === "#text" ? String(n["#text"]) : rawText(childrenOf(n))))
    .join("");

export const textAt = (nodes: Node[], path: string[]): string => {
  const found = descend(nodes, path);
  return found ? rawText(found).trim() : "";
};

/**
 * Render statute markup to readable plain text.
 *
 * `<SUP class="Rec">N</SUP>` is a Satz (sentence) number. It is DROPPED, because
 * keeping it fuses the marker to the following word ("1Werbungskosten sind…"),
 * which corrupts both readability and the embedding. Nothing else is discarded —
 * the prose itself is reproduced verbatim.
 */
export const renderText = (nodes: Node[]): string =>
  nodes
    .map((n) => {
      const tag = tagOf(n);
      if (tag === "#text") return String(n["#text"]);
      const kids = childrenOf(n);
      switch (tag) {
        case "SUP":
          return attrsOf(n)["@_class"] === "Rec" ? "" : renderText(kids);
        case "DT":
          return "\n" + renderText(kids).trim() + " ";
        case "BR":
          return "\n";
        case "P":
        case "Content":
          return renderText(kids) + "\n";
        default:
          return renderText(kids);
      }
    })
    .join("");

/** Collapse runs of whitespace without destroying paragraph breaks. */
export const tidy = (s: string): string =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
