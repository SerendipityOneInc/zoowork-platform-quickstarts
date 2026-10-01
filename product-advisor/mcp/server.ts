import express from "express";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Catalog, CatalogError } from "./catalog.js";
import { Receipts } from "../src/storage/receipts.js";
import {
  searchSchema,
  detailSchema,
  compareSchema,
  type CatalogTool,
} from "../src/domain/catalog.js";

export function catalogApp(
  catalog: Catalog,
  receipts: Receipts,
  options: { origins?: string[]; hosts?: string[] } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  const rates = new Map<string, { at: number; count: number }>();
  app.use((req, res, next) => {
    if (req.headers.origin && !options.origins?.includes(req.headers.origin)) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    if (options.hosts?.length && !options.hosts.includes(req.hostname)) {
      res.status(403).json({ error: "host_not_allowed" });
      return;
    }
    const ip = req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    if (rates.size > 1024)
      for (const [key, value] of rates)
        if (now - value.at > 60_000) rates.delete(key);
    const rate = rates.get(ip);
    if (rate && now - rate.at < 60_000) {
      if (++rate.count > 240) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }
    } else rates.set(ip, { at: now, count: 1 });
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      catalogVersion: catalog.version,
      synthetic: true,
    }),
  );
  app.get("/evidence/:id", (req, res) => {
    if (!/^rcp_[a-f0-9]{32}$/.test(req.params.id)) {
      res.status(404).json({ error: "receipt_not_found" });
      return;
    }
    const receipt = receipts.get(req.params.id);
    res.setHeader("Cache-Control", "no-store");
    if (!receipt) {
      res.status(404).json({ error: "receipt_not_found_or_expired" });
      return;
    }
    res.json(receipt);
  });
  app.post("/mcp", async (req, res) => {
    const server = new McpServer({
      name: "product-advisor-catalog",
      version: "1.0.0",
    });
    const register = (
      name: CatalogTool,
      schema: typeof searchSchema | typeof detailSchema | typeof compareSchema,
      description: string,
    ) => {
      server.registerTool(
        name,
        {
          description,
          inputSchema: schema.shape,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (
          args: Record<string, unknown>,
          extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
        ) => {
          try {
            const result = catalog.execute(name, args);
            const receipt = receipts.create(
              name,
              catalog.version,
              result,
              extra._meta?.["ai.zooclaw/context"],
            );
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(receipt) },
              ],
              structuredContent: receipt,
            };
          } catch (error) {
            const code =
              error instanceof CatalogError
                ? error.message
                : "invalid_tool_arguments";
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: code }),
                },
              ],
            };
          }
        },
      );
    };
    register(
      "search_products",
      searchSchema,
      "Search synthetic products using confirmed category, budget in CNY minor units and hard filters. Avoid query unless searching an exact catalog model. Unknown hard attributes never match. Returns summaries and a receipt.",
    );
    register(
      "get_products",
      detailSchema,
      "Read full facts for 1–4 product IDs and the exact catalog version returned by search. Requires approval. Unknown facts remain null.",
    );
    register(
      "compare_products",
      compareSchema,
      "Compare 2–4 previously searched products of the same category at the exact catalog version. Requires approval. Returns factual parameter rows, not advice.",
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res.status(500).json({ error: "mcp_request_failed" });
    }
  });
  app.all("/mcp", (_req, res) =>
    res.status(405).json({ error: "method_not_allowed" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(400).json({ error: "invalid_request" });
    },
  );
  return app;
}
