"use client";

// Page-level notices for a conversation, for failures that happen before it
// has a Session (and so a controller that could show them), or that leave an
// unsent message the composer could not take back. Kept per local thread id,
// so a notice never shows on, or restores into, another conversation.

import { useSyncExternalStore } from "react";

export type AppNotice = {
  message: string;
  /** A message that was not sent and could not be put back in the composer. */
  unsentText?: string;
};

const notices = new Map<string, AppNotice>();
const listeners = new Set<() => void>();

export function setAppNotice(threadId: string, notice: AppNotice | null): void {
  const current = notices.get(threadId);
  if (!notice && !current) return;
  if (notice) notices.set(threadId, notice);
  else notices.delete(threadId);
  for (const l of listeners) l();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useAppNotice(threadId: string | undefined): AppNotice | null {
  return useSyncExternalStore(
    subscribe,
    () => (threadId ? (notices.get(threadId) ?? null) : null),
    () => null,
  );
}
