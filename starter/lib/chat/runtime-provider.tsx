"use client";

// Connects ZooWork Sessions to assistant-ui, in two layers:
//
//   useRemoteThreadListRuntime — the sidebar. Its adapter is this app's
//     Session index (session-list-adapter.ts); thread id = Session id.
//
//   useSessionThreadRuntime — one per open thread. It takes the Session's
//     controller (stream + actions) and hands its folded messages to
//     useExternalStoreRuntime. A brand-new chat has no Session yet; the
//     first send creates it through initialize().
//
// Adapted from the Claude Managed Agents assistant-ui quickstart
// (MIT, see third-party/anthropic-MIT.txt).

import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  useRemoteThreadListRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { setAppNotice } from "./app-notice";
import { initialProjection, type ThreadMessage } from "./reducer";
import { sendFromComposer } from "./send-message";
import { getSessionController, type ControllerSnapshot, type SessionController } from "./session-controller";
import { rememberFirstMessage, sessionListAdapter } from "./session-list-adapter";

const EMPTY: ControllerSnapshot = {
  messages: [],
  projection: initialProjection(),
  isLoaded: true,
  isConnected: false,
  isBusy: false,
  isDead: false,
  notice: null,
};
const subscribeNothing = () => () => {};
const getEmpty = () => EMPTY;

function useControllerSnapshot(controller: SessionController | null): ControllerSnapshot {
  return useSyncExternalStore(
    controller ? controller.subscribe : subscribeNothing,
    controller ? controller.getSnapshot : getEmpty,
    getEmpty,
  );
}

function textOf(message: AppendMessage): string {
  return message.content
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n")
    .trim();
}

/** Pass only the fields assistant-ui knows; the reducer's bookkeeping stays out. */
function toThreadMessageLike(m: ThreadMessage): ThreadMessageLike {
  return {
    id: m.id,
    role: m.role,
    content: m.content as ThreadMessageLike["content"],
    createdAt: m.createdAt,
    ...(m.status ? { status: m.status } : {}),
  };
}

function useSessionThreadRuntime() {
  const aui = useAui();
  const threadId = useAuiState((s) => s.threadListItem.id);
  const sessionId = useAuiState((s) => s.threadListItem.externalId ?? s.threadListItem.remoteId);
  const archived = useAuiState((s) => s.threadListItem.custom?.archived === true);
  const controller = sessionId ? getSessionController(sessionId) : null;
  const snapshot = useControllerSnapshot(controller);

  // Keep a stream open only for the conversation on screen: browsers cap
  // concurrent connections per origin. The controller keeps its state and
  // cursor, so returning resumes after the last event it saw.
  const isActive = useAuiState((s) => s.threads.mainThreadId === s.threadListItem.id);
  useEffect(() => {
    if (!controller || !isActive) return;
    controller.attach();
    return () => controller.detach();
  }, [controller, isActive]);

  const ensureSession = useMemo(
    () =>
      async (firstText: string): Promise<string> => {
        rememberFirstMessage(threadId, firstText);
        const { externalId, remoteId } = await aui.threadListItem().initialize();
        const id = externalId ?? remoteId;
        if (!id) throw new Error("The conversation was not created.");
        // The external-store runtime does not title new threads by itself.
        // The server titled the Session from this first message; show it.
        void Promise.resolve(aui.threadListItem().generateTitle()).catch(() => {});
        return id;
      },
    [aui, threadId],
  );

  return useExternalStoreRuntime<ThreadMessage>({
    messages: snapshot.messages as ThreadMessage[],
    convertMessage: toThreadMessageLike,
    isLoading: !snapshot.isLoaded,
    isRunning: snapshot.isBusy,
    isDisabled: snapshot.isDead || archived,

    onNew: async (message: AppendMessage) => {
      const text = textOf(message);
      if (!text) return;
      await sendFromComposer({
        text,
        sessionId: sessionId ?? null,
        ensureSession,
        send: (id, t) => getSessionController(id).sendMessage(t),
        restoreText: (t) => aui.composer().setText(t),
        setNotice: setAppNotice,
      });
    },

    // The stop button sends a real interrupt to the run.
    onCancel: async () => {
      if (controller) await controller.interrupt();
    },

    onRespondToToolApproval: async ({ approvalId, approved }) => {
      await controller?.respondToApproval(approvalId, approved);
    },
  });
}

export function ZooworkRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useRemoteThreadListRuntime({
    adapter: sessionListAdapter,
    runtimeHook: useSessionThreadRuntime,
  });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

/** The open conversation's live state, for the status strip. */
export function useActiveSessionSnapshot(): ControllerSnapshot & { sessionId: string | null } {
  const sessionId = useAuiState((s) => s.threadListItem.externalId ?? s.threadListItem.remoteId) ?? null;
  const controller = sessionId ? getSessionController(sessionId) : null;
  return { ...useControllerSnapshot(controller), sessionId };
}
