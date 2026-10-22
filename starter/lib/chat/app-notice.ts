"use client";

// A page-level notice for failures that happen before a conversation has a
// Session (and so before its controller can show anything), such as a
// failed create. The status bar shows it.

import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();

export function setAppNotice(message: string | null): void {
  if (message === current) return;
  current = message;
  for (const l of listeners) l();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => current;

export function useAppNotice(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
