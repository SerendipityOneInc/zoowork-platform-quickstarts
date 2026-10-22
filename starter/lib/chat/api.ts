"use client";

// Fetch helpers for this app's own routes. The browser never talks to
// ZooWork directly: the Project key stays in the server process.

import { describe } from "./notices";
import type { AppStatus, SessionSummary } from "./wire";

/** A failed route call. `code` is the server's stable error code, when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly code: string | undefined,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const sessionUrl = (id: string, suffix = "") => `/api/sessions/${encodeURIComponent(id)}${suffix}`;

export const postJson = (url: string, body: unknown, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function errorCodeOf(res: Response): Promise<string | undefined> {
  try {
    return ((await res.json()) as { error?: string }).error;
  } catch {
    return undefined;
  }
}

/** Throw an ApiError with readable text for a non-2xx response. */
export async function ensureOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const code = await errorCodeOf(res);
  throw new ApiError(code, res.status, describe(code, `Could not ${what}`));
}

async function json<T>(res: Response, what: string): Promise<T> {
  return (await (await ensureOk(res, what)).json()) as T;
}

export async function getStatus(): Promise<AppStatus> {
  return json(await fetch("/api/status", { cache: "no-store" }), "read the app status");
}

export async function listSessions(): Promise<SessionSummary[]> {
  return (await json<{ sessions: SessionSummary[] }>(await fetch("/api/sessions", { cache: "no-store" }), "list conversations")).sessions;
}

export async function createSession(threadId: string, title: string): Promise<SessionSummary> {
  return json(await postJson("/api/sessions", { threadId, title }), "start the conversation");
}

export async function getSession(id: string): Promise<SessionSummary> {
  return json(await fetch(sessionUrl(id), { cache: "no-store" }), "open the conversation");
}

export async function renameSession(id: string, title: string): Promise<void> {
  await ensureOk(await postJson(sessionUrl(id), { title }, "PATCH"), "rename the conversation");
}

export async function archiveSession(id: string): Promise<void> {
  await ensureOk(await postJson(sessionUrl(id, "/archive"), {}), "archive the conversation");
}

export async function deleteSession(id: string): Promise<void> {
  await ensureOk(await fetch(sessionUrl(id), { method: "DELETE" }), "delete the conversation");
}
