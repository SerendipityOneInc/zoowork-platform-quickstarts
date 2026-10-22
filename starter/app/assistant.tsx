"use client";

// The whole page: assistant-ui on the outside, ZooWork Sessions underneath.
//
//   ZooworkRuntimeProvider — conversations are Sessions; the open Session's
//                            event stream is the thread
//   AppSidebar             — the conversation list
//   Thread                 — the conversation, with tool cards and approvals
//
// Text and colors come from app.config.ts.

import { AuiProvider, Suggestions, Tools, useAui } from "@assistant-ui/react";
import { appConfig } from "@/app.config";
import { AppSidebar } from "@/components/app-sidebar";
import { Thread } from "@/components/assistant-ui/thread";
import { StatusBar } from "@/components/status-bar";
import { StarterToolFallback, toolkit } from "@/components/tool-uis";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ZooworkRuntimeProvider } from "@/lib/chat/runtime-provider";

function Welcome() {
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
      <h1 className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-2xl duration-200">
        {appConfig.greeting}
      </h1>
      <p className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both mt-2 max-w-md text-muted-foreground text-sm delay-75 duration-200">
        {appConfig.description}
      </p>
    </div>
  );
}

function Workspace() {
  const aui = useAui({
    tools: Tools({ toolkit }),
    suggestions: Suggestions(
      appConfig.suggestions.map((s) => ({ title: s.title, label: s.label ?? "", prompt: s.prompt })),
    ),
  });

  return (
    <AuiProvider value={aui}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
              <SidebarTrigger />
              <span className="truncate font-medium text-sm">{appConfig.name}</span>
            </header>
            <div className="flex flex-1 flex-col overflow-hidden" style={{ ["--thread-max-width" as string]: "44rem" }}>
              <StatusBar />
              <div className="min-h-0 flex-1">
                <Thread components={{ Welcome, ToolFallback: StarterToolFallback }} />
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AuiProvider>
  );
}

export function Assistant() {
  return (
    <ZooworkRuntimeProvider>
      <Workspace />
    </ZooworkRuntimeProvider>
  );
}
