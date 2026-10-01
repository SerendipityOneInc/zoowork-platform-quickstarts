import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ZooworkError } from "@zoowork-ai/sdk";
import { Advisor } from "../src/server/advisor.js";
import { Conversations } from "../src/storage/conversations.js";
import { Receipts } from "../src/storage/receipts.js";
import { parseReply, recommendations } from "../src/domain/conversation.js";
import { publicMcpUrl, agentResource } from "../src/agent.js";
import { fixture, waitFor } from "./helpers.js";

const req = {
  category: "laptop" as const,
  maxPriceMinor: 650000,
  filters: { minRamGB: 16 },
};
test("restart replays approvals and retains immutable facts in a private SQLite file", async () => {
  const f = await fixture();
  const dir = await mkdtemp(join(tmpdir(), "advisor-recovery-"));
  const path = join(dir, "conversations.sqlite");
  let store: Conversations | undefined, advisor: Advisor | undefined;
  try {
    const c = await f.advisor.create("alice", "编程", req, "request-restart");
    await f.advisor.idle(c.id);
    await f.advisor.message(
      "alice",
      c.id,
      "get_products lap-01 完整参数",
      req,
      "request-pending",
    );
    await waitFor(() => f.store.get(c.id).approvals.length === 1);
    await f.advisor.close();
    store = new Conversations(path);
    store.insert(f.store.get(c.id));
    store.close();
    store = new Conversations(path);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    advisor = new Advisor(
      store,
      f.fake.client,
      "test-agent",
      f.mcp.url + "/mcp",
    );
    advisor.resume();
    const a = store.get(c.id).approvals[0]!;
    await advisor.decide("alice", c.id, a.approval_id!, "allow-once");
    await advisor.idle(c.id);
    assert.equal(store.get(c.id).shortlist[0]!.product.detailLevel, "full");
    assert.equal(f.receipts.count("get_products"), 1);
    assert.equal(
      new Set(store.get(c.id).events.map((e) => e.seq)).size,
      store.get(c.id).events.length,
    );
  } finally {
    await advisor?.close();
    store?.close();
    await f.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("expired receipt cannot be read and runtime audit does not enter public evidence", () => {
  const f = new Receipts(":memory:", 1);
  try {
    const e = f.create(
      "search_products",
      "demo",
      { products: [] },
      {
        agentId: "test-agent",
        sessionId: "test-session",
        actorUid: "private-user",
        apiKey: "private-key",
      },
    );
    assert.equal(JSON.stringify(e).includes("private-"), false);
    assert.equal(f.forSession("test-agent", "test-session").search_products, 1);
    f.db.prepare("UPDATE receipts SET created=?").run(Date.now() - 10);
    assert.equal(f.get(e.receiptId), undefined);
    assert.equal(
      JSON.stringify(f.db.prepare("SELECT context FROM audit").all()).includes(
        "private-",
      ),
      false,
    );
  } finally {
    f.close();
  }
});
test("malformed model blocks and unknown or out-of-budget recommendations supply no fabricated facts", async () => {
  const f = await fixture();
  try {
    const c = await f.advisor.create("alice", "编程", req, "request-guard");
    await f.advisor.idle(c.id);
    const saved = f.store.get(c.id),
      receipt = Object.keys(saved.evidence)[0]!;
    assert.equal(parseReply("推荐一台不存在的商品"), undefined);
    assert.equal(
      parseReply(
        '```product-advisor-result\n{"type":"recommendation","items":[]}\n```',
      ),
      undefined,
    );
    assert.deepEqual(
      recommendations(saved, [
        { productId: "lap-99", receiptId: receipt, reasonCodes: ["budget"] },
      ]),
      [],
    );
    saved.requirements.maxPriceMinor = 10000;
    assert.deepEqual(
      recommendations(saved, [
        { productId: "lap-01", receiptId: receipt, reasonCodes: ["budget"] },
      ]),
      [],
    );
  } finally {
    await f.close();
  }
});
test("native approvals unavailable is visible and interrupts the waiting turn", async () => {
  const f = await fixture();
  try {
    const c = await f.advisor.create("alice", "编程", req, "request-501");
    await f.advisor.idle(c.id);
    f.fake.client.listApprovals = async () => {
      throw new ZooworkError(501, "synthetic");
    };
    await f.advisor.message(
      "alice",
      c.id,
      "get_products lap-01 完整参数",
      req,
      "request-noapprove",
    );
    await f.advisor.idle(c.id);
    assert.ok(f.store.get(c.id).warnings.includes("approvals_unavailable"));
    assert.equal(f.receipts.count("get_products"), 0);
  } finally {
    await f.close();
  }
});
test("Agent declaration isolates readonly tools and requests mandatory per-call confirmation", () => {
  for (const url of [
    "https://localhost/mcp",
    "https://[::1]/mcp",
    "https://10.0.0.1/mcp",
    "https://host.internal/mcp",
    "https://host.example/mcp?token=x",
  ])
    assert.throws(() => publicMcpUrl(url));
  const before = process.env.MCP_PUBLIC_URL;
  process.env.MCP_PUBLIC_URL = "https://catalog.example/mcp";
  try {
    const resource = agentResource();
    const tools = resource.mcp![0]!.tools!;
    assert.equal(tools.search_products!.permission, "always_allow");
    assert.equal(
      (tools.get_products as { requireConfirmation?: boolean })
        .requireConfirmation,
      true,
    );
    assert.equal(resource.include_global_skills, false);
  } finally {
    if (before === undefined) delete process.env.MCP_PUBLIC_URL;
    else process.env.MCP_PUBLIC_URL = before;
  }
});
