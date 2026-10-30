import test from "node:test";
import assert from "node:assert/strict";
import { approvalSummary } from "../src/domain/approval.js";
import type { Product } from "../src/domain/catalog.js";

const roam = { productId: "lap-01", name: "Roam 14" } as Product;

test("approval summary names products and the catalog version", () => {
  assert.deepEqual(
    approvalSummary(
      "mcp__catalog__get_products",
      JSON.stringify({
        productIds: ["lap-01"],
        catalogVersion: "demo-2026-10-02-en",
      }),
      [roam],
    ),
    {
      action: "Retrieve full specifications",
      products: ["Roam 14 (lap-01)"],
      catalogVersion: "demo-2026-10-02-en",
    },
  );
  assert.deepEqual(
    approvalSummary(
      "mcp__catalog__compare_products",
      JSON.stringify({ productIds: ["lap-01", "lap-09"] }),
      [roam],
    ),
    {
      action: "Compare specifications",
      products: ["Roam 14 (lap-01)", "lap-09"],
    },
  );
});

test("a truncated argument preview still yields the action", () => {
  assert.deepEqual(
    approvalSummary("mcp__catalog__get_products", '{"productIds":["lap-0', []),
    { action: "Retrieve full specifications", products: [] },
  );
  assert.deepEqual(approvalSummary(undefined, undefined, []), {
    action: "Retrieve full specifications",
    products: [],
  });
});
