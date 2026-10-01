import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Catalog } from "../mcp/catalog.js";
import { evidenceSchema } from "../src/domain/catalog.js";
import { confirmedRequirements } from "../src/domain/requirements.js";
import { fixture } from "./helpers.js";

test("hard conditions, null facts, availability and budget use one versioned catalog", () => {
  const c = new Catalog();
  const input = {
    category: "laptop",
    maxPriceMinor: 650000,
    filters: { minRamGB: 16 },
    limit: 6,
  };
  assert.deepEqual(
    c.execute("search_products", input).products.map((p) => p.productId),
    ["lap-05", "lap-01", "lap-02"],
  );
  assert.deepEqual(
    c
      .execute("search_products", { ...input, maxPriceMinor: 500000 })
      .products.map((p) => p.productId),
    ["lap-05"],
  );
  assert.deepEqual(
    c
      .execute("search_products", {
        ...input,
        filters: { minRamGB: 16, minBatteryHours: 8 },
      })
      .products.map((p) => p.productId),
    ["lap-01", "lap-02"],
  );
  assert.equal(
    c.execute("search_products", { ...input, maxPriceMinor: 10000 }).products
      .length,
    0,
  );
  assert.throws(
    () =>
      c.execute("get_products", {
        productIds: ["lap-01"],
        catalogVersion: "old",
      }),
    /catalog_version_not_found/,
  );
  assert.throws(
    () =>
      c.execute("compare_products", {
        productIds: ["lap-01", "mon-01"],
        catalogVersion: c.version,
      }),
    /cannot_compare_categories/,
  );
  const comparison = c.execute("compare_products", {
    productIds: ["lap-01", "lap-05"],
    catalogVersion: c.version,
  });
  assert.equal(
    comparison.rows!.find((r) => r.key === "batteryHours")!.values["lap-05"],
    null,
  );
  assert.equal(
    confirmedRequirements("预算降到 5000 元", {
      category: "laptop",
      maxPriceMinor: 650000,
      filters: { minRamGB: 16 },
    }).maxPriceMinor,
    500000,
  );
});
test("official MCP transport, prefix-sized preview and immutable public receipt agree", async () => {
  const f = await fixture();
  const client = new Client({ name: "integration-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(f.mcp.url + "/mcp")),
    );
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 3);
    const result = await client.callTool({
      name: "search_products",
      arguments: {
        category: "laptop",
        maxPriceMinor: 650000,
        filters: { minRamGB: 16 },
      },
    });
    const e = evidenceSchema.parse(result.structuredContent);
    const preview = ("structuredContent:\n" + JSON.stringify(e, null, 2)).slice(
      0,
      512,
    );
    assert.ok(preview.includes(e.receiptId));
    assert.ok(!preview.includes("lap-02"));
    assert.deepEqual(
      await (await fetch(f.mcp.url + "/evidence/" + e.receiptId)).json(),
      e,
    );
    const bad = await client.callTool({
      name: "get_products",
      arguments: { productIds: ["lap-01"], catalogVersion: "old" },
    });
    assert.equal(bad.isError, true);
    assert.equal(f.receipts.count("get_products"), 0);
    assert.equal(
      (
        await fetch(f.mcp.url + "/mcp", {
          method: "POST",
          headers: {
            Origin: "https://untrusted.example",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
  } finally {
    await client.close();
    await f.close();
  }
});
