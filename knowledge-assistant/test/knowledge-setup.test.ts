import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AppError } from "../lib/zoowork/errors";
import type { CorpusDocument } from "../lib/knowledge/corpus";
import type { IndexedDocument, KnowledgeIndex, Retriever } from "../lib/knowledge/retriever";
import {
  cleanupAll,
  knowledgeStatePath,
  knowledgeStatusLines,
  loadKnowledgeState,
  prepareKnowledge,
  removeKnowledge,
  type KnowledgeState,
} from "../lib/knowledge/setup";

const doc = (key: string, hash = "h1"): CorpusDocument => ({ key, text: `# ${key}`, hash });
const corpus = [doc("a.md"), doc("b.md")];
const probe = { query: "q", key: "a.md" };
const fast = { pollMs: 1, sleep: async () => {} };

const documents = (states: Record<string, IndexedDocument["state"]>): IndexedDocument[] =>
  Object.entries(states).map(([key, state]) => ({ key, state }));
const allReady = documents({ "a.md": "ready", "b.md": "ready" });

function fakeKnowledge(polls: IndexedDocument[][] = []) {
  const calls: string[] = [];
  let searches = 0;
  const service: KnowledgeIndex & Retriever & { searchesUntilReady: number; failUploadOf?: string; present: boolean } = {
    searchesUntilReady: 0,
    present: false,
    exists: async () => service.present,
    create: async () => {
      calls.push("create");
      service.present = true;
    },
    upload: async (key) => {
      if (key === service.failUploadOf) throw new AppError("cloudflare_http_500", 502);
      calls.push(`upload ${key}`);
    },
    removeDocument: async (key) => void calls.push(`remove ${key}`),
    documents: async () => polls.shift() ?? allReady,
    destroy: async () => {
      calls.push("destroy");
      return true;
    },
    search: async () => {
      calls.push("search");
      return ++searches > service.searchesUntilReady ? [{ key: "a.md", title: "A", text: "x", score: 1 }] : [];
    },
  };
  return { service, calls };
}

/** A service for a run after setup finished once: the index is there. */
function existingKnowledge(polls?: IndexedDocument[][]) {
  const fake = fakeKnowledge(polls);
  fake.service.present = true;
  return fake;
}

async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-setup-"));
  const path = knowledgeStatePath(dir);
  const state: KnowledgeState = { version: 1, instanceId: "kb", uploaded: {} };
  return { dir, path, state };
}

async function prepared() {
  const context = await fresh();
  await prepareKnowledge(fakeKnowledge().service, context.path, context.state, corpus, probe, fast);
  return context;
}

test("setup creates the index, uploads the corpus, waits, probes, and records it", async () => {
  const { path, state } = await fresh();
  const { service, calls } = fakeKnowledge([
    documents({ "a.md": "pending", "b.md": "pending" }),
    documents({ "a.md": "ready", "b.md": "pending" }),
    allReady,
  ]);
  const lines: string[] = [];
  const result = await prepareKnowledge(service, path, state, corpus, probe, { ...fast, log: (l) => lines.push(l) });
  assert.deepEqual(calls, ["create", "upload a.md", "upload b.md", "search"]);
  assert.equal(result.changed, 2);
  assert.ok(lines.includes("Indexing: 1 of 2 documents done"));
  const saved = await loadKnowledgeState(path);
  assert.ok(saved?.readyAt && saved.createdAt);
  assert.deepEqual(saved?.uploaded, { "a.md": "h1", "b.md": "h1" });
});

test("the instance name is on disk before the create request", async () => {
  const { path, state } = await fresh();
  const { service } = fakeKnowledge();
  service.create = async () => {
    assert.equal((await loadKnowledgeState(path))?.instanceId, "kb");
    throw new TypeError("fetch failed");
  };
  await assert.rejects(prepareKnowledge(service, path, state, corpus, probe, fast), TypeError);
  assert.equal((await loadKnowledgeState(path))?.instanceId, "kb");
});

test("an index that a lost response already created is used as it is", async () => {
  const { path, state } = await fresh();
  const { service, calls } = existingKnowledge();
  await prepareKnowledge(service, path, state, corpus, probe, fast);
  assert.ok(!calls.includes("create"));
  assert.ok((await loadKnowledgeState(path))?.createdAt);
});

test("a recorded index that is gone stops setup instead of leaving an empty index that looks ready", async () => {
  const { path } = await prepared();
  const { service, calls } = fakeKnowledge();
  const saved = (await loadKnowledgeState(path))!;
  await assert.rejects(prepareKnowledge(service, path, saved, corpus, probe, fast), /knowledge_index_missing/);
  assert.deepEqual(calls, []);
  assert.ok((await loadKnowledgeState(path))?.readyAt, "the record stays: other credentials also see no index");
});

test("a probe document missing from the corpus fails at once, before any work", async () => {
  const { path, state } = await fresh();
  const { service, calls } = fakeKnowledge();
  await assert.rejects(prepareKnowledge(service, path, state, corpus, { query: "q", key: "gone.md" }, fast), /knowledge_probe_not_in_corpus/);
  assert.deepEqual(calls, []);
});

test("a run with nothing to do uploads and searches nothing", async () => {
  const { path } = await prepared();
  const { service, calls } = existingKnowledge();
  const again = await prepareKnowledge(service, path, (await loadKnowledgeState(path))!, corpus, probe, fast);
  assert.deepEqual(calls, []);
  assert.equal(again.changed, 0);
});

test("a failed upload keeps progress, and the next run sends only what is left", async () => {
  const { path, state } = await fresh();
  const first = fakeKnowledge();
  first.service.failUploadOf = "b.md";
  await assert.rejects(prepareKnowledge(first.service, path, state, corpus, probe, fast), /cloudflare_http_500/);
  assert.equal((await loadKnowledgeState(path))?.readyAt, undefined);
  const second = existingKnowledge();
  await prepareKnowledge(second.service, path, (await loadKnowledgeState(path))!, corpus, probe, fast);
  assert.deepEqual(second.calls, ["upload b.md", "search"]);
});

test("a changed document is re-uploaded and a removed one is deleted; the app is not ready until they are indexed", async () => {
  const { path } = await prepared();
  const next = [doc("a.md", "h2"), doc("c.md")];
  const { service, calls } = existingKnowledge([documents({ "a.md": "pending", "c.md": "pending" }), documents({ "a.md": "ready", "c.md": "ready" })]);
  await prepareKnowledge(service, path, (await loadKnowledgeState(path))!, next, probe, fast);
  assert.deepEqual(calls, ["upload a.md", "upload c.md", "remove b.md", "search"]);
  assert.deepEqual((await loadKnowledgeState(path))?.uploaded, { "a.md": "h2", "c.md": "h1" });
});

test("a changed document that is still indexing holds setup back, though the other documents are ready", async () => {
  const { path } = await prepared();
  const polls = [documents({ "a.md": "ready", "b.md": "pending" }), documents({ "a.md": "ready", "b.md": "pending" }), allReady];
  const { service } = existingKnowledge(polls);
  await prepareKnowledge(service, path, (await loadKnowledgeState(path))!, [doc("a.md"), doc("b.md", "h2")], probe, fast);
  assert.equal(polls.length, 0, "setup read the status until the changed document was ready");
});

test("a document that fails to index stops setup, says which one and why, and goes again on the next run", async () => {
  const { path, state } = await fresh();
  const failed: IndexedDocument[] = [
    { key: "a.md", state: "ready" },
    { key: "b.md", state: "failed", reason: "file_content_empty" },
  ];
  await assert.rejects(prepareKnowledge(fakeKnowledge([failed]).service, path, state, corpus, probe, fast), /knowledge_indexing_failed: b\.md \(file_content_empty\)/);
  const saved = (await loadKnowledgeState(path))!;
  assert.equal(saved.readyAt, undefined);
  assert.deepEqual(saved.uploaded, { "a.md": "h1" });

  const second = existingKnowledge();
  await prepareKnowledge(second.service, path, saved, corpus, probe, fast);
  assert.deepEqual(second.calls, ["upload b.md", "search"]);
  assert.ok((await loadKnowledgeState(path))?.readyAt);
});

test("a failure on a document outside the corpus does not stop setup", async () => {
  const { path, state } = await fresh();
  const { service } = fakeKnowledge([[...allReady, { key: "old.md", state: "failed", reason: "unknown_error" }]]);
  await prepareKnowledge(service, path, state, corpus, probe, fast);
  assert.ok((await loadKnowledgeState(path))?.readyAt);
});

test("a document the index does not list yet counts as waiting", async () => {
  const { path, state } = await fresh();
  const polls = [documents({ "a.md": "ready" }), allReady];
  await prepareKnowledge(fakeKnowledge(polls).service, path, state, corpus, probe, fast);
  assert.equal(polls.length, 0);
});

test("indexing that never finishes times out with progress kept", async () => {
  const { path, state } = await fresh();
  const busy = Array.from({ length: 20 }, () => documents({ "a.md": "pending", "b.md": "pending" }));
  await assert.rejects(prepareKnowledge(fakeKnowledge(busy).service, path, state, corpus, probe, { ...fast, indexTimeoutMs: 5 }), /knowledge_indexing_timeout/);
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
  const { dir, path, state } = await prepared();
  const { service, calls } = existingKnowledge();
  await removeKnowledge(service, path, state);
  assert.ok(calls.includes("destroy"));
  assert.deepEqual(await readdir(join(dir, ".local")), ["knowledge.retired-kb.json"]);
});

test("a refused cleanup keeps the record and forgets the delete, because nothing was deleted", async () => {
  const { path, state } = await prepared();
  await assert.rejects(
    removeKnowledge({ destroy: async () => Promise.reject(new AppError("cloudflare_http_403", 502)) }, path, state),
    /cloudflare_http_403/,
  );
  const saved = await loadKnowledgeState(path);
  assert.equal(saved?.deleteRequestedAt, undefined);
  await removeKnowledge({ destroy: async () => true }, path, saved!);
  assert.equal(await loadKnowledgeState(path), undefined);
});

for (const [name, error] of [
  ["a timeout", new AppError("cloudflare_timeout", 502)],
  ["a server error", new AppError("cloudflare_http_500", 502)],
] as const) {
  test(`after ${name} the delete may have worked, so a later "not there" finishes cleanup`, async () => {
    const { path, state } = await prepared();
    await assert.rejects(removeKnowledge({ destroy: async () => Promise.reject(error) }, path, state), (e) => e === error);
    const saved = await loadKnowledgeState(path);
    assert.ok(saved?.deleteRequestedAt);
    await assert.rejects(prepareKnowledge(fakeKnowledge().service, path, saved, corpus, probe, fast), /cleanup_incomplete_run_cleanup/);
    await removeKnowledge({ destroy: async () => false }, path, saved);
    assert.equal(await loadKnowledgeState(path), undefined);
  });
}

test('"not there" on a recorded index is refused unless this app sent the delete', async () => {
  const notThere = { destroy: async () => false };
  const { path, state } = await prepared();
  await assert.rejects(removeKnowledge(notThere, path, state), /knowledge_index_missing/);
  const saved = (await loadKnowledgeState(path))!;
  assert.ok(saved, "the record stays: other credentials also see no index");
  assert.equal(saved.deleteRequestedAt, undefined);
  saved.deleteRequestedAt = "2026-11-02T00:00:00Z";
  await removeKnowledge(notThere, path, saved);
  assert.equal(await loadKnowledgeState(path), undefined);
});

test("an instance that was never created counts as gone", async () => {
  const { path, state } = await fresh();
  await removeKnowledge({ destroy: async () => false }, path, state);
  assert.equal(await loadKnowledgeState(path), undefined);
});

test("cleanup removes the index even if setup stopped before the Agent was created", async () => {
  const steps: string[] = [];
  await assert.rejects(
    cleanupAll({
      agent: async () => Promise.reject(new AppError("agent_creation_uncertain_run_setup_again")),
      evidence: async () => void steps.push("evidence"),
      knowledge: async () => void steps.push("knowledge"),
    }),
    /agent_creation_uncertain_run_setup_again/,
  );
  assert.deepEqual(steps, ["evidence", "knowledge"]);
});

test("any other Agent failure stops cleanup and keeps the index", async () => {
  const steps: string[] = [];
  await assert.rejects(
    cleanupAll({
      agent: async () => Promise.reject(new AppError("http_403")),
      evidence: async () => void steps.push("evidence"),
      knowledge: async () => void steps.push("knowledge"),
    }),
    /http_403/,
  );
  assert.deepEqual(steps, []);
});

test("evidence is retired before the index, so a failed delete can still be run again", async () => {
  const steps: string[] = [];
  await assert.rejects(
    cleanupAll({
      evidence: async () => void steps.push("evidence"),
      knowledge: async () => {
        steps.push("knowledge");
        throw new AppError("cloudflare_http_500", 502);
      },
    }),
    /cloudflare_http_500/,
  );
  assert.deepEqual(steps, ["evidence", "knowledge"]);
});

test("status counts documents, and a failure there leaves the rest of the report", async () => {
  const state: KnowledgeState = { version: 1, instanceId: "kb", uploaded: {}, readyAt: "2026-11-02T00:00:00Z" };
  const counted = await knowledgeStatusLines(() => ({ documents: async () => documents({ a: "ready", b: "pending", c: "failed" }) }), state);
  assert.ok(counted.some((line) => line.includes("1 indexed, 1 waiting, 1 failed")));
  const down = await knowledgeStatusLines(
    () => ({ documents: async () => Promise.reject(new AppError("cloudflare_http_503", 502)) }),
    state,
  );
  assert.ok(down.some((line) => line.includes("unavailable (cloudflare_http_503)")));
  const noToken = await knowledgeStatusLines(() => {
    throw new AppError("cloudflare_credentials_required", 500);
  }, state);
  assert.ok(noToken.some((line) => line.includes("unavailable (cloudflare_credentials_required)")));
});
