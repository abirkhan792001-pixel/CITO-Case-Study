import { formatCitation, standDate } from "../db/schema/provenance";
import type { RetrievedChunk } from "./retrieval-types";

/** Liability signal the profession expects. Appended to EVERY answer. */
export const DISCLAIMER =
  "Kein Ersatz für steuerliche Beratung. Bitte fachlich prüfen, bevor Sie gegenüber Mandanten kommunizieren.";

/**
 * Shown verbatim when retrieval returns nothing above the threshold.
 * This refusal IS the product feature — it is what separates a grounded
 * assistant from a chatbot. It must never be replaced by a model guess.
 */
export const REFUSAL_ANSWER = [
  "Dazu finde ich in der Wissensbasis dieser Kanzlei **keine belastbare Quelle**.",
  "",
  "Ich beantworte die Frage deshalb bewusst nicht aus allgemeinem Wissen — eine unbelegte Auskunft wäre hier das größere Risiko.",
  "",
  "**Was hilft:** Nehmen Sie das einschlägige Dokument (Gesetzestext, BMF-Schreiben oder die interne Kanzlei-Notiz) in die Wissensbasis auf. Danach beantworte ich die Frage mit Quellenangabe.",
  "",
  DISCLAIMER,
].join("\n");

/**
 * The grounding contract. Written in German because the product answers in
 * German; the rules are stated as hard prohibitions because abstention is the
 * behaviour we are actually buying from the model.
 */
export const SYSTEM_PROMPT = `Du bist der Wissens-Assistent einer deutschen Steuerkanzlei.

REGELN — ausnahmslos:
1. Beantworte AUSSCHLIESSLICH auf Basis der unten bereitgestellten Auszüge. Dein Allgemeinwissen über Steuerrecht ist hier IRRELEVANT und darf NICHT einfließen.
2. Jede inhaltliche Aussage trägt eine Quellenangabe in eckigen Klammern, exakt in der Form [Quelle N], wobei N die Nummer des Auszugs ist.
3. Erfinde NIEMALS Paragraphen, Absätze, Fristen, Beträge oder Aktenzeichen. Wenn eine Zahl nicht wörtlich in einem Auszug steht, nenne sie nicht.
4. Decken die Auszüge die Frage nur teilweise ab, beantworte den gedeckten Teil und benenne ausdrücklich, was NICHT gedeckt ist.
5. Tragen die Auszüge die Frage überhaupt nicht, sage das klar und antworte NICHT aus Allgemeinwissen.
6. Antworte auf DEUTSCH, knapp und handlungsorientiert — eine Steuerfachangestellte muss direkt damit arbeiten können.
7. Auszüge aus dem Kanzlei-Wiki sind SIMULIERTE Beispielinhalte. Stützt sich deine Antwort darauf, weise ausdrücklich darauf hin.
8. Gib keine individuelle steuerliche Beratung und keine Empfehlung zur Gestaltung im Einzelfall.`;

/** Render retrieved chunks into the numbered block the system prompt refers to. */
export const buildContextBlock = (chunks: RetrievedChunk[]): string =>
  chunks
    .map((chunk, i) => {
      const p = chunk.provenance;
      const label = formatCitation(p);
      const synthetic = p.is_synthetic ? " — SIMULIERTER Kanzlei-Inhalt" : "";
      return [
        `[Quelle ${i + 1}] ${label} (${p.title}${synthetic})`,
        `Stand: ${standDate(p)} | Fundstelle: ${p.source_url}`,
        "",
        chunk.content,
      ].join("\n");
    })
    .join("\n\n---\n\n");
