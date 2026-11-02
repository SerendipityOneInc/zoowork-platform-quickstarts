import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AppError } from "../lib/zoowork/errors";
import type { CorpusDocument } from "../lib/knowledge/corpus";
import type { IndexStats, KnowledgeIndex, Retriever } from "../lib/knowledge/retriever";
import { knowledgeStatePath, loadKnowledgeState, prepareKnowledge, removeKnowledge, type KnowledgeState } from "../lib/knowledge/setup";

const doc = (key: string, hash = "h1"): CorpusDocument => ({ key, text: `# ${key}`, hash });
const corpus = [doc("a.md"), doc("b.md")];
const probe = { query: "q", key: "a.md" };
const fast = { pollMs: 1, sleep: async () => {} };

function fakeKnowledge(stats: IndexStats[] = [{ completed: 2, queued: 0, running: 0, error: 0 }]) {
  const calls: string[] = [];
  let searches = 0;
  const service: KnowledgeIndex & Retriever & { searchesUntilReady: number; failUploadOf?: string } = {
    searchesUntilReady: 0,
    ensure: async () => void calls.push("ensure"),
    upload: async (key) => {
      if (key === service.failUploadOf) throw new AppError("cloudflare_http_500", 502);
      calls.push(`upload ${key}`);
    },
    removeDocument: async (key) => void calls.push(`remove ${key}`),
    stats: async () => stats.shift() ?? { completed: 2, queued: 0, running: 0, error: 0 },
    destroy: async () => void calls.push("destroy"),
    search: async () => {
      calls.push("search");
      return ++searches > service.searchesUntilReady ? [{ key: "a.md", title: "A", text: "x", score: 1 }] : [];
    },
  };
  return { service, calls };
}

async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-setup-"));
  const path = knowledgeStatePath(dir);
  const state: KnowledgeState = { version: 1, instanceId: "kb", uploaded: {} };
  return { dir, path, state };
}

test("setup creates the index, uploads the corpus, waits, probes, and records it", async () => {
  const { path, state } = await fresh();
  const { service, calls } = fakeKnowledge([
    { completed: 0, queued: 2, running: 0, error: 0 },
    { completed: 1, queued: 0, running: 1, error: 0 },
    { completed: 2, queued: 0, running: 0, error: 0 },
  ]);
  const lines: string[] = [];
  const result = await prepareKnowledge(service, path, state, corpus, probe, { ...fast, log: (l) => lines.push(l) });
  assert.deepEqual(calls, ["ensure", "upload a.md", "upload b.md", "search"]);
  assert.equal(result.changed, 2);
  assert.ok(lines.includes("Indexing: 1 of 2 documents done"));
  const saved = await loadKnowledgeState(path);
  assert.ok(saved?.readyAt && saved.createdAt);
  assert.deepEqual(saved?.uploaded, { "a.md": "h1", "b.md": "h1" });
});

test("the instance name is on disk before the create request", async () => {
  const { path, state } = await fresh();
  const { service } = fakeKnowledge();
  service.ensure = async () => {
    assert.equal((await loadKnowledgeState(path))?.instanceId, "kb");
    throw new TypeError("fetch failed");
  };
  await assert.rejects(prepareKnowledge(service, path, state, corpus, probe, fast), TypeError);
  assert.equal((await loadKnowledgeState(path))?.instanceId, "kb");
});

test("a run with nothing to do uploads and searches nothing", async () => {
  const { path, state } = await fresh();
  await prepareKnowledge(fakeKnowledge().service, path, state, corpus, probe, fast);
  const { service, calls } = fakeKnowledge();
  const again = await prepareKnowledge(service, path, (await loadKnowledgeState(path))!, corpus, probe, fast);
  assert.deepEqual(calls, ["ensure"]);
  assert.equal(again.changed, 0);
});

test("a failed upload keeps progress, and the next run sends only what is left", async () => {
  const { path, state } = await fresh();
  const first = fakeKnowledge();
  first.service.failUploadOf = "b.md";
  await assert.rejects(prepareKnowledge(first.service, path, state, corpus, probe, fast), /cloudflare_http_500/);
  assert.equal((await loadKnowledgeState(path))?.readyAt, undefined);
  const second = fakeKnowledge();
  await prepareKnowledge(second.service, path, (await loadKnowledgeState(path))!, corpus, probe, fast);
  assert.deepEqual(second.calls, ["ensure", "upload b.md", "search"]);
});

test("a changed document is re-uploaded and a removed one is deleted; the app is not ready until they are indexed", async () => {
  const { path, state } = await fresh();
  await prepareKnowledge(fakeKnowledge().service, path, state, corpus, probe, fast);
  const { service, calls } = fakeKnowledge([{ completed: 2, queued: 0, running: 0, error: 0 }]);
  const next = [doc("a.md", "h2"), doc("c.md")];
  await prepareKnowledge(service, path, (await loadKnowledgeState(path))!, next, probe, fast);
  assert.deepEqual(calls, ["ensure", "upload a.md", "upload c.md", "remove b.md", "search"]);
  assert.deepEqual((await loadKnowledgeState(path))?.uploaded, { "a.md": "h2", "c.md": "h1" });
});

test("a document that fails to index stops setup", async () => {
  const { path, state } = await fresh();
  const { service } = fakeKnowledge([{ completed: 1, queued: 0, running: 0, error: 1 }]);
  await assert.rejects(prepareKnowledge(service, path, state, corpus, probe, fast), /knowledge_indexing_failed/);
  assert.equal((await loadKnowledgeState(path))?.readyAt, undefined);
});

test("setup keeps waiting while the index is busy, even if completed already covers the corpus", async () => {
  const { path, state } = await fresh();
  const { service } = fakeKnowledge([
    { completed: 2, queued: 1, running: 0, error: 0 },
    { completed: 2, queued: 0, running: 1, error: 0 },
    { completed: 2, queued: 0, running: 0, error: 0 },
  ]);
  await prepareKnowledge(service, path, state, corpus, probe, fast);
  assert.ok((await loadKnowledgeState(path))?.readyAt);
});

test("indexing that never finishes times out with progress kept", async () => {
  const { path, state } = await fresh();
  const busy = Array.from({ length: 20 }, () => ({ completed: 0, queued: 2, running: 0, error: 0 }));
  const { service } = fakeKnowledge(busy);
  await assert.rejects(prepareKnowledge(service, path, state, corpus, probe, { ...fast, indexTimeoutMs: 5 }), /knowledge_indexing_timeout/);
  assert.equal(Object.keys((await loadKnowledgeState(path))!.uploaded).length, 2);
});

test("setup waits until the probe returns the expected document", async () => {
  const { path, state } = await fresh();
  const { service, calls } = fakeKnowledge();
  service.searchesUntilReady = 3;
  await prepareKnowledge(service, path, state, corpus, probe, fast);
  assert.equal(calls.filter((c) => c === "search").length, 4);
});

test("a probe that never answers fails instead of reporting ready", async () => {
  const { path, state } = await fresh();
  const { service } = fakeKnowledge();
  service.searchesUntilReady = 1_000;
  await assert.rejects(prepareKnowledge(service, path, state, corpus, probe, { ...fast, probeTimeoutMs: 5 }), /knowledge_not_searchable/);
});

test("setup refuses to run over an unfinished cleanup", async () => {
  const { path, state } = await fresh();
  state.deleteRequestedAt = "2026-11-02T00:00:00Z";
  await assert.rejects(prepareKnowledge(fakeKnowledge().service, path, state, corpus, probe, fast), /cleanup_incomplete_run_cleanup/);
});

test("cleanup deletes the instance and retires the record", async () => {
  const { dir, path, state } = await fresh();
  const { service, calls } = fakeKnowledge();
  await prepareKnowledge(service, path, state, corpus, probe, fast);
  await removeKnowledge(service, path, state);
  assert.ok(calls.includes("destroy"));
  assert.deepEqual(await readdir(join(dir, ".local")), ["knowledge.retired-kb.json"]);
});

test("a failed cleanup keeps the record and can be run again", async () => {
  const { path, state } = await fresh();
  await prepareKnowledge(fakeKnowledge().service, path, state, corpus, probe, fast);
  await assert.rejects(
    removeKnowledge({ destroy: async () => Promise.reject(new AppError("cloudflare_http_500", 502)) }, path, state),
    /cloudflare_http_500/,
  );
  const saved = await loadKnowledgeState(path);
  assert.equal(saved?.deleteRequestedAt, undefined);
  await removeKnowledge({ destroy: async () => {} }, path, saved!);
  assert.equal(await loadKnowledgeState(path), undefined);
});

test("a 404 on a recorded instance is refused unless this app sent the delete", async () => {
  const notFound = { destroy: async () => Promise.reject(new AppError("cloudflare_http_404", 502)) };
  const { path, state } = await fresh();
  await prepareKnowledge(fakeKnowledge().service, path, state, corpus, probe, fast);
  await assert.rejects(removeKnowledge(notFound, path, state), /cloudflare_http_404/);
  const saved = (await loadKnowledgeState(path))!;
  assert.ok(saved, "the record stays: other credentials also get 404");
  saved.deleteRequestedAt = "2026-11-02T00:00:00Z";
  await removeKnowledge(notFound, path, saved);
  assert.equal(await loadKnowledgeState(path), undefined);
});

test("an instance that was never created counts as gone", async () => {
  const { path, state } = await fresh();
  await removeKnowledge({ destroy: async () => Promise.reject(new AppError("cloudflare_http_404", 502)) }, path, state);
  assert.equal(await loadKnowledgeState(path), undefined);
});
