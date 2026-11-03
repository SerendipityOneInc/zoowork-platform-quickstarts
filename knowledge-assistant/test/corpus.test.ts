import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadCorpus, PROBE } from "../lib/knowledge/corpus";
import { loadQuestions } from "../lib/knowledge/eval";
import { SEARCH_TOOL } from "../lib/knowledge/search-tool";
import { loadAgentDefinition } from "../lib/zoowork/agent-definition";

test("the corpus loads with stable keys, and the probe's document is in it", () => {
  const corpus = loadCorpus();
  assert.ok(corpus.length >= 15);
  assert.ok(corpus.every((d) => /^[a-z-]+\/[a-z-]+\.md$/.test(d.key) && d.hash.length === 64));
  assert.ok(corpus.some((d) => d.key === PROBE.key));
});

test("every document says it is synthetic", () => {
  for (const doc of loadCorpus()) assert.match(doc.text, /Synthetic sample content/, doc.key);
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
