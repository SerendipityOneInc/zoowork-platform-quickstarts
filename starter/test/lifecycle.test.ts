import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ZooworkError, type AgentRecord, type AgentResource } from "@zoowork-ai/sdk";
import { agentStatus, applyAgent, cleanupAgent, declares, type LifecycleClient } from "../lib/zoowork/lifecycle";
import { createRecordedSession } from "../lib/zoowork/session-create";
import { fileSessionStore } from "../lib/zoowork/sessions";
import { loadAgentState, newAgentState, saveAgentState } from "../lib/zoowork/state";

const BASE = "https://api.example.test/service/v1";
const resource = (instructions = "Be helpful."): AgentResource => ({
  name: "Test",
  persona: { docs: [{ name: "AGENTS.md", content: instructions }] },
  include_global_skills: false,
  tool_policy: { allow: ["web_search"] },
});

function fakePlatform() {
  const agents = new Map<string, { declared: Record<string, unknown>; desired_state: string }>();
  const byKey = new Map<string, string>();
  const calls: string[] = [];
  const deletedSessions: string[] = [];
  const sessionsByKey = new Map<string, string>();
  let n = 0;
  let failNextCreateAfterCommit = false;
  const record = (id: string): AgentRecord => {
    const a = agents.get(id);
    if (!a) throw new ZooworkError(404, "not found");
    return { agent_id: id, declared: structuredClone(a.declared), status: { desired_state: a.desired_state } } as AgentRecord;
  };
  const client: LifecycleClient = {
    async createAgent(input, key) {
      calls.push("createAgent");
      let id = key ? byKey.get(key) : undefined;
      if (!id) {
        id = `agt_${++n}`;
        agents.set(id, { declared: structuredClone(input.resource) as unknown as Record<string, unknown>, desired_state: "stopped" });
        if (key) byKey.set(key, id);
      }
      if (failNextCreateAfterCommit) {
        failNextCreateAfterCommit = false;
        throw new TypeError("fetch failed"); // the response was lost after the create committed
      }
      return { agent_id: id };
    },
    async getAgent(id) {
      calls.push("getAgent");
      return record(id);
    },
    async updateAgent(id, sections) {
      calls.push("updateAgent");
      const a = agents.get(id)!;
      a.declared = { ...a.declared, ...structuredClone(sections) };
      return record(id);
    },
    async startAgent(id) {
      calls.push("startAgent");
      agents.get(id)!.desired_state = "running";
      return { warnings: [] };
    },
    async stopAgent(id) {
      calls.push("stopAgent");
      agents.get(id)!.desired_state = "stopped";
      return { warnings: [] };
    },
    async deleteAgent(id) {
      calls.push("deleteAgent");
      agents.delete(id);
    },
    async createSession(_agentId, _input, key) {
      calls.push("createSession");
      let id = key ? sessionsByKey.get(key) : undefined;
      if (!id) {
        id = `ses_${sessionsByKey.size + 1}`;
        if (key) sessionsByKey.set(key, id);
      }
      return { session_id: id };
    },
    async deleteSession(_agentId, sessionId) {
      calls.push(`deleteSession:${sessionId}`);
      deletedSessions.push(sessionId);
      if (sessionId === "ses_gone") throw new ZooworkError(404, "gone");
    },
  };
  return { client, agents, calls, deletedSessions, sessionsByKey, failCreateOnce: () => (failNextCreateAfterCommit = true) };
}

const tempDir = async () => mkdtemp(join(tmpdir(), "starter-test-"));

test("declares compares only desired fields", () => {
  assert.ok(declares({ a: 1, b: { c: [1, 2], d: "x" }, extra: true }, { a: 1, b: { c: [1, 2] } }));
  assert.ok(!declares({ a: 1, b: { c: [1] } }, { b: { c: [1, 2] } }));
  assert.ok(!declares(undefined, { a: 1 }));
});

test("setup creates once, records state, labels the Agent and starts it", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const first = await applyAgent(p.client, path, undefined, BASE, resource());
  assert.equal(first.action, "created");
  const state = await loadAgentState(path, BASE);
  assert.equal(state?.agentId, first.agentId);
  const labels = p.agents.get(first.agentId)!.declared.labels as Record<string, string>;
  assert.equal(labels.starter_app, "starter");
  assert.equal(labels.starter_instance, state!.instance);
  assert.equal(p.agents.get(first.agentId)!.desired_state, "running");
  // Running setup again changes nothing.
  const again = await applyAgent(p.client, path, state, BASE, resource());
  assert.equal(again.action, "unchanged");
  assert.equal(p.calls.filter((c) => c === "createAgent").length, 1);
  assert.equal(p.calls.filter((c) => c === "updateAgent").length, 0);
});

test("a lost create response is repeated with the same key, not a second Agent", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  p.failCreateOnce();
  await assert.rejects(applyAgent(p.client, path, undefined, BASE, resource()));
  const pending = await loadAgentState(path, BASE);
  assert.ok(pending && !pending.agentId, "create body and key are saved before the request");
  const result = await applyAgent(p.client, path, pending, BASE, resource());
  assert.equal(p.agents.size, 1);
  assert.equal(result.agentId, [...p.agents.keys()][0]);
});

test("a changed definition updates the same Agent and is confirmed by reading it back", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId } = await applyAgent(p.client, path, undefined, BASE, resource("v1"));
  const state = await loadAgentState(path, BASE);
  assert.equal((await agentStatus(p.client, state!, resource("v2"))).definitionApplied, false);
  const result = await applyAgent(p.client, path, state, BASE, resource("v2"));
  assert.equal(result.action, "updated");
  assert.equal(result.agentId, agentId);
  const persona = p.agents.get(agentId)!.declared.persona as AgentResource["persona"];
  assert.equal(persona!.docs[0]!.content, "v2");
  const after = await loadAgentState(path, BASE);
  assert.equal(after?.pendingUpdate, undefined);
  assert.equal((await agentStatus(p.client, after!, resource("v2"))).definitionApplied, true);
});

test("refuses state from another deployment and Agents without this instance's labels", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId } = await applyAgent(p.client, path, undefined, BASE, resource());
  await assert.rejects(loadAgentState(path, "https://other.example.test/service/v1"), /state_scope_mismatch/);
  (p.agents.get(agentId)!.declared.labels as Record<string, string>).starter_instance = "someone-else";
  const state = await loadAgentState(path, BASE);
  await assert.rejects(applyAgent(p.client, path, state, BASE, resource()), /agent_label_mismatch/);
});

test("cleanup deletes only recorded Sessions, then stops and deletes the Agent, then retires state", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, resource());
  const sessions = fileSessionStore(join(dir, "sessions.json"), { instance: state.instance, agentId });
  const now = new Date().toISOString();
  await sessions.add({ id: "ses_a", title: "a", createdAt: now, updatedAt: now });
  await sessions.add({ id: "ses_gone", title: "b", createdAt: now, updatedAt: now, archived: true });
  const result = await cleanupAgent(p.client, path, state, sessions);
  assert.equal(result.sessionsDeleted, 2);
  assert.deepEqual(p.deletedSessions.sort(), ["ses_a", "ses_gone"]);
  const order = p.calls.filter((c) => c.startsWith("deleteSession") || c === "stopAgent" || c === "deleteAgent");
  assert.deepEqual(order.slice(-2), ["stopAgent", "deleteAgent"]);
  assert.equal(p.agents.size, 0);
  const files = await readdir(dir);
  assert.ok(!files.includes("agent.json"));
  assert.ok(files.some((f) => f.startsWith("agent.retired-")));
  assert.ok(files.some((f) => f.startsWith("sessions.retired-")));
});

test("a failed cleanup keeps local state", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, resource());
  p.client.stopAgent = async () => {
    throw new ZooworkError(503, "unavailable");
  };
  const sessions = fileSessionStore(join(dir, "sessions.json"), { instance: state.instance, agentId });
  await assert.rejects(cleanupAgent(p.client, path, state, sessions));
  assert.equal(JSON.parse(await readFile(path, "utf8")).agentId, agentId);
});

test("session store rejects an index from another Agent", async () => {
  const dir = await tempDir();
  const file = join(dir, "sessions.json");
  const now = new Date().toISOString();
  await fileSessionStore(file, { instance: "i1", agentId: "agt_1" }).add({ id: "ses_1", title: "t", createdAt: now, updatedAt: now });
  await assert.rejects(fileSessionStore(file, { instance: "i2", agentId: "agt_2" }).list(), /state_scope_mismatch/);
});

test("local state files are private to the user", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  await saveAgentState(path, newAgentState(BASE, resource()));
  assert.equal((await stat(path)).mode & 0o077, 0);
});

test("removing the thinking level sends thinking: null and confirms it is gone", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const withThinking = { ...resource(), model: { primary: "m1", thinking: "high" as const } };
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, withThinking);
  const sent: Record<string, unknown>[] = [];
  const update = p.client.updateAgent;
  p.client.updateAgent = async (id, sections) => {
    sent.push(structuredClone(sections));
    // The Platform clears a null thinking level instead of storing it.
    const model = { ...(sections.model as Record<string, unknown>) };
    if (model.thinking === null) delete model.thinking;
    const result = await update(id, { ...sections, model });
    (p.agents.get(id)!.declared as Record<string, unknown>).model = model;
    return result;
  };
  const withoutThinking = { ...resource(), model: { primary: "m1" } };
  assert.equal((await agentStatus(p.client, state, withoutThinking)).definitionApplied, false);
  const result = await applyAgent(p.client, path, state, BASE, withoutThinking);
  assert.equal(result.action, "updated");
  assert.deepEqual(sent[0]!.model, { primary: "m1", thinking: null });
  assert.equal((p.agents.get(agentId)!.declared.model as Record<string, unknown>).thinking, undefined);
  assert.equal((await agentStatus(p.client, result.state, withoutThinking)).definitionApplied, true);
});

test("removing a setting the Platform cannot clear is refused before any request", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const full: AgentResource = { ...resource(), model: { primary: "m1", max_tokens: 1000 }, userTimezone: "Asia/Shanghai", skills: [{ name: "s" }] };
  const { state } = await applyAgent(p.client, path, undefined, BASE, full);
  const cases: [AgentResource, RegExp][] = [
    [{ ...full, model: undefined }, /cannot_remove_model/],
    [{ ...full, model: { primary: "m1" } }, /cannot_remove_max_tokens/],
    [{ ...full, userTimezone: undefined }, /cannot_remove_timezone/],
    [{ ...full, skills: undefined }, /skills_removed_set_empty_list/],
  ];
  for (const [definition, code] of cases) {
    const before = p.calls.length;
    await assert.rejects(applyAgent(p.client, path, state, BASE, definition), code);
    assert.equal(p.calls.length, before, "no Platform request was made");
    assert.equal((await agentStatus(p.client, state, definition)).definitionApplied, false);
  }
  // An explicit empty list is a change setup can make.
  const result = await applyAgent(p.client, path, state, BASE, { ...full, skills: [] });
  assert.equal(result.action, "updated");
});

test("an update the Platform does not apply fails instead of reporting success", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { state } = await applyAgent(p.client, path, undefined, BASE, resource("v1"));
  p.client.updateAgent = async (id) => p.client.getAgent(id); // accepted, but nothing changes
  await assert.rejects(applyAgent(p.client, path, state, BASE, resource("v2")), /agent_update_not_confirmed/);
  const kept = await loadAgentState(path, BASE);
  assert.ok(kept?.pendingUpdate, "the pending update stays recorded");
});

test("cleanup interrupted after the Agent was deleted can be run again to finish", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, resource());
  const sessions = fileSessionStore(join(dir, "sessions.json"), { instance: state.instance, agentId });
  // The process dies right after the delete request succeeded.
  const del = p.client.deleteAgent;
  p.client.deleteAgent = async (id) => {
    await del(id);
    throw new Error("killed");
  };
  await assert.rejects(cleanupAgent(p.client, path, state, sessions), /killed/);
  p.client.deleteAgent = del;
  const recorded = await loadAgentState(path, BASE);
  assert.ok(recorded?.agentDeleteRequestedAt);
  await assert.rejects(applyAgent(p.client, path, recorded, BASE, resource()), /cleanup_incomplete_run_cleanup/);
  await cleanupAgent(p.client, path, recorded!, sessions);
  assert.ok((await readdir(dir)).some((f) => f.startsWith("agent.retired-")));
});

test("cleanup does not treat a 404 as deleted unless it sent the delete", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, resource());
  p.agents.delete(agentId); // e.g. a key from another Project cannot see it
  const sessions = fileSessionStore(join(dir, "sessions.json"), { instance: state.instance, agentId });
  await assert.rejects(cleanupAgent(p.client, path, state, sessions), (e: unknown) => e instanceof ZooworkError && e.status === 404);
  assert.ok((await readdir(dir)).includes("agent.json"));
});

test("a lost update response is reconciled: a reverted setting is cleared, not reported as matching", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const base = { ...resource(), model: { primary: "m1" } };
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, base);
  // Clearing a null thinking level removes it, as the Platform does.
  const update = p.client.updateAgent;
  p.client.updateAgent = async (id, sections) => {
    const model = { ...(sections.model as Record<string, unknown>) };
    if (model.thinking === null) delete model.thinking;
    await update(id, sections);
    (p.agents.get(id)!.declared as Record<string, unknown>).model = model;
    return p.client.getAgent(id);
  };
  // Add thinking: the update applies on the Platform, but its response is lost.
  const applyThenLose = p.client.updateAgent;
  p.client.updateAgent = async (id, sections) => {
    await applyThenLose(id, sections);
    throw new TypeError("fetch failed");
  };
  await assert.rejects(applyAgent(p.client, path, state, BASE, { ...base, model: { primary: "m1", thinking: "high" } }));
  p.client.updateAgent = applyThenLose;
  assert.equal((p.agents.get(agentId)!.declared.model as Record<string, unknown>).thinking, "high");

  // Revert agent.md to no thinking. Status must not claim a match, and setup must clear it.
  const recorded = (await loadAgentState(path, BASE))!;
  assert.ok(recorded.pendingUpdate);
  assert.equal((await agentStatus(p.client, recorded, base)).definitionApplied, false);
  const result = await applyAgent(p.client, path, recorded, BASE, base);
  assert.equal(result.action, "updated");
  assert.equal((p.agents.get(agentId)!.declared.model as Record<string, unknown>).thinking, undefined);
  const after = (await loadAgentState(path, BASE))!;
  assert.equal(after.pendingUpdate, undefined);
  assert.equal((await agentStatus(p.client, after, base)).definitionApplied, true);
});

test("a lost update that added a setting the Platform cannot clear is refused on revert", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { state } = await applyAgent(p.client, path, undefined, BASE, resource());
  const update = p.client.updateAgent;
  p.client.updateAgent = async (id, sections) => {
    await update(id, sections);
    throw new TypeError("fetch failed");
  };
  await assert.rejects(applyAgent(p.client, path, state, BASE, { ...resource(), userTimezone: "Asia/Shanghai" }));
  p.client.updateAgent = update;
  const recorded = (await loadAgentState(path, BASE))!;
  await assert.rejects(applyAgent(p.client, path, recorded, BASE, resource()), /cannot_remove_timezone/);
  assert.equal((await agentStatus(p.client, recorded, resource())).definitionApplied, false);
});

test("cleanup first resolves a Session create whose response was lost, then deletes it", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, resource());
  const sessions = fileSessionStore(join(dir, "sessions.json"), { instance: state.instance, agentId });
  // The create reached the Platform, but the app never recorded its result.
  p.sessionsByKey.set("k-lost", "ses_lost");
  await sessions.savePendingCreate({ threadId: "t1", idempotencyKey: "k-lost", title: "t", metadata: {}, requestedAt: new Date().toISOString() });
  await cleanupAgent(p.client, path, state, sessions);
  assert.ok(p.deletedSessions.includes("ses_lost"));
});

test("cleanup stops and keeps state when a lost Session create cannot be resolved", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, resource());
  const sessions = fileSessionStore(join(dir, "sessions.json"), { instance: state.instance, agentId });
  await sessions.savePendingCreate({ threadId: "t1", idempotencyKey: "k1", title: "t", metadata: {}, requestedAt: new Date().toISOString() });
  p.client.createSession = async () => {
    throw new ZooworkError(503, "unavailable");
  };
  await assert.rejects(cleanupAgent(p.client, path, state, sessions), /session_creation_uncertain_retry_cleanup/);
  assert.ok(p.agents.has(agentId), "the Agent is not deleted");
  assert.equal((await sessions.listPendingCreates()).length, 1);
});

test("a Session create refused while the Agent was stopped does not block cleanup", async () => {
  const dir = await tempDir();
  const path = join(dir, "agent.json");
  const p = fakePlatform();
  const { agentId, state } = await applyAgent(p.client, path, undefined, BASE, resource());
  const sessions = fileSessionStore(join(dir, "sessions.json"), { instance: state.instance, agentId });
  const create = p.client.createSession;
  p.client.createSession = async () => {
    throw new ZooworkError(409, "agent is not running", "agent_not_running");
  };
  await assert.rejects(
    createRecordedSession(p.client, agentId, sessions, {
      threadId: "t1",
      idempotencyKey: "k1",
      title: "t",
      metadata: {},
      requestedAt: new Date().toISOString(),
    }),
    /agent is not running/,
  );
  assert.equal((await sessions.listPendingCreates()).length, 0);
  p.client.createSession = create;
  await cleanupAgent(p.client, path, state, sessions);
  assert.equal(p.agents.size, 0);
});
