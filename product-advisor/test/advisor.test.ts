import test from "node:test";
import assert from "node:assert/strict";
import { applicationApi } from "../src/server/http.js";
import { fixture, listen, waitFor } from "./helpers.js";
import { view } from "../src/domain/conversation.js";

const requirements = {
  category: "laptop" as const,
  maxPriceMinor: 650000,
  filters: { minRamGB: 16 },
};
test("search, native deny/allow, factual comparison, budget change and saved ownership", async () => {
  const f = await fixture();
  try {
    const c = await f.advisor.create(
      "alice",
      "预算 6500 元，编程，16 GB 内存",
      requirements,
      "request-first",
    );
    await f.advisor.idle(c.id);
    assert.equal(f.store.get(c.id).shortlist.length, 3);
    assert.equal(f.receipts.count("search_products"), 1);
    await f.advisor.details(
      "alice",
      c.id,
      "lap-01",
      "demo-2026-10-01",
      "request-detail",
    );
    await waitFor(() => f.store.get(c.id).approvals.length === 1);
    const pending = f.store.get(c.id).approvals[0]!;
    await assert.rejects(
      f.advisor.decide("bob", c.id, pending.approval_id!, "allow-once"),
      /conversation_not_found/,
    );
    f.fake.pending.set("other-session", {
      approval_id: "other-session",
      session_id: "other-session",
      status: "pending",
    });
    await assert.rejects(
      f.advisor.decide("alice", c.id, "other-session", "allow-once"),
      /approval_not_pending/,
    );
    await f.advisor.decide("alice", c.id, pending.approval_id!, "deny");
    await f.advisor.idle(c.id);
    assert.equal(f.receipts.count("get_products"), 0);
    assert.equal(Object.values(f.store.get(c.id).evidence).length, 1);
    assert.equal(
      f.store.get(c.id).tools[Object.keys(f.store.get(c.id).tools).at(-1)!]!
        .executionStarted,
      false,
    );
    await f.advisor.compare(
      "alice",
      c.id,
      ["lap-01", "lap-02"],
      "request-compare",
    );
    await waitFor(() => f.store.get(c.id).approvals.length === 1);
    f.fake.holdDecisions = true;
    const a = f.store.get(c.id).approvals[0]!;
    await f.advisor.decide("alice", c.id, a.approval_id!, "allow-once");
    assert.equal(f.receipts.count("compare_products"), 0);
    assert.equal(f.store.get(c.id).approvals[0]!.signaled, true);
    f.fake.decisions.get(a.approval_id!)!();
    await f.advisor.idle(c.id);
    assert.equal(
      f.receipts.count("compare_products"),
      1,
      JSON.stringify(f.store.get(c.id)),
    );
    assert.equal(f.store.get(c.id).comparison!.result.products.length, 2);
    await f.advisor.message(
      "alice",
      c.id,
      "预算降到 5000 元",
      requirements,
      "request-budget",
    );
    await f.advisor.idle(c.id);
    assert.deepEqual(
      f.store.get(c.id).shortlist.map((p) => p.product.productId),
      ["lap-05"],
    );
    assert.throws(() => f.store.get(c.id, "bob"), /conversation_not_found/);
    const count = f.store.get(c.id).events.length;
    await f.advisor.processEvent(c.id, f.store.get(c.id).events[0]!);
    assert.equal(f.store.get(c.id).events.length, count);
  } finally {
    await f.close();
  }
});
test("ambiguous create and message retry preserve the exact request identity", async () => {
  const f = await fixture();
  try {
    f.fake.ambiguousCreate = true;
    await assert.rejects(
      f.advisor.create("alice", "编程", requirements, "request-create"),
      /message_delivery_uncertain/,
    );
    const c = f.store.list("alice")[0]!;
    await f.advisor.retry("alice", c.id);
    await f.advisor.idle(c.id);
    assert.equal(f.fake.sessions.size, 1);
    assert.equal(f.receipts.count("search_products"), 1);
    f.fake.ambiguousPost = true;
    await assert.rejects(
      f.advisor.message(
        "alice",
        c.id,
        "预算降到 5000 元",
        requirements,
        "request-retry",
      ),
      /message_delivery_uncertain/,
    );
    const before = JSON.stringify(f.store.get(c.id).pendingMessage);
    await f.advisor.retry("alice", c.id);
    await f.advisor.idle(c.id);
    assert.ok(before.includes("request-retry"));
    assert.equal(f.store.get(c.id).pendingMessage, undefined);
    assert.equal(f.receipts.count("search_products"), 2);
  } finally {
    await f.close();
  }
});
test("prototype-named approval IDs persist as own keys and retain the submitted decision", async () => {
  const f = await fixture();
  try {
    const c = await f.advisor.create(
      "alice",
      "编程",
      requirements,
      "request-prototype",
    );
    await f.advisor.idle(c.id);
    await f.advisor.details(
      "alice",
      c.id,
      "lap-01",
      "demo-2026-10-01",
      "request-prototype-detail",
    );
    await waitFor(() => f.store.get(c.id).approvals.length === 1);
    const pending = f.store.get(c.id).approvals[0]!;
    const approvalId = "__proto__";
    f.fake.pending.delete(pending.approval_id!);
    f.fake.pending.set(approvalId, { ...pending, approval_id: approvalId });
    await f.advisor.decide("alice", c.id, approvalId, "deny");
    await f.advisor.idle(c.id);
    const saved = f.store.get(c.id).approvalRequests!;
    assert.equal(Object.getPrototypeOf(saved), Object.prototype);
    assert.equal(Object.hasOwn(saved, approvalId), true);
    assert.deepEqual(saved[approvalId], { decision: "deny", uncertain: false });
    await assert.rejects(
      f.advisor.decide("alice", c.id, approvalId, "allow-once"),
      /approval_decision_locked/,
    );
    assert.equal(f.fake.calls.resolve, 1);
    assert.equal(f.receipts.count("get_products"), 0);
  } finally {
    await f.close();
  }
});

test("native denial can end with blocked + deniedReason and no tool-end event", async () => {
  const f = await fixture();
  try {
    const c = await f.advisor.create(
      "alice",
      "编程",
      requirements,
      "request-real-denial",
    );
    await f.advisor.idle(c.id);
    const base = f.store.get(c.id).events.at(-1)!;
    let seq = base.seq;
    const callId = "native-denied-call";
    for (const [eventType, payload] of [
      [
        "agent.tool",
        {
          phase: "start",
          toolName: "mcp__catalog__get_products",
          toolCallId: callId,
          args: { productIds: ["lap-01"], catalogVersion: "demo-2026-10-01" },
        },
      ],
      [
        "agent.approval",
        {
          phase: "requested",
          approvalId: "native-approval",
          toolCallId: callId,
          toolName: "mcp__catalog__get_products",
        },
      ],
      [
        "agent.approval",
        {
          phase: "resolved",
          approvalId: "native-approval",
          toolCallId: callId,
          resolution: "deny",
        },
      ],
      [
        "agent.tool",
        {
          phase: "blocked",
          toolName: "mcp__catalog__get_products",
          toolCallId: callId,
          deniedReason: "approval-denied",
        },
      ],
      ["run.finished", { status: "succeeded" }],
    ] as const)
      await f.advisor.processEvent(c.id, {
        ...base,
        seq: ++seq,
        eventType,
        payload,
      });
    const saved = f.store.get(c.id);
    assert.equal(saved.denied, true);
    assert.equal(saved.tools[callId]!.phase, "blocked");
    assert.equal(saved.tools[callId]!.executionStarted, false);
    assert.equal(saved.tools[callId]!.deniedReason, "approval-denied");
    assert.equal(f.receipts.count("get_products"), 0);
    // History written by older versions still renders the native denial.
    delete saved.tools[callId]!.deniedReason;
    delete saved.tools[callId]!.executionStarted;
    assert.equal(view(saved).tools[callId]!.deniedReason, "approval-denied");
    assert.equal(view(saved).tools[callId]!.executionStarted, false);
  } finally {
    await f.close();
  }
});
test("receipt failure keeps retryable evidence state; connection failure supplies no fake products", async () => {
  const f = await fixture();
  try {
    const real = f.advisor.fetcher;
    Object.defineProperty(f.advisor, "fetcher", {
      value: async () => new Response("", { status: 503 }),
      configurable: true,
    });
    const c = await f.advisor.create(
      "alice",
      "编程",
      requirements,
      "request-receipt",
    );
    await f.advisor.idle(c.id);
    assert.equal(f.store.get(c.id).shortlist.length, 0);
    assert.ok(f.store.get(c.id).warnings.includes("evidence_unavailable"));
    Object.defineProperty(f.advisor, "fetcher", { value: real });
    await f.advisor.retry("alice", c.id);
    assert.equal(f.store.get(c.id).shortlist.length, 3);
    assert.equal(f.receipts.count("search_products"), 1);
    f.fake.failConnection = true;
    const failure = await f.advisor.create(
      "alice",
      "编程",
      requirements,
      "request-failure",
    );
    await f.advisor.idle(failure.id);
    assert.equal(f.store.get(failure.id).shortlist.length, 0);
    assert.deepEqual(f.store.get(failure.id).evidence, {});
    assert.ok(
      f.store.get(failure.id).warnings.includes("mcp_connection_failed"),
    );
  } finally {
    await f.close();
  }
});
test("API cookie ownership and Origin checks protect all conversation writes and reads", async () => {
  const f = await fixture();
  const http = await listen(
    applicationApi(f.advisor, {
      origin: "http://test.example",
      cookieSecret: "x".repeat(64),
    }),
  );
  try {
    const init = await fetch(http.url + "/api/status");
    const cookie = init.headers.get("set-cookie")!.split(";")[0]!;
    const body = JSON.stringify({
      text: "编程",
      requirements,
      requestId: "request-http",
    });
    const bad = await fetch(http.url + "/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body,
    });
    assert.equal(bad.status, 403);
    const good = await fetch(http.url + "/api/conversations", {
      method: "POST",
      headers: {
        Origin: "http://test.example",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body,
    });
    assert.equal(good.status, 201);
    const c = (await good.json()) as { id: string };
    await f.advisor.idle(c.id);
    assert.equal(
      (await fetch(http.url + "/api/conversations/" + c.id)).status,
      404,
    );
    assert.equal(
      (
        await fetch(http.url + "/api/conversations/" + c.id, {
          headers: { Cookie: cookie },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(http.url + "/api/conversations/" + c.id + "/retry", {
          method: "POST",
          headers: { Origin: "http://test.example" },
        })
      ).status,
      404,
    );
  } finally {
    await http.close();
    await f.close();
  }
});

test("concurrent follow-ups accept one request without replacing its saved identity", async () => {
  const f = await fixture();
  try {
    const c = await f.advisor.create(
      "alice",
      "编程",
      requirements,
      "request-race",
    );
    await f.advisor.idle(c.id);
    const results = await Promise.allSettled([
      f.advisor.message(
        "alice",
        c.id,
        "预算降到5000元",
        requirements,
        "request-race-a",
      ),
      f.advisor.message(
        "alice",
        c.id,
        "预算降到4000元",
        requirements,
        "request-race-b",
      ),
    ]);
    await f.advisor.idle(c.id);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(
      rejected?.status === "rejected" &&
        /turn_in_progress/.test(String(rejected.reason)),
    );
    assert.equal(f.fake.calls.post, 1);
    const saved = f.store.get(c.id);
    assert.equal(saved.sentRequestIds.includes("request-race-a"), true);
    assert.equal(saved.sentRequestIds.includes("request-race-b"), false);
    assert.equal(
      saved.messages.filter((message) => message.role === "user").length,
      2,
    );
    assert.equal(saved.requirements.maxPriceMinor, 500000);
  } finally {
    await f.close();
  }
});

test("connection failure in a follow-up cannot turn an earlier receipt into a new recommendation", async () => {
  const f = await fixture();
  try {
    const c = await f.advisor.create(
      "alice",
      "编程",
      requirements,
      "request-stale",
    );
    await f.advisor.idle(c.id);
    const receiptId = Object.keys(f.store.get(c.id).evidence)[0]!;
    f.fake.failConnection = true;
    await f.advisor.message(
      "alice",
      c.id,
      "预算降到5000元",
      requirements,
      "request-stale-next",
    );
    await f.advisor.idle(c.id);
    const saved = f.store.get(c.id);
    assert.equal(Object.keys(saved.evidence).length, 1);
    assert.ok(saved.warnings.includes("mcp_connection_failed"));
    const previous = saved.events.at(-1)!;
    await f.advisor.processEvent(c.id, {
      ...previous,
      seq: saved.lastSeq + 1,
      eventType: "agent.assistant",
      payload: {
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text:
                "```product-advisor-result\n" +
                JSON.stringify({
                  type: "recommendation",
                  items: [
                    { productId: "lap-05", receiptId, reasonCodes: ["budget"] },
                  ],
                }) +
                "\n```",
            },
          ],
        },
      },
    });
    await f.advisor.processEvent(c.id, {
      ...previous,
      seq: saved.lastSeq + 2,
      eventType: "run.finished",
      payload: { status: "succeeded" },
    });
    assert.equal(f.store.get(c.id).shortlist.length, 0);
    assert.equal(f.receipts.count("search_products"), 1);
  } finally {
    await f.close();
  }
});
