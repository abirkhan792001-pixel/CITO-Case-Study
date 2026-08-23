"use client";

import { useEffect, useState } from "react";

type Source = {
  n: number;
  label: string;
  title: string;
  url: string;
  sourceRepo: string;
  stand: string;
  retrievedAt: string;
  commitSha: string | null;
  licenceNote: string;
  isSynthetic: boolean;
  similarity: number;
};

type AnswerPayload = {
  question: string;
  answer: string;
  refused: boolean;
  sources: Source[];
  citedSources: number[];
  disclaimer: string;
};

type Status = {
  connected: boolean;
  resourceCount?: number;
  chunkCount?: number;
  syntheticCount?: number;
  realCount?: number;
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnswerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [showSources, setShowSources] = useState(true);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unbekannter Fehler.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Verbindung zum Server fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const isEmptyCorpus = status?.connected && status.chunkCount === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-10">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          TaxHub · Fragen Sie Ihr Kanzlei-Wissen
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Antworten ausschließlich aus den hinterlegten Unterlagen — mit
          Quellenangabe. Wenn keine Quelle trägt, sagt das System das offen.
        </p>
      </header>

      {/* Corpus status — keeps the "grounded, not a demo" claim checkable. */}
      <section
        className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
        aria-live="polite"
      >
        {status === null ? (
          <span className="text-slate-500">Wissensbasis wird geprüft …</span>
        ) : !status.connected ? (
          <span className="font-medium text-red-700">
            Keine Verbindung zur Wissensbasis.
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-slate-700">
            <span>
              <span className="font-medium">Wissensbasis:</span>{" "}
              {status.chunkCount} Abschnitte aus {status.resourceCount}{" "}
              Dokumenten
            </span>
            <span className="text-slate-500">
              davon {status.realCount} echt · {status.syntheticCount} simuliert
            </span>
          </div>
        )}
        {isEmptyCorpus && (
          <p className="mt-2 border-t border-slate-100 pt-2 text-slate-600">
            Die Wissensbasis ist derzeit <strong>leer</strong> (Stand: Phase 0 —
            Bootstrap). Jede Frage wird daher korrekterweise abgelehnt. Das ist
            das erwartete Verhalten, kein Fehler.
          </p>
        )}
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="question" className="sr-only">
          Ihre Frage
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              ask(question);
            }
          }}
          rows={3}
          placeholder="z. B. Welche Aufbewahrungsfristen gelten für Buchungsbelege?"
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">⌘/Strg + Enter</span>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Suche in der Wissensbasis …" : "Frage stellen"}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <section className="flex flex-col gap-4">
          <article
            className={`rounded-lg border px-5 py-4 ${
              result.refused
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-white"
            }`}
          >
            {result.refused && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                Keine belegbare Antwort
              </p>
            )}
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {result.answer}
            </div>
          </article>

          {result.sources.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setShowSources((s) => !s)}
                className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium"
                aria-expanded={showSources}
              >
                <span>Quellen ({result.sources.length})</span>
                <span className="text-slate-400">
                  {showSources ? "▲" : "▼"}
                </span>
              </button>
              {showSources && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {result.sources.map((s) => (
                    <li key={s.n} className="px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                          Quelle {s.n}
                        </span>
                        <span className="font-medium">{s.label}</span>
                        {s.isSynthetic && (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">
                            SIMULIERT
                          </span>
                        )}
                        {result.citedSources.includes(s.n) && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                            zitiert
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-slate-600">{s.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Stand: {s.stand} · Relevanz:{" "}
                        {s.similarity.toFixed(3)} · {s.licenceNote}
                      </p>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-blue-700 underline underline-offset-2"
                      >
                        {s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <footer className="mt-auto border-t border-slate-200 pt-4 text-xs text-slate-500">
        Kein Ersatz für steuerliche Beratung. Antworten stammen ausschließlich
        aus der hinterlegten Wissensbasis.
      </footer>
    </main>
  );
}
