import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEvents, emptyView, runSources, toThreadMessages, type RunTurn } from "../lib/chat/reducer";
import type { WireEvent } from "../lib/chat/wire";
import { citedKeys, renderCitations, verifyCitations } from "../lib/knowledge/citations";
import { enrichEvent } from "../lib/knowledge/enrich";
import type { EvidenceCall, EvidenceStore } from "../lib/knowledge/evidence";

const passage = (key: string, text = "Export links expire after 24 hours.", score = 0.9) => ({ key, title: "Export links", text, score });

test("citation markers are read from the reply, once each", () => {
  const text = "One [source: a.md], two [Source:b/c.md] and again [source: a.md]. Not this: [link](a.md)";
  assert.deepEqual(citedKeys(text), ["a.md", "b/c.md"]);
});

test("only keys the search returned become sources", () => {
  const text = "True [source: exports/export-links.md]. Made up [source: billing/secret.md].";
  const citations = verifyCitations(text, [passage("exports/export-links.md")]);
  assert.deepEqual(citations.sources.map((s) => s.key), ["exports/export-links.md"]);
  assert.deepEqual(citations.unverified, ["billing/secret.md"]);
  assert.equal(renderCitations(text, citations), "True [1]. Made up [unverified source].");
});

test("a source shows its best passages, without repeats", () => {
  const citations = verifyCitations("x [source: a.md]", [passage("a.md", "low", 0.1), passage("a.md", "high", 0.9), passage("a.md", "high", 0.9)]);
  assert.deepEqual(citations.sources[0]!.excerpts, ["high", "low"]);
});

test("with no passages, every citation is unverified", () => {
  assert.deepEqual(verifyCitations("x [source: a.md]", []), { sources: [], unverified: ["a.md"] });
});

function store(calls: EvidenceCall[]): EvidenceStore {
  return {
    get: async (id) => calls.find((c) => c.callId === id),
    forRun: async (sessionId, runId) => calls.filter((c) => c.sessionId === sessionId && c.runId === runId),
    save: async () => {},
  };
}

const call = (over: Partial<EvidenceCall>): EvidenceCall => ({
  callId: "cc_1",
  sessionId: "s1",
  runId: "run_1",
  query: "export links",
  status: "ok",
  passages: [passage("exports/export-links.md")],
  requestedAt: "2026-11-02T00:00:00Z",
  delivered: true,
  ...over,
});

const assistant = (seq: number, runId: string, text: string): WireEvent => ({
  seq,
  runId,
  eventType: "agent.assistant",
  payload: { message: { role: "assistant", content: [{ type: "text", text }] } },
});

const requested = (seq: number, runId: string): WireEvent => ({
  seq,
  runId,
  eventType: "agent.custom_tool_use",
  payload: { phase: "requested", callId: "cc_1", toolCallId: "tc_1", name: "search_knowledge", input: { query: "export links" } },
});

const resolved = (seq: number, runId: string, isError = false): WireEvent => ({
  seq,
  runId,
  eventType: "agent.custom_tool_use",
  payload: { phase: "resolved", callId: "cc_1", toolCallId: "tc_1", name: "search_knowledge", outcome: "completed", isError },
});

const finished = (seq: number, runId: string): WireEvent => ({ seq, runId, eventType: "run.finished", payload: { status: "succeeded" } });

async function play(events: WireEvent[], evidence: EvidenceStore) {
  const enriched = await Promise.all(events.map((e) => enrichEvent(evidence, "s1", e)));
  const view = applyEvents(emptyView(), enriched);
  return { view, turn: view.turns.find((t) => t.role === "assistant") as RunTurn };
}

test("a reply's citations are checked against its own run only", async () => {
  const evidence = store([call({ runId: "run_old" })]);
  const reply = await enrichEvent(evidence, "s1", assistant(1, "run_new", "Fact [source: exports/export-links.md]."));
  assert.deepEqual(reply.citations, { sources: [], unverified: ["exports/export-links.md"] });
});

test("another Session's search does not count", async () => {
  const evidence = store([call({ sessionId: "other" })]);
  const reply = await enrichEvent(evidence, "s1", assistant(1, "run_1", "Fact [source: exports/export-links.md]."));
  assert.deepEqual(reply.citations?.sources, []);
});

test("a cited reply shows its number and its source, the same on every replay", async () => {
  const events = [requested(1, "run_1"), resolved(2, "run_1"), assistant(3, "run_1", "24 hours [source: exports/export-links.md]."), finished(4, "run_1")];
  const { view, turn } = await play(events, store([call({})]));
  assert.deepEqual(turn.parts.at(-1), { type: "text", text: "24 hours [1]." });
  const sources = runSources(turn, view);
  assert.equal(sources.citations.sources[0]!.key, "exports/export-links.md");
  assert.equal(sources.searches, 1);
  assert.equal(sources.finished, true);
  assert.equal(sources.searchFailed, undefined);
  const metadata = toThreadMessages(view).at(-1)!.metadata as { custom: { sources: unknown } };
  assert.deepEqual(metadata.custom.sources, sources);
});

test("an invented source is flagged in the text and left out of the sources", async () => {
  const events = [requested(1, "run_1"), resolved(2, "run_1"), assistant(3, "run_1", "Fact [source: nope.md]."), finished(4, "run_1")];
  const { view, turn } = await play(events, store([call({})]));
  assert.deepEqual(turn.parts.at(-1), { type: "text", text: "Fact [unverified source]." });
  assert.deepEqual(runSources(turn, view).citations, { sources: [], unverified: ["nope.md"] });
});

test("nothing found is a successful search with no sources", async () => {
  const events = [requested(1, "run_1"), resolved(2, "run_1"), assistant(3, "run_1", "The Fernwick docs do not cover this."), finished(4, "run_1")];
  const { view, turn } = await play(events, store([call({ passages: [] })]));
  const sources = runSources(turn, view);
  assert.equal(view.tools.tc_1!.phase, "succeeded");
  assert.deepEqual(view.tools.tc_1!.search, { status: "ok", passages: 0 });
  assert.equal(sources.searchFailed, undefined);
  assert.deepEqual(sources.citations, { sources: [], unverified: [] });
});

test("a failed search is a failure, not an empty result", async () => {
  const events = [requested(1, "run_1"), resolved(2, "run_1", true), assistant(3, "run_1", "I could not search the docs right now."), finished(4, "run_1")];
  const { view, turn } = await play(events, store([call({ status: "failed", code: "cloudflare_http_500", passages: [] })]));
  assert.equal(view.tools.tc_1!.phase, "failed");
  assert.equal(runSources(turn, view).searchFailed, "cloudflare_http_500");
});

test("a search the Platform timed out shows as failed", async () => {
  const timedOut: WireEvent = { ...resolved(2, "run_1"), payload: { ...resolved(2, "run_1").payload, outcome: "timeout" } };
  const { view } = await play([requested(1, "run_1"), timedOut], store([]));
  assert.equal(view.tools.tc_1!.phase, "failed");
});
