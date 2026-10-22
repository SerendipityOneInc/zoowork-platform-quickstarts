"use client";

// The sidebar. Each assistant-ui thread is one Platform Session; the thread's
// remote id is the Session id. The list comes from this app's own index
// (GET /api/sessions), because the Platform cannot list Sessions by user.
//
//   initialize → POST /api/sessions, on the first message of a new chat
//   rename     → a local title change (Session metadata is write-once)
//   archive    → the Session stays readable and stops accepting input
//   delete     → the Session is deleted on the Platform
//
// Adapted from the Claude Managed Agents assistant-ui quickstart
// (MIT, see third-party/anthropic-MIT.txt).

import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { archiveSession, createSession, deleteSession, getSession, listSessions, renameSession } from "./api";
import { dropSessionController } from "./session-controller";
import type { SessionSummary } from "./wire";

const toThreadMetadata = (s: SessionSummary) => ({
  status: (s.archived ? "archived" : "regular") as "archived" | "regular",
  remoteId: s.id,
  externalId: s.id,
  title: s.title,
  lastMessageAt: new Date(s.updatedAt),
});

/** First-message text per local thread id, so the new Session is titled from it. */
const firstMessages = new Map<string, string>();

export function rememberFirstMessage(threadId: string, text: string): void {
  if (!firstMessages.has(threadId)) firstMessages.set(threadId, text);
}

export const sessionListAdapter: RemoteThreadListAdapter = {
  async list() {
    const sessions = await listSessions();
    return { threads: sessions.map(toThreadMetadata) };
  },

  async initialize(threadId) {
    const session = await createSession(threadId, firstMessages.get(threadId) ?? "");
    firstMessages.delete(threadId);
    return { remoteId: session.id, externalId: session.id };
  },

  async rename(remoteId, newTitle) {
    await renameSession(remoteId, newTitle);
  },

  async archive(remoteId) {
    await archiveSession(remoteId);
    dropSessionController(remoteId);
  },

  async unarchive() {
    throw new Error("An archived conversation cannot be reopened. Start a new one.");
  },

  async delete(remoteId) {
    await deleteSession(remoteId);
    dropSessionController(remoteId);
  },

  async fetch(threadId) {
    return toThreadMetadata(await getSession(threadId));
  },

  async generateTitle(remoteId) {
    // The server titled the Session from its first message. Surface that
    // title so the sidebar row updates without another model call.
    const session = await getSession(remoteId);
    return createAssistantStream((controller) => {
      controller.appendText(session.title || "New chat");
      controller.close();
    });
  },
};
