"use client";

// Fetch wrappers for this app's own routes. The browser never talks to
// ZooWork directly: the Project key stays in the server process.

import { describe } from "./session-controller";
import type { AppStatus, SessionSummary } from "./wire";

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let code: string | undefined;
    try {
      code = ((await res.json()) as { error?: string }).error;
    } catch {
      /* not JSON */
    }
    throw new Error(describe(code, `Could not ${what}`));
  }
  return (await res.json()) as T;
}

const post = (url: string, body: unknown, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const sessionUrl = (id: string) => `/api/sessions/${encodeURIComponent(id)}`;

export async function getStatus(): Promise<AppStatus> {
  return json(await fetch("/api/status", { cache: "no-store" }), "read the app status");
}

export async function listSessions(): Promise<SessionSummary[]> {
  return (await json<{ sessions: SessionSummary[] }>(await fetch("/api/sessions", { cache: "no-store" }), "list conversations")).sessions;
}

export async function createSession(threadId: string, title: string): Promise<SessionSummary> {
  return json(await post("/api/sessions", { threadId, title }), "start the conversation");
}

export async function getSession(id: string): Promise<SessionSummary> {
  return json(await fetch(sessionUrl(id), { cache: "no-store" }), "open the conversation");
}

export async function renameSession(id: string, title: string): Promise<void> {
  await json(await post(sessionUrl(id), { title }, "PATCH"), "rename the conversation");
}

export async function archiveSession(id: string): Promise<void> {
  await json(await post(`${sessionUrl(id)}/archive`, {}), "archive the conversation");
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(sessionUrl(id), { method: "DELETE" });
  if (!res.ok) await json(res, "delete the conversation");
}
