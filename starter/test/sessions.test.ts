import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ZooworkError } from "@zoowork-ai/sdk";
import { createPreviewPlatform } from "../lib/zoowork/preview";
import { createRecordedSession, recoverPendingCreates } from "../lib/zoowork/session-create";
import { fileSessionStore, type PendingSessionCreate } from "../lib/zoowork/sessions";

const AGENT = "agt_preview";
const scope = { instance: "inst", agentId: AGENT };

const request = (threadId: string): PendingSessionCreate => ({
  threadId,
  idempotencyKey: `starter:inst:session:${threadId}`,
  title: "Hello",
  metadata: { starter_app: "starter", starter_instance: "inst", title: "Hello" },
  requestedAt: new Date().toISOString(),
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "starter-sessions-"));
  const file = join(dir, "sessions.json");
  const platform = createPreviewPlatform({ stepMs: 1 });
  return { file, platform };
}

/** The create reaches the Platform, but the response is lost on the way back. */
function loseResponses(platform: ReturnType<typeof createPreviewPlatform>) {
  const create = platform.createSession.bind(platform);
  return {
    ...platform,
    createSession: async (...args: Parameters<typeof create>) => {
      await create(...args);
      throw new TypeError("fetch failed");
    },
  };
}

test("a lost create response is recovered after a restart, without a second Session", async () => {
  const { file, platform } = await setup();
  await assert.rejects(createRecordedSession(loseResponses(platform), AGENT, fileSessionStore(file, scope), request("t1")));
  assert.equal(platform.sessionCount(), 1);
  // A new process: a fresh store reads the pending record from disk.
  const restarted = fileSessionStore(file, scope);
  assert.equal((await restarted.list()).length, 0);
  assert.equal((await restarted.listPendingCreates()).length, 1);
  const result = await recoverPendingCreates(platform, AGENT, restarted);
  assert.deepEqual(result, { recovered: 1, remaining: 0 });
  assert.equal(platform.sessionCount(), 1, "the same Session was returned, not a new one");
  const listed = await restarted.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.title, "Hello");
  assert.equal((await restarted.listPendingCreates()).length, 0);
});

test("a retry from the same thread reuses the saved request and finds the same Session", async () => {
  const { file, platform } = await setup();
  const store = fileSessionStore(file, scope);
  await assert.rejects(createRecordedSession(loseResponses(platform), AGENT, store, request("t1")));
  const changedTitle = { ...request("t1"), title: "Different", metadata: { ...request("t1").metadata, title: "Different" } };
  const entry = await createRecordedSession(platform, AGENT, store, changedTitle);
  assert.equal(entry.title, "Hello", "the original saved body was resent");
  assert.equal(platform.sessionCount(), 1);
  assert.equal((await store.list()).length, 1);
});

test("a first attempt the Platform rejects with 400 leaves no pending record", async () => {
  const { file, platform } = await setup();
  const store = fileSessionStore(file, scope);
  const rejecting = { ...platform, createSession: async () => Promise.reject(new ZooworkError(400, "bad request")) };
  await assert.rejects(createRecordedSession(rejecting, AGENT, store, request("t1")));
  assert.equal((await store.listPendingCreates()).length, 0);
});

test("recovery keeps the record on any failure, including a 4xx", async () => {
  const { file, platform } = await setup();
  const store = fileSessionStore(file, scope);
  await assert.rejects(createRecordedSession(loseResponses(platform), AGENT, store, request("t1")));
  const refusing = { ...platform, createSession: async () => Promise.reject(new ZooworkError(401, "unauthorized")) };
  assert.deepEqual(await recoverPendingCreates(refusing, AGENT, store), { recovered: 0, remaining: 1 });
  assert.equal((await store.listPendingCreates()).length, 1);
  await assert.rejects(recoverPendingCreates(refusing, AGENT, store, { strict: true }), /session_creation_uncertain_retry_cleanup/);
});
