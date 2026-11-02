import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CustomToolCallRecord } from "@zoowork-ai/sdk";
import { AppError } from "../lib/zoowork/errors";
import { fileEvidenceStore } from "../lib/knowledge/evidence";
import type { Passage } from "../lib/knowledge/retriever";
import { createSearchWorker } from "../lib/knowledge/worker";

const passage: Passage = { key: "billing/refunds.md", title: "Refunds", text: "Refunds within 30 days.", score: 0.9 };

const pending = (over: Partial<CustomToolCallRecord> = {}): CustomToolCallRecord => ({
  call_id: "cc_1",
  session_id: "ses_mine",
  run_id: "run_1",
  tool_call_id: "tc_1",
  name: "search_knowledge",
  input: { query: "refunds" },
  status: "pending",
  requested_at: "2026-11-02T00:00:00Z",
  ...over,
});

type Resolved = { callId: string; input: { content: { type: string; value?: unknown }[]; isError?: boolean } };

async function setup(search: (query: string) => Promise<Passage[]>, calls: CustomToolCallRecord[] = [pending()]) {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-worker-"));
  const evidence = fileEvidenceStore(join(dir, "evidence.json"));
  const resolved: Resolved[] = [];
  const searches: string[] = [];
  let failResolve = false;
  const worker = createSearchWorker({
    agentId: "agt_1",
    evidence,
    ownsSession: async (id) => id === "ses_mine",
    retriever: {
      search: (query) => {
        searches.push(query);
        return search(query);
      },
    },
    client: {
      listCustomToolCalls: async () => calls,
      getCustomToolCall: async (_agentId, callId) => pending({ call_id: callId, run_id: "run_from_detail" }),
      resolveCustomToolCall: async (_agentId, callId, input) => {
        if (failResolve) throw new TypeError("fetch failed");
        resolved.push({ callId, input });
        return { ...pending({ call_id: callId }), signaled: true };
      },
    },
  });
  return { worker, evidence, resolved, searches, failResolves: (v: boolean) => (failResolve = v) };
}

test("a search is answered on the server, and its passages are saved for the run", async () => {
  const t = await setup(async () => [passage]);
  assert.equal(await t.worker.poll(), 1);
  assert.equal(t.resolved[0]!.input.isError, false);
  assert.deepEqual(t.resolved[0]!.input.content[0], {
    type: "json",
    value: { found: 1, passages: [{ source: "billing/refunds.md", title: "Refunds", text: "Refunds within 30 days." }] },
  });
  assert.deepEqual((await t.evidence.forRun("ses_mine", "run_1")).map((c) => c.passages), [[passage]]);
});

test("the run comes from the call's own record when the pending list leaves it out", async () => {
  const { run_id: _omitted, ...listed } = pending();
  const t = await setup(async () => [passage], [listed as CustomToolCallRecord]);
  await t.worker.poll();
  assert.equal((await t.evidence.forRun("ses_mine", "run_from_detail")).length, 1);
});

test("nothing found is a normal result, not an error", async () => {
  const t = await setup(async () => []);
  await t.worker.poll();
  assert.equal(t.resolved[0]!.input.isError, false);
  assert.deepEqual(t.resolved[0]!.input.content[0], { type: "json", value: { found: 0, passages: [] } });
});

test("a retrieval failure reaches the Agent as a tool error and keeps its code", async () => {
  const t = await setup(async () => {
    throw new AppError("cloudflare_http_500", 502);
  });
  await t.worker.poll();
  assert.equal(t.resolved[0]!.input.isError, true);
  assert.deepEqual(t.resolved[0]!.input.content[0], { type: "json", value: { error: "search_failed" } });
  assert.equal((await t.evidence.get("cc_1"))?.code, "cloudflare_http_500");
});

test("an empty or oversized query is refused without searching", async () => {
  for (const query of ["  ", "x".repeat(501)]) {
    const t = await setup(async () => [passage], [pending({ input: { query } })]);
    await t.worker.poll();
    assert.deepEqual(t.searches, []);
    assert.equal(t.resolved[0]!.input.isError, true);
    assert.equal((await t.evidence.get("cc_1"))?.code, "invalid_query");
  }
});

test("a result that could not be sent is sent again without a second search", async () => {
  const t = await setup(async () => [passage]);
  t.failResolves(true);
  await assert.rejects(t.worker.poll());
  t.failResolves(false);
  await t.worker.poll();
  assert.equal(t.searches.length, 1);
  assert.equal(t.resolved.length, 1);
  assert.equal((await t.evidence.get("cc_1"))?.delivered, true);
});

test("a delivered result is not sent again while the call is still listed", async () => {
  const t = await setup(async () => [passage]);
  await t.worker.poll();
  await t.worker.poll();
  assert.equal(t.searches.length, 1);
  assert.equal(t.resolved.length, 1);
});

test("calls from other Sessions and other tools are left alone", async () => {
  const t = await setup(async () => [passage], [pending({ session_id: "ses_other" }), pending({ call_id: "cc_2", name: "other_tool" })]);
  await t.worker.poll();
  assert.deepEqual(t.searches, []);
  assert.deepEqual(t.resolved, []);
});
