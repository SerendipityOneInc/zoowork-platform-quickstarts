import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AppError } from "./store.js";
import { safeError } from "./platform.js";
import type { SupportService } from "./service.js";

const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
]);
async function body(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new AppError("json_required", 415);
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text) > 8192)
      throw new AppError("request_too_large", 413);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch {
    /* Report a stable, safe code. */
  }
  throw new AppError("invalid_json");
}
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}
export function supportServer(
  service: SupportService,
  options: { origin: () => string; offline?: boolean },
) {
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      const origin = options.origin();
      if (request.headers.host !== new URL(origin).host)
        throw new AppError("unexpected_host", 403);
      const url = new URL(request.url ?? "/", origin);
      if (request.method === "GET" && files.has(url.pathname)) {
        const [name, type] = files.get(url.pathname)!;
        response.setHeader("Content-Type", `${type}; charset=utf-8`);
        response.end(
          await readFile(
            fileURLToPath(new URL(`../public/${name}`, import.meta.url)),
          ),
        );
        return;
      }
      if (!url.pathname.startsWith("/api/"))
        throw new AppError("not_found", 404);
      const identity = /(?:^|;\s*)support_identity=([0-9a-f-]{36})(?:;|$)/.exec(
        request.headers.cookie ?? "",
      )?.[1];
      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        const visitor = service.store.visitor(identity);
        response.setHeader(
          "Set-Cookie",
          `support_identity=${visitor.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`,
        );
        json(response, 200, {
          csrf: visitor.csrf,
          offline: options.offline ?? false,
          customer: { name: "Lin Xia", synthetic: true },
          conversations: service.store
            .conversations(visitor.id)
            .map((value) => ({
              id: value.id,
              status: value.status,
              createdAt: value.createdAt,
            })),
          orders: service.store.orders("customer-lin"),
        });
        return;
      }
      if (!identity) throw new AppError("browser_identity_required", 403);
      service.store.verifyVisitor(identity);
      if (request.method === "POST") {
        if (request.headers.origin !== origin)
          throw new AppError("same_origin_required", 403);
        if (typeof request.headers["x-csrf-token"] !== "string")
          throw new AppError("csrf_required", 403);
        service.store.verifyVisitor(identity, request.headers["x-csrf-token"]);
      }
      if (request.method === "POST" && url.pathname === "/api/conversations") {
        const input = await body(request);
        if (typeof input.id !== "string")
          throw new AppError("invalid_conversation_id");
        json(response, 201, await service.create(identity, input.id));
        return;
      }
      const match =
        /^\/api\/conversations\/([0-9a-f-]{36})(?:\/(messages|recover|decisions))?$/.exec(
          url.pathname,
        );
      if (!match) throw new AppError("not_found", 404);
      const [, id, action] = match;
      service.store.conversation(id, identity);
      if (request.method === "GET" && !action) {
        json(response, 200, service.store.snapshot(id, identity));
        return;
      }
      if (request.method !== "POST")
        throw new AppError("method_not_allowed", 405);
      const input = await body(request);
      if (action === "messages") {
        if (typeof input.id !== "string" || typeof input.text !== "string")
          throw new AppError("invalid_message");
        json(
          response,
          202,
          await service.send(id, identity, { id: input.id, text: input.text }),
        );
        return;
      }
      if (action === "recover") {
        json(
          response,
          200,
          await service.recover(id, identity, input.retryInput === true),
        );
        return;
      }
      if (action === "decisions") {
        if (
          typeof input.callId !== "string" ||
          !["confirm", "cancel"].includes(String(input.decision))
        )
          throw new AppError("invalid_decision");
        json(
          response,
          200,
          await service.decide(
            id,
            identity,
            input.callId,
            input.decision as "confirm" | "cancel",
          ),
        );
        return;
      }
      throw new AppError("not_found", 404);
    } catch (error) {
      json(response, error instanceof AppError ? error.status : 502, {
        error: error instanceof AppError ? error.code : safeError(error),
      });
    }
  });
}
