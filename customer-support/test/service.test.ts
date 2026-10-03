import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Store } from "../src/store.js";
import { SupportService } from "../src/service.js";
import { fixtureClient } from "./fixture.js";

async function wait(condition: () => boolean) {
  for (let n = 0; n < 150; n++) {
    if (condition()) return;
    await setTimeout(20);
  }
  assert.fail("Fixture did not reach the expected state");
}
async function context(
  action: (value: {
    store: Store;
    service: SupportService;
    fixture: ReturnType<typeof fixtureClient>;
    owner: string;
    id: string;
  }) => Promise<void>,
) {
  const store = new Store(":memory:", "offline"),
    fixture = fixtureClient(),
    service = new SupportService(store, fixture.client, "agent-synthetic"),
    owner = store.visitor().id;
  const value = await service.create(owner);
  try {
    await action({ store, service, fixture, owner, id: value.conversation.id });
  } finally {
    await service.stop();
    store.close();
  }
}
test("order and shipment tools complete a turn; a follow-up reuses the same Session", async () =>
  context(async (c) => {
    await c.service.send(c.id, c.owner, {
      id: randomUUID(),
      text: "Track ORD-1001 and its shipment.",
    });
    await wait(() => c.store.conversation(c.id).status === "ready");
    assert.equal(c.store.jobs(c.id).length, 2);
    assert.match(c.store.messages(c.id).at(-1)!.text, /delayed/);
    await c.service.send(c.id, c.owner, {
      id: randomUUID(),
      text: "What is its estimated delivery?",
    });
    await wait(() => c.store.conversation(c.id).status === "ready");
    assert.equal(c.fixture.sessionCount, 1);
    assert.equal(c.fixture.posts, 2);
    assert.equal(
      c.store.messages(c.id).filter((message) => message.role === "assistant")
        .length,
      2,
    );
  }));
test("duplicate browser requests never post another paid input", async () =>
  context(async (c) => {
    const input = { id: randomUUID(), text: "Track ORD-1001" };
    await c.service.send(c.id, c.owner, input);
    await c.service.send(c.id, c.owner, input);
    await wait(() => c.store.conversation(c.id).status === "ready");
    assert.equal(c.fixture.posts, 1);
    assert.equal(
      c.store.messages(c.id).filter((message) => message.role === "user")
        .length,
      1,
    );
    await assert.rejects(
      c.service.send(c.id, c.owner, { ...input, text: "changed" }),
      /message_replay_mismatch/,
    );
  }));
test("repeated conversation creation uses the same request key and Session", async () =>
  context(async (c) => {
    const id = randomUUID();
    await c.service.create(c.owner, id);
    await c.service.create(c.owner, id);
    assert.equal(c.fixture.sessionCount, 2);
  }));
test("a confirmed ticket survives duplicate HTTP decisions and event replay", async () =>
  context(async (c) => {
    await c.service.send(c.id, c.owner, {
      id: randomUUID(),
      text: "Create a delivery ticket for ORD-1001.",
    });
    await wait(() =>
      c.store.jobs(c.id).some((job) => job.status === "waiting_confirmation"),
    );
    assert.equal(c.store.tickets(c.id).length, 0);
    const job = c.store.jobs(c.id)[0];
    await c.service.decide(c.id, c.owner, job.callId, "confirm");
    await c.service.decide(c.id, c.owner, job.callId, "confirm");
    await wait(() => c.store.conversation(c.id).status === "ready");
    assert.equal(c.store.tickets(c.id).length, 1);
    for (const event of c.fixture.histories.get(
      c.store.conversation(c.id).sessionId!,
    )!)
      await c.service.processEvent(c.id, event);
    assert.equal(c.store.tickets(c.id).length, 1);
    assert.match(
      c.store.messages(c.id).at(-1)!.text,
      new RegExp(c.store.tickets(c.id)[0].id),
    );
  }));
test("cancellation resolves the pending run and creates no ticket", async () =>
  context(async (c) => {
    await c.service.send(c.id, c.owner, {
      id: randomUUID(),
      text: "Create a refund ticket for ORD-1001.",
    });
    await wait(() =>
      c.store.jobs(c.id).some((job) => job.status === "waiting_confirmation"),
    );
    await c.service.decide(
      c.id,
      c.owner,
      c.store.jobs(c.id)[0].callId,
      "cancel",
    );
    await wait(() => c.store.conversation(c.id).status === "ready");
    assert.equal(c.store.tickets(c.id).length, 0);
    assert.match(c.store.messages(c.id).at(-1)!.text, /confirmation_cancelled/);
  }));
test("expired or externally resolved calls cannot be confirmed from a stale page", async () =>
  context(async (c) => {
    await c.service.send(c.id, c.owner, {
      id: randomUUID(),
      text: "Create a ticket for ORD-1001.",
    });
    await wait(() =>
      c.store.jobs(c.id).some((job) => job.status === "waiting_confirmation"),
    );
    const job = c.store.jobs(c.id)[0];
    c.fixture.pending.delete(job.callId);
    c.fixture.emit(
      c.store.conversation(c.id).sessionId!,
      "agent.custom_tool_use",
      { phase: "resolved", callId: job.callId, outcome: "timeout" },
    );
    await c.service.decide(c.id, c.owner, job.callId, "confirm");
    assert.equal(c.store.tickets(c.id).length, 0);
    assert.equal(c.store.job(c.id, job.callId)!.status, "terminal");
  }));
test("post uncertainty is recovered from history without another input", async () =>
  context(async (c) => {
    c.fixture.failPost = true;
    await c.service.send(c.id, c.owner, {
      id: randomUUID(),
      text: "Track ORD-1001",
    });
    await c.service.recover(c.id, c.owner, true);
    await wait(() => c.store.conversation(c.id).status === "ready");
    assert.equal(c.fixture.posts, 1);
  }));
test("input not accepted by the server requires explicit retry with the exact body and key", async () =>
  context(async (c) => {
    const post = c.fixture.client.postEvents;
    c.fixture.client.postEvents = async () => {
      throw new Error("offline before submission");
    };
    await c.service.send(c.id, c.owner, {
      id: randomUUID(),
      text: "Track ORD-1001",
    });
    await c.service.stop();
    c.fixture.client.postEvents = post;
    const restarted = new SupportService(
      c.store,
      c.fixture.client,
      "agent-synthetic",
    );
    try {
      await restarted.resume();
      assert.equal(c.fixture.posts, 0);
      await restarted.recover(c.id, c.owner, true);
      await wait(() => c.store.conversation(c.id).status === "ready");
      assert.equal(c.fixture.posts, 1);
    } finally {
      await restarted.stop();
    }
  }));
test("restart retrieves pending calls missing from the saved cursor, then recovers a failed result delivery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "support-service-")),
    path = join(dir, "support.sqlite"),
    fixture = fixtureClient();
  let store = new Store(path, "offline"),
    service = new SupportService(store, fixture.client, "agent-synthetic");
  const owner = store.visitor().id,
    value = await service.create(owner),
    id = value.conversation.id;
  try {
    await service.send(id, owner, {
      id: randomUUID(),
      text: "Create a delivery ticket for ORD-1001.",
    });
    await wait(() =>
      store.jobs(id).some((job) => job.status === "waiting_confirmation"),
    );
    const job = store.jobs(id)[0];
    await service.stop();
    store.close();
    store = new Store(path, "offline");
    service = new SupportService(store, fixture.client, "agent-synthetic");
    await service.resume();
    assert.equal(store.snapshot(id, owner).pending.length, 1);
    fixture.failResolve = true;
    await assert.rejects(service.decide(id, owner, job.callId, "confirm"));
    assert.equal(store.tickets(id).length, 1);
    assert.equal(store.job(id, job.callId)!.status, "result");
    await service.stop();
    store.close();
    fixture.failResolve = false;
    store = new Store(path, "offline");
    service = new SupportService(store, fixture.client, "agent-synthetic");
    await service.resume();
    await wait(() => store.conversation(id).status === "ready");
    assert.equal(store.tickets(id).length, 1);
    assert.equal(fixture.posts, 1);
  } finally {
    await service.stop();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("cross-browser message/recovery routes cannot operate on another conversation", async () =>
  context(async (c) => {
    const owner = c.store.visitor().id;
    await assert.rejects(
      c.service.send(c.id, owner, { id: randomUUID(), text: "Track ORD-1001" }),
      /conversation_not_found/,
    );
    await assert.rejects(
      c.service.recover(c.id, owner, true),
      /conversation_not_found/,
    );
    assert.equal(c.fixture.posts, 0);
  }));
