import express from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requirementsSchema } from "../domain/catalog.js";
import { AppError, userMessageSchema, view } from "../domain/conversation.js";
import type { Advisor } from "./advisor.js";

export function applicationApi(
  advisor: Advisor | undefined,
  options: {
    origin: string;
    cookieSecret: string;
    secure?: boolean;
    testMode?: boolean;
  },
) {
  if (options.cookieSecret.length < 32)
    throw new Error("cookie_secret_requires_32_characters");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  const sign = (id: string) =>
    createHmac("sha256", options.cookieSecret).update(id).digest("hex");
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" && req.headers.origin !== options.origin) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    const raw = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("advisor_visitor="))
      ?.slice("advisor_visitor=".length);
    const [id = "", sig = ""] = raw?.split(".") ?? [];
    const valid =
      /^[a-f0-9-]{36}$/.test(id) &&
      /^[a-f0-9]{64}$/.test(sig) &&
      timingSafeEqual(Buffer.from(sign(id)), Buffer.from(sig));
    const visitor = valid ? id : randomUUID();
    res.locals.visitor = visitor;
    if (!valid)
      res.setHeader(
        "Set-Cookie",
        `advisor_visitor=${visitor}.${sign(visitor)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${options.secure ? "; Secure" : ""}`,
      );
    next();
  });
  app.get("/api/status", (_req, res) =>
    res.json({
      ready: !!advisor,
      synthetic: true,
      testMode: !!options.testMode,
      categories: ["laptop", "monitor", "headphones"],
    }),
  );
  app.use("/api", (_req, _res, next) => {
    if (!advisor) throw new AppError("advisor_not_configured", 503);
    next();
  });
  app.get("/api/conversations", (_req, res) =>
    res.json(
      advisor!.store.list(res.locals.visitor as string).map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        status: c.status,
      })),
    ),
  );
  app.post("/api/conversations", async (req, res) => {
    const input = userMessageSchema.parse(req.body);
    res
      .status(201)
      .json(
        await advisor!.create(
          res.locals.visitor as string,
          input.text,
          requirementsSchema.parse(input.requirements ?? {}),
          input.requestId,
        ),
      );
  });
  app.get("/api/conversations/:id", (req, res) =>
    res.json(
      view(advisor!.store.get(req.params.id, res.locals.visitor as string)),
    ),
  );
  app.post("/api/conversations/:id/messages", async (req, res) => {
    const input = userMessageSchema.parse(req.body);
    const c = advisor!.store.get(req.params.id, res.locals.visitor as string);
    res.json(
      await advisor!.message(
        res.locals.visitor as string,
        c.id,
        input.text,
        requirementsSchema.parse(input.requirements ?? c.requirements),
        input.requestId,
      ),
    );
  });
  app.post("/api/conversations/:id/retry", async (req, res) => {
    await advisor!.retry(res.locals.visitor as string, req.params.id);
    res.json(view(advisor!.store.get(req.params.id)));
  });
  app.post("/api/conversations/:id/approvals/:approvalId", async (req, res) => {
    const { decision } = z
      .object({ decision: z.enum(["allow-once", "deny"]) })
      .strict()
      .parse(req.body);
    await advisor!.decide(
      res.locals.visitor as string,
      req.params.id,
      req.params.approvalId,
      decision,
    );
    res.json(view(advisor!.store.get(req.params.id)));
  });
  app.post("/api/conversations/:id/interrupt", async (req, res) => {
    await advisor!.interrupt(res.locals.visitor as string, req.params.id);
    res.json({ accepted: true });
  });
  app.post("/api/conversations/:id/compare", async (req, res) => {
    const input = z
      .object({
        productIds: z.array(z.string()).min(2).max(4),
        requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
      })
      .strict()
      .parse(req.body);
    res.json(
      await advisor!.compare(
        res.locals.visitor as string,
        req.params.id,
        input.productIds,
        input.requestId,
      ),
    );
  });
  app.post("/api/conversations/:id/selection", (req, res) => {
    const { productIds } = z
      .object({ productIds: z.array(z.string()).max(4) })
      .strict()
      .parse(req.body);
    const c = advisor!.store.get(req.params.id, res.locals.visitor as string);
    const known = new Set(
      Object.values(c.evidence).flatMap((e) =>
        e.result.products.map((p) => p.productId),
      ),
    );
    if (
      productIds.some((id) => !known.has(id)) ||
      new Set(productIds).size !== productIds.length
    )
      throw new AppError("selection_not_in_session");
    res.json(
      view(
        advisor!.store.update(c.id, (c) => {
          c.selectedIds = productIds;
        }),
      ),
    );
  });
  app.post("/api/conversations/:id/details", async (req, res) => {
    const input = z
      .object({
        productId: z.string().regex(/^(lap|mon|aud)-\d{2}$/),
        catalogVersion: z.string().min(1).max(40),
        requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
      })
      .strict()
      .parse(req.body);
    res.json(
      await advisor!.details(
        res.locals.visitor as string,
        req.params.id,
        input.productId,
        input.catalogVersion,
        input.requestId,
      ),
    );
  });
  app.get("/api/conversations/:id/events", (req, res) => {
    const visitor = res.locals.visitor as string;
    advisor!.store.get(req.params.id, visitor);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    let last = "";
    const send = () => {
      const body = JSON.stringify(
        view(advisor!.store.get(req.params.id, visitor)),
      );
      if (body !== last) {
        res.write(`data: ${body}\n\n`);
        last = body;
      } else res.write(": ping\n\n");
    };
    send();
    const timer = setInterval(send, 1500);
    req.on("close", () => clearInterval(timer));
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "route_not_found" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const e =
        error instanceof AppError
          ? error
          : error instanceof z.ZodError
            ? new AppError("invalid_request")
            : new AppError("request_failed", 503);
      if (!res.headersSent)
        res.status(e.status).json({
          error: e.code,
          ...(e.conversationId ? { conversationId: e.conversationId } : {}),
        });
    },
  );
  return app;
}
