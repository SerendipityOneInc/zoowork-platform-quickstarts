import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ZooworkError, type SessionEvent } from "@zoowork-ai/sdk";
import { foldEvents } from "../lib/chat/reducer";
import type { WireEvent } from "../lib/chat/wire";
import {
  clearEvalState,
  evalPreflight,
  evalStores,
  failureOf,
  formatResult,
  formatSummary,
  loadQuestions,
  outcomeOf,
  REFUSAL,
  removeEvalSessions,
  runEval,
  type EvalClient,
  type EvalOutcome,
  type EvalQuestion,
} from "../lib/knowledge/eval";
import type { EvidenceCall } from "../lib/knowledge/evidence";
import { loadAgentDefinition } from "../lib/zoowork/agent-definition";
import { agentStatePath, loadAgentState, newAgentState, saveAgentState, webPidPath } from "../lib/zoowork/state";

const answerable: EvalQuestion = {
  id: "links",
  kind: "direct",
  question: "How long do export links last?",
  expect: [{ source: "exports/export-links.md", fragment: "24 hours" }],
};
const refused: EvalQuestion = { id: "gantt", kind: "not_in_docs", question: "Gantt charts?", absent: ["gantt"] };

const outcome = (over: Partial<EvalOutcome> = {}): EvalOutcome => ({
  status: "succeeded",
  reply: "Export links expire after **24 hours**. [1]",
  sources: ["exports/export-links.md"],
  unverified: [],
  searches: 1,
  queries: ["export links"],
  ...over,
});

test("an answer passes only with the verified source and the expected fact", () => {
  assert.equal(failureOf(answerable, outcome()), undefined);
  assert.equal(failureOf(answerable, outcome({ sources: [] })), "source_missing:exports/export-links.md");
  assert.equal(failureOf(answerable, outcome({ reply: "They last a day. [1]" })), "fragment_missing:24 hours");
});

test("every expected source of a multi-source question is required", () => {
  const question: EvalQuestion = {
    id: "two",
    kind: "multi_source",
    question: "q",
    expect: [
      { source: "a.md", fragment: "one" },
      { source: "b.md", fragment: "two" },
    ],
  };
  assert.equal(failureOf(question, outcome({ reply: "one and two", sources: ["a.md", "b.md"] })), undefined);
  assert.equal(failureOf(question, outcome({ reply: "one and two", sources: ["a.md"] })), "source_missing:b.md");
});

test("a refusal must start with the exact sentence and carry no verified source", () => {
  const reply = `${REFUSAL} I searched for Gantt charts.`;
  assert.equal(failureOf(refused, outcome({ reply, sources: [] })), undefined);
  assert.equal(failureOf(refused, outcome({ reply: "Yes, it has them.", sources: [] })), "not_refused");
  assert.equal(failureOf(refused, outcome({ reply: `Sorry. ${REFUSAL}`, sources: [] })), "not_refused");
  assert.equal(failureOf(refused, outcome({ reply, sources: ["a.md"] })), "source_on_refusal:a.md");
});

test("a failed run or search is a failure with its code, never a refusal", () => {
  const reply = `${REFUSAL} I searched.`;
  assert.equal(failureOf(refused, outcome({ reply, sources: [], searchFailed: "cloudflare_http_500" })), "search_failed:cloudflare_http_500");
  assert.equal(failureOf(refused, outcome({ reply, sources: [], status: "failed" })), "run_failed");
  assert.equal(failureOf(refused, outcome({ reply: "", sources: [], status: "no_run" })), "run_no_run");
  assert.equal(failureOf(answerable, outcome({ status: "aborted" })), "run_aborted");
});

test("the refusal sentence is the one the Agent is told to use", () => {
  const instructions = JSON.stringify(loadAgentDefinition().resource.persona);
  assert.ok(instructions.includes(REFUSAL));
});

const corpus = [{ key: "docs/a.md", text: "# A\n\nLinks **expire** after 24   hours.\n" }];

async function questionsDir(questions: unknown[]) {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-eval-"));
  await mkdir(join(dir, "eval"));
  await writeFile(join(dir, "eval", "questions.json"), JSON.stringify({ version: 1, questions }));
  return dir;
}

test("a question that does not match the corpus is rejected, whichever way it is wrong", async () => {
  const good = { id: "a", kind: "direct", question: "q", expect: [{ source: "docs/a.md", fragment: "expire after 24 hours" }] };
  assert.equal(loadQuestions(corpus, await questionsDir([good])).length, 1);
  const bad: [string, unknown[]][] = [
    ["unknown source", [{ ...good, expect: [{ source: "docs/none.md", fragment: "24" }] }]],
    ["fragment not in the document", [{ ...good, expect: [{ source: "docs/a.md", fragment: "48 hours" }] }]],
    ["no expectation", [{ ...good, expect: [] }]],
    ["unknown kind", [{ ...good, kind: "other" }]],
    ["refusal the docs can answer", [{ id: "a", kind: "not_in_docs", question: "q", absent: ["links"] }]],
    ["refusal without terms", [{ id: "a", kind: "not_in_docs", question: "q", absent: [] }]],
    ["repeated id", [good, good]],
  ];
  for (const [name, questions] of bad) {
    const dir = await questionsDir(questions);
    assert.throws(() => loadQuestions(corpus, dir), /invalid_eval_question:a/, name);
  }
});

test("without local documents, questions are checked for shape only", async () => {
  const dir = await questionsDir([{ id: "a", kind: "direct", question: "q", expect: [{ source: "anywhere", fragment: "x" }] }]);
  assert.equal(loadQuestions(undefined, dir).length, 1);
  const noFragment = await questionsDir([{ id: "a", kind: "direct", question: "q", expect: [{ source: "anywhere" }] }]);
  assert.throws(() => loadQuestions(undefined, noFragment), /invalid_eval_question:a/);
});

test("a missing question file is reported", () => {
  assert.throws(() => loadQuestions(corpus, join(tmpdir(), "no-such-dir")), /eval_questions_missing/);
});

const when = "2026-11-02T00:00:10Z";
const event = (seq: number, eventType: string, payload: Record<string, unknown>): SessionEvent =>
  ({ seq, eventType, payload, runId: "run_1", createdAt: when, cursor: `c${seq}` }) as unknown as SessionEvent;

const finished = (status = "succeeded") => event(9, "run.finished", { status });
const reply = (text: string) => event(5, "agent.assistant", { message: { content: [{ type: "text", text }] } });
const searched = () =>
  event(4, "agent.custom_tool_use", {
    phase: "resolved",
    callId: "cc_1",
    toolCallId: "tc_1",
    name: "search_knowledge",
    input: { query: "export link expiry" },
    outcome: "completed",
  });

const savedSearch = (sessionId: string, over: Partial<EvidenceCall> = {}): EvidenceCall => ({
  callId: "cc_1",
  sessionId,
  runId: "run_1",
  query: "q",
  status: "ok",
  passages: [{ key: "exports/export-links.md", title: "Export links", text: "24 hours", score: 0.9 }],
  requestedAt: "2026-11-02T00:00:00Z",
  delivered: true,
  ...over,
});

type Script = { events: SessionEvent[]; search?: Partial<EvidenceCall> | false; hang?: boolean };

async function harness(script: (question: string) => Script) {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-eval-"));
  const stores = evalStores({ instance: "inst", agentId: "agt_1" }, dir);
  const created = new Map<string, string>();
  const questionOf = new Map<string, string>();
  const deleted: string[] = [];
  const order: string[] = [];
  const faults = { create: 0, deleteOnce: false };
  const client: EvalClient = {
    async createSession(_agent, _input, key) {
      const pending = await stores.sessions.listPendingCreates();
      assert.ok(pending.some((p) => p.idempotencyKey === key), "recorded before the request");
      const id = created.get(key!) ?? `ses_${created.size + 1}`;
      created.set(key!, id);
      if (faults.create > 0) {
        faults.create -= 1;
        throw new TypeError("fetch failed"); // the response was lost after the create committed
      }
      order.push(`create ${id}`);
      return { session_id: id } as Awaited<ReturnType<EvalClient["createSession"]>>;
    },
    async postEvents(_agent, session, events) {
      const input = events[0] as { content: string };
      questionOf.set(session, input.content);
      const search = script(input.content).search;
      if (search !== false) await stores.evidence.save(savedSearch(session, search));
      return { events: [{ accepted: true, seq: 1 }] } as Awaited<ReturnType<EvalClient["postEvents"]>>;
    },
    async *streamEvents(_agent, session, opts) {
      const scripted = script(questionOf.get(session)!);
      if (scripted.hang) {
        await new Promise((_, reject) => opts?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      }
      yield* scripted.events;
    },
    async deleteSession(_agent, session) {
      if (faults.deleteOnce) {
        faults.deleteOnce = false;
        throw new ZooworkError(500, "down");
      }
      deleted.push(session);
      order.push(`delete ${session}`);
    },
  };
  const worker = { started: 0, woken: 0, stopped: 0, start() { this.started += 1; }, wake() { this.woken += 1; }, stop() { this.stopped += 1; } };
  const log: string[] = [];
  const deps = { ...stores, client, agentId: "agt_1", instance: "inst", worker, log: (line: string) => log.push(line), timeoutMs: 50 };
  return { dir, stores, deps, deleted, order, faults, worker, log };
}

const passing = (): Script => ({ events: [searched(), reply("They last 24 hours. [source: exports/export-links.md]"), finished()] });

test("an answer is scored from what the chat would show, using the run's saved searches", async () => {
  const t = await harness(passing);
  const [result] = await runEval(t.deps, [answerable]);
  assert.equal(result!.pass, true);
  assert.deepEqual(result!.outcome?.sources, ["exports/export-links.md"]);
  assert.equal(result!.outcome?.reply, "They last 24 hours. [1]");
  assert.equal(result!.outcome?.searches, 1);
  assert.deepEqual(result!.outcome?.queries, ["export link expiry"]);
  assert.deepEqual([t.worker.started, t.worker.woken, t.worker.stopped], [1, 1, 1]);
});

test("a citation the run never received does not count", async () => {
  const t = await harness(() => ({ events: [reply("24 hours. [source: exports/export-links.md]"), finished()], search: false }));
  const [result] = await runEval(t.deps, [answerable]);
  assert.equal(result!.reason, "source_missing:exports/export-links.md");
  assert.deepEqual(result!.outcome?.unverified, ["exports/export-links.md"]);
});

test("a refusal after a failed search fails with the search's code", async () => {
  const t = await harness(() => ({
    events: [searched(), reply(`${REFUSAL} I searched.`), finished()],
    search: { status: "failed", code: "cloudflare_http_500", passages: [] },
  }));
  const [result] = await runEval(t.deps, [refused]);
  assert.equal(result!.reason, "search_failed:cloudflare_http_500");
});

test("a failed run is reported, and a run that never ends times out", async () => {
  const failed = await harness(() => ({ events: [reply("partial"), finished("failed")] }));
  assert.equal((await runEval(failed.deps, [answerable]))[0]!.reason, "run_failed");
  const stuck = await harness(() => ({ events: [], hang: true }));
  const [result] = await runEval(stuck.deps, [answerable]);
  assert.equal(result!.reason, "timeout");
  assert.deepEqual(stuck.deleted, ["ses_1"]);
});

test("each question gets its own Session, deleted with its evidence right after", async () => {
  const t = await harness(passing);
  await runEval(t.deps, [answerable, { ...answerable, id: "again" }]);
  assert.deepEqual(t.order, ["create ses_1", "delete ses_1", "create ses_2", "delete ses_2"]);
  assert.deepEqual(await t.stores.sessions.list({ includeArchived: true }), []);
  assert.equal(await t.stores.evidence.get("cc_1"), undefined);
});

test("a Session that could not be deleted stays recorded, and the next eval removes it", async () => {
  const t = await harness(passing);
  t.faults.deleteOnce = true;
  await runEval(t.deps, [answerable]);
  assert.match(t.log.join("\n"), /Could not delete Session ses_1/);
  assert.deepEqual((await t.stores.sessions.list()).map((s) => s.id), ["ses_1"]);
  await runEval(t.deps, []);
  assert.deepEqual(t.deleted, ["ses_1"]);
  assert.deepEqual(await t.stores.sessions.list(), []);
  assert.match(t.log.join("\n"), /Removed 1 Session/);
});

test("a create whose response was lost is resolved and removed, not left behind", async () => {
  const t = await harness(passing);
  t.faults.create = 1;
  const [result] = await runEval(t.deps, [answerable]);
  assert.equal(result!.reason, "error:request_failed");
  assert.equal((await t.stores.sessions.listPendingCreates()).length, 1);
  assert.equal(await removeEvalSessions(t.deps), 1);
  assert.deepEqual(t.deleted, ["ses_1"]);
  assert.deepEqual(await t.stores.sessions.listPendingCreates(), []);
});

test("cleanup removes what a crashed eval left and retires its index", async () => {
  const t = await harness(passing);
  const now = new Date().toISOString();
  await t.stores.sessions.add({ id: "ses_left", title: "q", createdAt: now, updatedAt: now });
  await t.stores.evidence.save(savedSearch("ses_left"));
  await clearEvalState(t.deps, "inst", t.dir);
  assert.deepEqual(t.deleted, ["ses_left"]);
  const files = await readdir(join(t.dir, ".local"));
  assert.ok(files.includes("eval-sessions.retired-inst.json"));
  assert.ok(!files.includes("eval-sessions.json") && !files.includes("eval-evidence.json"));
});

test("Ctrl+C stops before the next question, and the rest count as not asked", async () => {
  const stop = new AbortController();
  const t = await harness(passing);
  const log = t.deps.log;
  const results = await runEval({ ...t.deps, signal: stop.signal, log: (line) => (log(line), stop.abort()) }, [answerable, { ...answerable, id: "b" }]);
  assert.equal(results.length, 1);
  assert.equal(formatSummary(results, 2), "Passed 1 of 2. 1 not asked. Searches: 1.");
  assert.deepEqual(t.deleted, ["ses_1"]);
});

test("output names the failure and shows the reply; a pass stays on one line", () => {
  assert.deepEqual(formatResult({ id: "a", kind: "direct", pass: true, seconds: 3, outcome: outcome() }), [
    "PASS  direct       a  3s  searches=1  sources=exports/export-links.md",
  ]);
  const failed = formatResult({ id: "a", kind: "synonym", pass: false, reason: "fragment_missing:x", seconds: 3, outcome: outcome({ reply: "A\nreply" }) });
  assert.match(failed[0]!, /^FAIL .*reason=fragment_missing:x$/);
  assert.equal(failed[1], "      reply: A reply");
  assert.equal(failed[2], "      searched: export links");
});

test("outcomeOf has nothing to report before a run", () => {
  const events: WireEvent[] = [];
  assert.equal(outcomeOf(foldEvents(events)).status, "no_run");
});

test("eval refuses while the web server runs, and before setup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-eval-"));
  const client = { getAgent: async () => assert.fail("must not reach the Platform") };
  await assert.rejects(evalPreflight(client, dir), /run_setup_first/);
  await mkdir(join(dir, ".local"));
  await writeFile(webPidPath(dir), `${process.ppid}\n`);
  await assert.rejects(evalPreflight(client, dir), /web_server_running/);
});

test("eval tests the Agent the files describe", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-eval-"));
  const { resource } = loadAgentDefinition();
  const state = newAgentState(resource);
  state.agentId = "agt_1";
  await saveAgentState(agentStatePath(dir), state);
  await mkdir(join(dir, "agent"));
  await writeFile(join(dir, "agent", "agent.md"), await readFile("agent/agent.md", "utf8"));
  const recorded = (await loadAgentState(agentStatePath(dir)))!;
  const agent = (desired_state: string, declared: unknown) => ({
    getAgent: async () => ({ agent_id: "agt_1", labels: recorded.createBody.labels, declared, status: { desired_state } }) as never,
  });
  await assert.rejects(evalPreflight(agent("stopped", recorded.createBody), dir), /agent_not_running/);
  await assert.rejects(evalPreflight(agent("running", { ...recorded.createBody, name: "Other" }), dir), /agent_definition_changed/);
  assert.deepEqual(await evalPreflight(agent("running", recorded.createBody), dir), { agentId: "agt_1", instance: state.instance });
});
