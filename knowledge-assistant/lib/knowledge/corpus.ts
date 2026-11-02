import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { AppError } from "../zoowork/errors";

export type CorpusDocument = { key: string; text: string; hash: string };

export const CORPUS_DIR = "corpus";

/** A question the corpus answers, and the document that answers it. Setup waits until it works. */
export const PROBE = { query: "How long do export links last?", key: "exports/export-links.md" };

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

/** The documents setup uploads. The key is the path under corpus/, which is what the Agent cites. */
export function loadCorpus(cwd = process.cwd()): CorpusDocument[] {
  const root = join(cwd, CORPUS_DIR);
  let files: string[];
  try {
    files = markdownFiles(root);
  } catch {
    throw new AppError("corpus_missing");
  }
  if (!files.length) throw new AppError("corpus_missing");
  return files.sort().map((file) => {
    const text = readFileSync(file, "utf8");
    return {
      key: relative(root, file).split(sep).join("/"),
      text,
      hash: createHash("sha256").update(text).digest("hex"),
    };
  });
}
