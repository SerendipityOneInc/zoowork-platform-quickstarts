"use client";

import { RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/chat/api";
import { describe } from "@/lib/chat/notices";
import { useChat } from "@/lib/chat/runtime-provider";
import type { AppStatus } from "@/lib/chat/wire";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;

type Shown = { tone: "ok" | "warn" | "error" | "idle"; label: string; detail?: string };

function shown(status: AppStatus | null, error: string | null): Shown {
  if (error) return { tone: "error", label: "Server unreachable", detail: error };
  if (!status) return { tone: "idle", label: "Checking the Agent…" };
  switch (status.agent) {
    case "ready":
      return { tone: "ok", label: "Agent ready" };
    case "definition_changed":
      return {
        tone: "warn",
        label: "Agent out of date",
        detail: "agent/agent.md changed since the last setup. Run npm run setup.",
      };
    case "not_running":
      return { tone: "warn", label: "Agent stopped", detail: "The Agent is not running. Run npm run setup." };
    default:
      return { tone: "error", label: "Agent unavailable", detail: describe(status.code, "The Agent is unavailable") };
  }
}

const DOT: Record<Shown["tone"], string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  idle: "bg-muted-foreground/50",
};

/** Agent and Platform readiness from /api/status, the open conversation, and its stream connection. */
export function StatusBar({ leading }: { leading?: ReactNode }) {
  const { session, snapshot, controller } = useChat();
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not read the app status.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const agent = shown(status, error);
  const reconnecting = controller && snapshot.connection === "reconnecting";

  return (
    <header data-slot="status-bar" className="border-border bg-background flex flex-col border-b">
      <div className="flex h-12 items-center gap-3 px-4">
        {leading}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {session?.title ?? "New chat"}
          {session?.archived && (
            <span className="text-muted-foreground border-border ms-2 rounded-sm border px-1.5 py-0.5 text-xs font-normal">
              Archived
            </span>
          )}
        </h2>
        {reconnecting && (
          <span role="status" className="text-muted-foreground shimmer text-xs">
            Reconnecting…
          </span>
        )}
        <span role="status" className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span aria-hidden className={cn("size-2 rounded-full", DOT[agent.tone])} />
          {agent.label}
        </span>
      </div>
      {agent.detail && (
        <div
          className={cn(
            "flex items-center gap-3 border-t px-4 py-2 text-sm",
            agent.tone === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-warning/30 bg-warning/10",
          )}
        >
          <p className="min-w-0 flex-1">{agent.detail}</p>
          <Button size="xs" variant="outline" onClick={() => void refresh()}>
            <RefreshCwIcon aria-hidden />
            Check again
          </Button>
        </div>
      )}
    </header>
  );
}
