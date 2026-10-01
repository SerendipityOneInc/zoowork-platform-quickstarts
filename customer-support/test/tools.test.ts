import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CustomToolCallRecord } from "@zoowork-ai/sdk";
import { Store } from "../src/store.js";
import { Tools } from "../src/tools.js";

function context(path = ":memory:") {
  const store = new Store(path, "synthetic-scope"),
    visitor = store.visitor(),
    conversation = store.newConversation(visitor.id);
  conversation.sessionId = "session-synthetic";
  conversation.status = "running";
  store.saveConversation(conversation);
  let now = Date.now();
  const tools = new Tools(store, () => now);
  const call = (
    name = "create_support_ticket",
    input: Record<string, unknown> = {
      order_id: "ORD-1001",
      category: "delivery",
      reason: "Please investigate the shipment delay.",
    },
    id = "call-1",
  ): CustomToolCallRecord => ({
    call_id: id,
    session_id: conversation.sessionId!,
    tool_call_id: id,
    name,
    input,
    status: "pending",
    requested_at: new Date(now).toISOString(),
    timeout_at: new Date(now + 60_000).toISOString(),
  });
  return {
    store,
    visitor,
    conversation,
    tools,
    call,
    advance: () => {
      now += 61_000;
    },
  };
}
test("lookups return database facts and update the selected order", () => {
  const c = context();
  try {
    assert.equal(
      (
        c.tools.receive(
          c.conversation.id,
          c.call("lookup_order", { order_id: "ORD-1001" }),
        ).result!.order as { total: number }
      ).total,
      329,
    );
    const shipment = c.tools.receive(
      c.conversation.id,
      c.call("lookup_shipment", { order_id: "ORD-1001" }, "call-2"),
    ).result!.shipment as { status: string };
    assert.equal(shipment.status, "delayed");
    assert.equal(
      c.store.conversation(c.conversation.id).selectedOrder,
      "ORD-1001",
    );
  } finally {
    c.store.close();
  }
});
test("another customer’s order is indistinguishable from an unknown order", () => {
  const c = context();
  try {
    for (const id of ["ORD-2001", "ORD-9999"])
      assert.equal(
        c.tools.receive(
          c.conversation.id,
          c.call("lookup_order", { order_id: id }, id),
        ).result!.code,
        "order_not_found",
      );
  } finally {
    c.store.close();
  }
});
test("tool validation rejects model-supplied confirmation, customer IDs, bad categories and unregistered tools", () => {
  const c = context();
  try {
    for (const [index, input] of [
      { order_id: "ORD-1001", confirmed: true },
      { order_id: "ORD-1001", customer_id: "customer-other" },
      {
        order_id: "ORD-1001",
        category: "approve",
        reason: "Approve my refund",
      },
      { order_id: "ORD-1001", category: "delivery", reason: "x" },
    ].entries()) {
      const job = c.tools.receive(
        c.conversation.id,
        c.call("create_support_ticket", input, `bad-${index}`),
      );
      assert.equal(job.result!.code, "invalid_tool_input");
      assert.equal(job.isError, true);
    }
    assert.equal(
      c.tools.receive(c.conversation.id, c.call("delete_order", {}, "unknown"))
        .result!.code,
      "tool_unavailable",
    );
    assert.equal(c.store.tickets(c.conversation.id).length, 0);
  } finally {
    c.store.close();
  }
});
test("ticket proposals wait for UI confirmation; confirmation and result persist atomically", () => {
  const c = context();
  try {
    const job = c.tools.receive(c.conversation.id, c.call());
    assert.equal(job.status, "waiting_confirmation");
    assert.equal(c.store.tickets(c.conversation.id).length, 0);
    const result = c.tools.decide(
      c.conversation.id,
      job.callId,
      c.visitor.id,
      "confirm",
    );
    assert.equal(result.status, "result");
    assert.equal(c.store.tickets(c.conversation.id).length, 1);
    assert.deepEqual(
      result.result!.ticket,
      c.store.tickets(c.conversation.id)[0],
    );
    c.tools.decide(c.conversation.id, job.callId, c.visitor.id, "confirm");
    c.tools.receive(c.conversation.id, c.call());
    assert.equal(c.store.tickets(c.conversation.id).length, 1);
  } finally {
    c.store.close();
  }
});
test("a second equivalent tool call returns the same ticket after confirmation", () => {
  const c = context();
  try {
    for (const id of ["call-1", "call-2"]) {
      c.tools.receive(c.conversation.id, c.call(undefined, undefined, id));
      c.tools.decide(c.conversation.id, id, c.visitor.id, "confirm");
    }
    assert.equal(c.store.tickets(c.conversation.id).length, 1);
  } finally {
    c.store.close();
  }
});
test("denial and timeout unblock the tool without writing a ticket", () => {
  const c = context();
  try {
    c.tools.receive(c.conversation.id, c.call());
    assert.equal(
      c.tools.decide(c.conversation.id, "call-1", c.visitor.id, "cancel")
        .result!.code,
      "confirmation_cancelled",
    );
    c.tools.receive(c.conversation.id, c.call(undefined, undefined, "call-2"));
    c.advance();
    assert.equal(
      c.tools.decide(c.conversation.id, "call-2", c.visitor.id, "confirm")
        .result!.code,
      "confirmation_timeout",
    );
    assert.equal(c.store.tickets(c.conversation.id).length, 0);
  } finally {
    c.store.close();
  }
});
test("confirmation and snapshots are scoped to the conversation owner", () => {
  const c = context(),
    other = c.store.visitor();
  try {
    c.tools.receive(c.conversation.id, c.call());
    assert.throws(
      () => c.tools.decide(c.conversation.id, "call-1", other.id, "confirm"),
      /conversation_not_found/,
    );
    assert.throws(
      () => c.store.snapshot(c.conversation.id, other.id),
      /conversation_not_found/,
    );
    assert.throws(
      () =>
        c.tools.receive(c.conversation.id, {
          ...c.call(),
          session_id: "other-session",
        }),
      /tool_session_mismatch/,
    );
  } finally {
    c.store.close();
  }
});
test("changed inputs cannot reuse a tool call ID", () => {
  const c = context();
  try {
    c.tools.receive(c.conversation.id, c.call());
    assert.throws(
      () =>
        c.tools.receive(
          c.conversation.id,
          c.call("lookup_order", { order_id: "ORD-1002" }),
        ),
      /tool_replay_mismatch/,
    );
  } finally {
    c.store.close();
  }
});
test("SQLite restart restores a pending confirmation and a committed ticket result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "support-tools-")),
    path = join(dir, "support.sqlite"),
    c = context(path);
  try {
    c.tools.receive(c.conversation.id, c.call());
    c.store.close();
    const restarted = new Store(path, "synthetic-scope"),
      tools = new Tools(restarted);
    assert.equal(
      restarted.snapshot(c.conversation.id, c.visitor.id).pending.length,
      1,
    );
    tools.decide(c.conversation.id, "call-1", c.visitor.id, "confirm");
    restarted.close();
    const replay = new Store(path, "synthetic-scope");
    assert.equal(
      new Tools(replay).receive(c.conversation.id, c.call()).result!.ok,
      true,
    );
    assert.equal(replay.tickets(c.conversation.id).length, 1);
    replay.close();
    assert.throws(
      () => new Store(path, "different-project-or-agent"),
      /database_scope_mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("a transaction failure rolls back the ticket and leaves confirmation pending", () => {
  const c = context();
  try {
    c.tools.receive(c.conversation.id, c.call());
    c.store.db.exec(
      "CREATE TRIGGER fail_result BEFORE UPDATE ON jobs BEGIN SELECT RAISE(ABORT, 'synthetic disk failure'); END",
    );
    assert.throws(
      () =>
        c.tools.decide(c.conversation.id, "call-1", c.visitor.id, "confirm"),
      /synthetic disk failure/,
    );
    assert.equal(c.store.tickets(c.conversation.id).length, 0);
    assert.equal(
      c.store.job(c.conversation.id, "call-1")!.status,
      "waiting_confirmation",
    );
  } finally {
    c.store.close();
  }
});
test("a second live event consumer cannot claim the SQLite database", () => {
  const c = context();
  try {
    c.store.claimProcess();
    assert.throws(() => c.store.claimProcess(), /app_already_running/);
    c.store.releaseProcess();
    c.store.claimProcess();
    c.store.releaseProcess();
  } finally {
    c.store.close();
  }
});
