import assert from "node:assert/strict";
import { test } from "node:test";
import { aliasUserMessage, applyEvent, initialProjection, isBusy, project, THINKING_LABEL } from "../lib/chat/reducer";
import type { WireEvent } from "../lib/chat/wire";

let seq = 0;
const ev = (eventType: string, payload: Record<string, unknown> = {}): WireEvent => ({ seq: ++seq, eventType, payload });
const user = (text: string) => ev("user.message", { content: [{ type: "text", text }] });
const say = (text: string) => ev("agent.assistant", { segment: 1, message: { role: "assistant", content: [{ type: "text", text }] } });
const tool = (phase: string, extra: Record<string, unknown> = {}) =>
  ev("agent.tool", { phase, toolName: "web_search", toolCallId: "call_1", ...extra });

test("folds a complete turn into a user bubble and one assistant message", () => {
  const state = project([
    user("hello"),
    ev("run.started"),
    ev("agent.lifecycle", { phase: "start" }),
    ev("agent.thinking", { text: "private reasoning" }),
    tool("start", { args: { query: "q" } }),
    tool("end", { isError: false, resultPreview: "3 results" }),
    say("Hi there."),
    ev("run.finished", { status: "succeeded" }),
  ]);
  assert.equal(state.messages.length, 2);
  const [u, a] = state.messages;
  assert.deepEqual(u!.content, [{ type: "text", text: "hello" }]);
  assert.equal(a!.role, "assistant");
  assert.deepEqual(
    a!.content.map((p) => p.type),
    ["reasoning", "tool-call", "text"],
  );
  // Reasoning text is never shown; only a progress label.
  assert.deepEqual(a!.content[0], { type: "reasoning", text: THINKING_LABEL });
  const t = a!.content[1]!;
  assert.ok(t.type === "tool-call" && t.args.query === "q" && t.result?.text === "3 results" && !t.isError);
  assert.deepEqual(a!.status, { type: "complete", reason: "stop" });
  assert.equal(isBusy(state), false);
});

test("a running turn is busy and its message reads running", () => {
  const state = project([user("x"), ev("run.started"), say("partial")]);
  assert.equal(isBusy(state), true);
  assert.deepEqual(state.messages.at(-1)!.status, { type: "running" });
});

test("ignores events at or below the last folded seq (replay overlap)", () => {
  const events = [user("a"), ev("run.started"), say("b"), ev("run.finished", { status: "succeeded" })];
  const once = project(events);
  const twice = project(events, once);
  assert.equal(twice, once);
});

test("a failed run shows the agent error even with no output", () => {
  const state = project([
    user("x"),
    ev("run.started"),
    ev("agent.error", { errorMessage: "model unavailable" }),
    ev("run.finished", { status: "failed" }),
  ]);
  assert.deepEqual(state.messages.at(-1)!.status, { type: "incomplete", reason: "error", error: "model unavailable" });
});

test("a tool error does not fail a succeeded run", () => {
  const state = project([
    user("x"),
    ev("run.started"),
    tool("start"),
    tool("end", { isError: true, resultPreview: "timeout" }),
    say("I could not search, but here is what I know."),
    ev("run.finished", { status: "succeeded" }),
  ]);
  const a = state.messages.at(-1)!;
  assert.deepEqual(a.status, { type: "complete", reason: "stop" });
  const t = a.content.find((p) => p.type === "tool-call");
  assert.ok(t?.type === "tool-call" && t.isError === true);
});

test("approval gate: requested, then allowed", () => {
  let state = project([user("x"), ev("run.started"), tool("start")]);
  state = applyEvent(state, ev("agent.approval", { phase: "requested", approvalId: "apr_1", toolCallId: "call_1", toolName: "web_search" }));
  assert.deepEqual(state.pendingApprovals, ["apr_1"]);
  assert.deepEqual(state.messages.at(-1)!.status, { type: "requires-action", reason: "tool-calls" });
  let part = state.messages.at(-1)!.content.find((p) => p.type === "tool-call");
  assert.ok(part?.type === "tool-call" && part.approval?.id === "apr_1" && part.approval.approved === undefined);
  state = applyEvent(state, ev("agent.approval", { phase: "resolved", approvalId: "apr_1", toolCallId: "call_1", resolution: "allow-once" }));
  part = state.messages.at(-1)!.content.find((p) => p.type === "tool-call");
  assert.ok(part?.type === "tool-call" && part.approval?.approved === true);
  assert.deepEqual(state.pendingApprovals, []);
  assert.deepEqual(state.messages.at(-1)!.status, { type: "running" });
});

test("approval gate: interrupted while waiting ends blocked and cancelled", () => {
  const state = project([
    user("x"),
    ev("run.started"),
    tool("start"),
    ev("agent.approval", { phase: "requested", approvalId: "apr_2", toolCallId: "call_1" }),
    tool("blocked", { deniedReason: "interrupted" }),
    ev("run.finished", { status: "aborted" }),
  ]);
  const a = state.messages.at(-1)!;
  const part = a.content.find((p) => p.type === "tool-call");
  assert.ok(part?.type === "tool-call");
  assert.equal(part.result?.blocked, "interrupted");
  assert.equal(part.approval?.approved, false);
  assert.equal(part.approval?.reason, "Stopped");
  assert.deepEqual(a.status, { type: "incomplete", reason: "cancelled" });
  assert.equal(isBusy(state), false);
});

test("an unanswered gate is removed when the run ends", () => {
  const state = project([
    user("x"),
    ev("run.started"),
    tool("start"),
    ev("agent.approval", { phase: "requested", approvalId: "apr_3", toolCallId: "call_1" }),
    ev("run.finished", { status: "aborted" }),
  ]);
  const part = state.messages.at(-1)!.content.find((p) => p.type === "tool-call");
  assert.ok(part?.type === "tool-call" && part.approval === undefined);
});

test("a new user message starts a new assistant message; old turns keep their outcome", () => {
  const state = project([
    user("one"),
    ev("run.started"),
    say("first"),
    ev("run.finished", { status: "succeeded" }),
    user("two"),
    ev("run.started"),
  ]);
  assert.deepEqual(
    state.messages.map((m) => m.role),
    ["user", "assistant", "user"],
  );
  assert.deepEqual(state.messages[1]!.status, { type: "complete", reason: "stop" });
  assert.equal(isBusy(state), true);
});

test("aliasUserMessage keeps the optimistic id whether the echo came first or later", () => {
  const echo = user("hi");
  // Echo already folded: rename in place.
  let state = applyEvent(initialProjection(), echo);
  state = aliasUserMessage(state, echo.seq, "local-abc");
  assert.equal(state.messages[0]!.id, "local-abc");
  // Alias first, echo later.
  const echo2 = user("again");
  let later = aliasUserMessage(initialProjection(), echo2.seq, "local-def");
  later = applyEvent(later, echo2);
  assert.equal(later.messages[0]!.id, "local-def");
});

test("unknown event types are ignored", () => {
  const state = project([user("x"), ev("agent.something_new", { a: 1 })]);
  assert.equal(state.messages.length, 1);
});
