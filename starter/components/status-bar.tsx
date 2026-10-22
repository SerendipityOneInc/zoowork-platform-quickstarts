"use client";

// A thin strip above the conversation: preview mode, setup problems, a
// changed agent definition, and connection or request notices.

import { useEffect, useState } from "react";
import { ApiError, getStatus } from "@/lib/chat/api";
import { useActiveSessionSnapshot } from "@/lib/chat/runtime-provider";
import { describe } from "@/lib/chat/notices";
import type { AppStatus } from "@/lib/chat/wire";

function Banner({ tone, children }: { tone: "info" | "warn" | "error"; children: React.ReactNode }) {
  const styles = {
    info: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    error: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  }[tone];
  return <div role="status" className={`rounded-md border px-3 py-1.5 text-xs ${styles}`}>{children}</div>;
}

export function StatusBar() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const { sessionId, isLoaded, isConnected, notice } = useActiveSessionSnapshot();

  useEffect(() => {
    let cancelled = false;
    getStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch((error: unknown) => {
        if (cancelled) return;
        // Keep the code, not the already-translated message, so describe() runs once.
        const code = error instanceof ApiError ? error.code : "request_failed";
        setStatus({ mode: "platform", agent: "unavailable", ...(code ? { code } : {}) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-1 px-4 pt-2 empty:hidden">
      {status?.mode === "preview" && (
        <Banner tone="info">
          Offline preview: replies are simulated and nothing is sent to ZooWork. Conversations reset when the server stops.
        </Banner>
      )}
      {status?.agent === "unavailable" && <Banner tone="error">{describe(status.code, "The Agent is not available")}</Banner>}
      {status?.agent === "definition_changed" && (
        <Banner tone="warn">agent/agent.md changed since the last setup. Run npm run setup to update the Agent.</Banner>
      )}
      {status?.agent === "not_running" && <Banner tone="warn">The Agent is stopped. Run npm run setup to start it.</Banner>}
      {notice && <Banner tone="error">{notice}</Banner>}
      {sessionId && isLoaded && !isConnected && !notice && (
        <div className="px-1 text-[11px] text-muted-foreground">Reconnecting…</div>
      )}
    </div>
  );
}
