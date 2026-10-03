import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { evidenceSchema } from "../src/domain/catalog.js";
const url = new URL(
  process.argv[2] || process.env.MCP_PUBLIC_URL || "http://localhost:4311/mcp",
);
const client = new Client({ name: "product-advisor-probe", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = await client.listTools();
  if (
    tools.tools
      .map((t) => t.name)
      .sort()
      .join(",") !== "compare_products,get_products,search_products"
  )
    throw new Error("catalog_tool_set_mismatch");
  const result = await client.callTool({
    name: "search_products",
    arguments: {
      category: "laptop",
      maxPriceMinor: 650000,
      filters: { minRamGB: 16 },
    },
  });
  if (result.isError) throw new Error("search_failed");
  const evidence = evidenceSchema.parse(result.structuredContent);
  const preview =
    ("structuredContent:\n" + JSON.stringify(evidence, null, 2)).slice(0, 509) +
    "...";
  if (!preview.includes(evidence.receiptId))
    throw new Error("receipt_preview_missing");
  const endpoint = new URL(url);
  endpoint.pathname = endpoint.pathname.replace(
    /\/mcp\/?$/,
    "/evidence/" + evidence.receiptId,
  );
  const r = await fetch(endpoint, {
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  const read = evidenceSchema.parse(await r.json());
  if (JSON.stringify(read) !== JSON.stringify(evidence))
    throw new Error("receipt_mismatch");
  console.log(
    JSON.stringify({
      pass: true,
      transport: "streamable-http",
      toolCount: tools.tools.length,
      productCount: evidence.result.products.length,
      catalogVersion: evidence.catalogVersion,
      receiptPreview: true,
      receiptRead: true,
    }),
  );
} finally {
  await client.close();
}
