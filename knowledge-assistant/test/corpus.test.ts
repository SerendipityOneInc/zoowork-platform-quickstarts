import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CORPUS_DIR, CORPUS_NOTE, loadCorpus, PROBE } from "../lib/knowledge/corpus";
import { loadQuestions } from "../lib/knowledge/eval";
import { SEARCH_TOOL } from "../lib/knowledge/search-tool";
import { loadAgentDefinition } from "../lib/zoowork/agent-definition";

test("the corpus loads with stable keys, and the probe's document is in it", () => {
  const corpus = loadCorpus();
  assert.ok(corpus.length >= 15);
  assert.ok(corpus.every((d) => /^[a-z-]+\/[a-z-]+\.md$/.test(d.key) && d.hash.length === 64));
  assert.ok(corpus.some((d) => d.key === PROBE.key));
});

test("the synthetic-content note is in the corpus directory but never uploaded or indexed", () => {
  assert.match(readFileSync(join(CORPUS_DIR, CORPUS_NOTE), "utf8"), /synthetic sample content/);
  const corpus = loadCorpus();
  assert.ok(corpus.every((d) => d.key !== CORPUS_NOTE));
  // The disclaimer used to sit in every document, where search found it and the Agent cited it.
  for (const doc of corpus) assert.doesNotMatch(doc.text, /not a real product/i, doc.key);
});

test("only the top-level note is skipped; a README inside a folder is a document", () => {
  const root = mkdtempSync(join(tmpdir(), "corpus-"));
  mkdirSync(join(root, CORPUS_DIR, "guides"), { recursive: true });
  writeFileSync(join(root, CORPUS_DIR, CORPUS_NOTE), "# Note\n");
  writeFileSync(join(root, CORPUS_DIR, "guides", "README.md"), "# Guides\n");
  writeFileSync(join(root, CORPUS_DIR, "guides", "start.md"), "# Start\n");
  assert.deepEqual(loadCorpus(root).map((d) => d.key), ["guides/README.md", "guides/start.md"]);
});

test("a corpus holding only the note is reported as missing", () => {
  const root = mkdtempSync(join(tmpdir(), "corpus-"));
  mkdirSync(join(root, CORPUS_DIR));
  writeFileSync(join(root, CORPUS_DIR, CORPUS_NOTE), "# Note\n");
  assert.throws(() => loadCorpus(root), /corpus_missing/);
});

test("a missing corpus is reported", () => {
  assert.throws(() => loadCorpus(join(tmpdir(), "no-such-dir")), /corpus_missing/);
});

test("the Agent is declared with the search tool and allowed to use only it", () => {
  const { resource } = loadAgentDefinition();
  assert.deepEqual(resource.custom_tools?.map((t) => t.name), [SEARCH_TOOL]);
  assert.deepEqual(resource.tool_policy, { allow: [SEARCH_TOOL] });
});

test("the eval questions match the corpus and cover each kind", () => {
  const questions = loadQuestions(loadCorpus());
  assert.ok(questions.length >= 12);
  assert.deepEqual([...new Set(questions.map((q) => q.kind))].sort(), ["direct", "multi_source", "not_in_docs", "synonym"]);
  for (const q of questions) {
    if (q.kind === "multi_source") assert.ok(new Set(q.expect.map((e) => e.source)).size >= 2, q.id);
  }
});
