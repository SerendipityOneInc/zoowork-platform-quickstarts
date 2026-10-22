import { errorCode, errorStatus, StarterError } from "./errors";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Local-only guard for every API route. The starter has no end-user
 * authentication, so it answers only on loopback hosts: a request that
 * reaches it through another host name (a tunnel, a LAN address, a public
 * deployment) is refused. Remove this only after adding authentication and
 * per-user Session ownership (README: "Before you go public").
 *
 * Writes must also be same-origin JSON requests, which a cross-site form or
 * image tag cannot produce.
 */
export function guard(request: Request, { write = false }: { write?: boolean } = {}): void {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!;
  if (!LOOPBACK.has(hostname)) throw new StarterError("local_only_add_authentication_first", 403);
  if (!write) return;
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host) throw new StarterError("cross_origin_request", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new StarterError("expected_application_json", 415);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new StarterError("invalid_json_body");
  return body as Record<string, unknown>;
}

/** A safe JSON error: a stable code, never a provider body or credential. */
export function errorResponse(error: unknown): Response {
  const code = errorCode(error);
  if (!(error instanceof StarterError)) console.error(`[starter] ${code}`);
  return Response.json({ error: code }, { status: errorStatus(error) });
}

/** Wrap a route handler with the guard and error mapping. */
export function route<C>(
  handler: (request: Request, context: C) => Promise<Response>,
  options: { write?: boolean } = {},
): (request: Request, context: C) => Promise<Response> {
  return async (request, context) => {
    try {
      guard(request, options);
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
