import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentRecord,
  type ZooworkClient,
  ZooworkError,
} from "@zoowork-ai/sdk";
import { newState, saveState, STAGING_URL } from "../src/platform.js";
import { Store } from "../src/store.js";
import { cleanupApplication } from "../src/cleanup.js";

async function context(
  action: (value: {
    client: ZooworkClient;
    calls: string[];
    store: Store;
    state: ReturnType<typeof newState>;
    path: string;
    dir: string;
  }) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "support-cleanup-")),
    path = join(dir, "agent.json");
  const state = newState(
    { apiKey: "zwp_live_synthetic", baseUrl: STAGING_URL },
    "customer-support",
    { name: "test" },
  );
  state.agentId = "agent-synthetic";
  await saveState(path, state);
  const store = new Store(
      join(dir, "support.sqlite"),
      `${state.baseUrl}:${state.instance}:${state.agentId}`,
    ),
    calls: string[] = [];
  const client = {
    getAgent: async () =>
      ({
        agent_id: state.agentId,
        declared: { labels: state.resource.labels },
      }) as AgentRecord,
    getSession: async (_agent: string, session: string) => {
      calls.push("get:" + session);
      const conversation = store
        .conversations()
        .find((value) => value.sessionId === session)!;
      return { session_id: session, metadata: conversation.request.metadata };
    },
    deleteSession: async (_agent: string, session: string) => {
      calls.push("delete:" + session);
    },
    stopAgent: async () => {
      calls.push("stop");
    },
    deleteAgent: async () => {
      calls.push("delete-agent");
    },
  } as unknown as ZooworkClient;
  try {
    await action({ client, calls, store, state, path, dir });
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}
test("cleanup deletes only recorded Sessions and archives business state after Agent removal", async () =>
  context(async (c) => {
    for (const session of ["session-one", "session-two"]) {
      const conversation = c.store.newConversation(c.store.visitor().id);
      conversation.sessionId = session;
      c.store.saveConversation(conversation);
    }
    await cleanupApplication(c.client, c.state, c.path);
    assert.deepEqual(c.calls, [
      "get:session-two",
      "delete:session-two",
      "get:session-one",
      "delete:session-one",
      "stop",
      "delete-agent",
    ]);
    assert.deepEqual(
      (await readdir(c.dir)).filter((name) => name.endsWith(".sqlite")),
      [`archived-${c.state.instance}.sqlite`],
    );
  }));
test("cleanup is blocked while the app event consumer is running", async () =>
  context(async (c) => {
    c.store.claimProcess();
    await assert.rejects(
      cleanupApplication(c.client, c.state, c.path),
      /app_already_running/,
    );
    assert.deepEqual(c.calls, []);
    c.store.releaseProcess();
  }));
test("cleanup preserves uncertain Session creation and stops before Agent deletion", async () =>
  context(async (c) => {
    c.store.newConversation(c.store.visitor().id);
    await assert.rejects(
      cleanupApplication(c.client, c.state, c.path),
      /session_creation_uncertain_keep_database/,
    );
    assert.deepEqual(c.calls, []);
  }));
test("cleanup refuses Session metadata from another app and preserves all state", async () =>
  context(async (c) => {
    const conversation = c.store.newConversation(c.store.visitor().id);
    conversation.sessionId = "session-one";
    c.store.saveConversation(conversation);
    c.client.getSession = async () => ({
      session_id: "session-one",
      metadata: { source: "other-app" },
    });
    await assert.rejects(
      cleanupApplication(c.client, c.state, c.path),
      /session_metadata_mismatch_keep_database/,
    );
    assert.deepEqual(c.calls, []);
    assert.ok((await readdir(c.dir)).includes("agent.json"));
  }));
test("a failed Session delete preserves the Agent and recovery database", async () =>
  context(async (c) => {
    const conversation = c.store.newConversation(c.store.visitor().id);
    conversation.sessionId = "session-one";
    c.store.saveConversation(conversation);
    c.client.deleteSession = async () => {
      throw new ZooworkError(500, "synthetic");
    };
    await assert.rejects(cleanupApplication(c.client, c.state, c.path));
    assert.ok(!c.calls.includes("stop"));
    assert.ok((await readdir(c.dir)).includes("agent.json"));
  }));
