import { resolve } from "node:path";
import { Catalog } from "../mcp/catalog.js";
import { catalogApp } from "../mcp/server.js";
import { Receipts } from "../src/storage/receipts.js";
const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? 4311);
const host = process.env.MCP_HOST ?? "localhost";
const receipts = new Receipts(resolve(".local", "catalog.sqlite"));
const server = catalogApp(new Catalog(), receipts, {
  origins: process.env.MCP_ALLOWED_ORIGINS?.split(",").filter(Boolean),
  hosts: process.env.MCP_ALLOWED_HOSTS?.split(",").filter(Boolean),
}).listen(port, host, () =>
  console.log(`Synthetic catalog MCP: http://${host}:${port}/mcp`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      receipts.close();
      process.exit(0);
    }),
  );
