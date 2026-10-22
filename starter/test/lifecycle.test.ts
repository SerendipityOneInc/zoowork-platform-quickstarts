import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ZooworkError, type AgentRecord, type AgentResource } from "@zoowork-ai/sdk";
import { agentStatus, applyAgent, cleanupAgent, declares, type LifecycleClient } from "../lib/zoowork/lifecycle";
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
    async deleteSession(_agentId, sessionId) {
      calls.push(`deleteSession:${sessionId}`);
      deletedSessions.push(sessionId);
      if (sessionId === "ses_gone") throw new ZooworkError(404, "gone");
    },
  };
  return { client, agents, calls, deletedSessions, failCreateOnce: () => (failNextCreateAfterCommit = true) };
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
