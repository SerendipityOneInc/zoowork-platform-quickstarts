// Citations are text the model writes, so they are checked. A source is shown
// only if its key is one the search returned to this run. This file has no
// server imports: the stream relay runs the check, and the browser renders it.

export type PassageLike = { key: string; title: string; text: string; score: number };

export type CitedSource = { key: string; title: string; excerpts: string[] };

export type Citations = {
  /** Documents the reply cited and this run really received, in citation order. */
  sources: CitedSource[];
  /** Keys the reply cited that this run did not receive. Never shown as sources. */
  unverified: string[];
};

const MARKER = /\[source:\s*([^\]\n]{1,200})\]/gi;
const EXCERPTS_PER_SOURCE = 3;

export const emptyCitations = (): Citations => ({ sources: [], unverified: [] });

/** The keys in one marker. Models also write several at once, in backticks, or with the folder name. */
const keysIn = (raw: string) =>
  raw
    .split(/[,;]/)
    .map((key) => key.trim().replace(/^[`'"]+|[`'"]+$/g, "").replace(/^corpus\//, ""))
    .filter(Boolean);

export function citedKeys(text: string): string[] {
  return [...new Set([...text.matchAll(MARKER)].flatMap((m) => keysIn(m[1]!)))];
}

export function verifyCitations(text: string, passages: readonly PassageLike[]): Citations {
  const citations = emptyCitations();
  for (const key of citedKeys(text)) {
    const matching = passages.filter((p) => p.key === key).sort((a, b) => b.score - a.score);
    if (!matching.length) {
      citations.unverified.push(key);
      continue;
    }
    citations.sources.push({
      key,
      title: matching[0]!.title,
      excerpts: [...new Set(matching.map((p) => p.text))].slice(0, EXCERPTS_PER_SOURCE),
    });
  }
  return citations;
}

/** Add one reply's citations to a run's, keeping earlier numbers stable. */
export function mergeCitations(into: Citations, next: Citations): Citations {
  return {
    sources: [...into.sources, ...next.sources.filter((s) => !into.sources.some((o) => o.key === s.key))],
    unverified: [...new Set([...into.unverified, ...next.unverified])],
  };
}

/** Replace each marker with its source number, or with a visible flag if it did not check out. */
export function renderCitations(text: string, citations: Citations): string {
  return text.replace(MARKER, (_match, raw: string) =>
    keysIn(raw)
      .map((key) => {
        const index = citations.sources.findIndex((s) => s.key === key);
        return index === -1 ? "[unverified source]" : `[${index + 1}]`;
      })
      .join(""),
  );
}
