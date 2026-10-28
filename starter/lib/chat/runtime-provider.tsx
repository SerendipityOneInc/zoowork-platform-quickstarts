"use client";

// Connects this app's conversations to assistant-ui. The thread list is the
// Session index from /api/sessions; the open thread's messages come from its
// SessionController, folded by the reducer. Only the open conversation keeps
// an event stream; switching away closes it and switching back resumes from
// the last cursor.

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type AssistantRuntime,
  type ExternalStoreThreadData,
  type ExternalStoreThreadListAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { appConfig } from "@/app.config";
import { ApiError } from "./api";
import { setAppNotice } from "./app-notice";
import { toThreadMessages } from "./reducer";
import { restoreIfSafe, sendFromComposer } from "./send-message";
import { initialSnapshot, isBusy, SessionController, type SessionSnapshot } from "./session-controller";
import { SessionIndex, type IndexSnapshot } from "./session-index";
import { MESSAGE_MAX, type SessionSummary } from "./wire";

type ChatContextValue = {
  /** The open conversation's local thread id. */
  threadId: string;
  /** Its Session, or null for a new chat that has not sent yet. */
  session: SessionSummary | null;
  controller: SessionController | null;
  snapshot: SessionSnapshot;
  index: IndexSnapshot;
  reloadIndex: () => void;
  /** Put text back into the open composer, after any draft already there. */
  restoreDraft: (text: string) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat must be used inside ChatRuntimeProvider");
  return value;
}

const noSubscribe = () => () => {};
const getInitial = () => initialSnapshot;

let draftCounter = 0;
const newDraftId = () => `draft-${++draftCounter}`;

type ListedThread<S extends "regular" | "archived"> = ExternalStoreThreadData<S> & { lastMessageAt: Date };

function listed<S extends "regular" | "archived">(
  status: S,
  sessions: readonly SessionSummary[],
  index: SessionIndex,
): ListedThread<S>[] {
  return sessions.map((s) => ({
    status,
    id: index.threadIdFor(s.id),
    remoteId: s.id,
    title: s.title,
    lastMessageAt: new Date(s.updatedAt),
  }));
}

const DELETE_CONFIRM =
  "Delete this conversation? Its Session is deleted on ZooWork Platform and cannot be restored.";

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const [index] = useState(() => new SessionIndex());
  const indexState = useSyncExternalStore(index.subscribe, index.getSnapshot, index.getSnapshot);
  const [threadId, setThreadId] = useState("draft-0");
  const controllers = useRef(new Map<string, SessionController>());
  const runtimeRef = useRef<AssistantRuntime | null>(null);
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const controllerFor = useCallback((sessionId: string) => {
    let controller = controllers.current.get(sessionId);
    if (!controller) {
      controller = new SessionController(sessionId);
      controllers.current.set(sessionId, controller);
    }
    return controller;
  }, []);

  // Load the list once, then open the conversation named in the URL hash. Read the
  // hash before loading: the hash-sync effect below clears it as soon as loading ends.
  useEffect(() => {
    const wanted = decodeURIComponent(window.location.hash.slice(1));
    void index.load().then(() => {
      if (wanted && index.find(wanted)) setThreadId(index.threadIdFor(wanted));
    });
  }, [index]);

  const sessionId = indexState.links[threadId] ?? (indexState.sessions.some((s) => s.id === threadId) ? threadId : null);
  const session = useMemo(
    () => indexState.sessions.find((s) => s.id === sessionId) ?? null,
    [indexState.sessions, sessionId],
  );
  const controller = sessionId ? controllerFor(sessionId) : null;

  useEffect(() => {
    if (!controller) return;
    controller.open();
    return () => controller.close();
  }, [controller]);

  useEffect(() => {
    if (indexState.loading) return;
    const hash = sessionId ? `#${encodeURIComponent(sessionId)}` : "";
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    }
  }, [sessionId, indexState.loading]);

  useEffect(() => {
    const all = controllers.current;
    return () => {
      for (const c of all.values()) c.dispose();
      all.clear();
    };
  }, []);

  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noSubscribe,
    controller?.getSnapshot ?? getInitial,
    getInitial,
  );

  const messages = useMemo(() => toThreadMessages(snapshot.view, snapshot.outgoing), [snapshot.view, snapshot.outgoing]);

  const restoreDraft = useCallback((text: string) => {
    const composer = runtimeRef.current?.thread.composer;
    if (!composer) return;
    const current = composer.getState().text;
    composer.setText(current.trim() ? `${current}\n\n${text}` : text);
  }, []);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = message.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n\n")
        .trim();
      if (!text) return;
      const sentFrom = threadIdRef.current;
      const restoreText = (unsent: string) => {
        const composer = runtimeRef.current?.thread.composer;
        if (!composer) return false;
        return restoreIfSafe(
          {
            isActive: threadIdRef.current === sentFrom,
            text: composer.getState().text,
            setText: (t) => composer.setText(t),
          },
          unsent,
        );
      };
      if (text.length > MESSAGE_MAX) {
        const notice = `Messages can be at most ${MESSAGE_MAX.toLocaleString("en-US")} characters.`;
        setAppNotice(sentFrom, restoreText(text) ? { message: notice } : { message: notice, unsentText: text });
        return;
      }
      const sent = await sendFromComposer({
        text,
        sessionId: index.sessionIdFor(sentFrom),
        ensureSession: (first) => index.create(sentFrom, first),
        send: (id, t) => controllerFor(id).send(t),
        restoreText,
        setNotice: (notice) => setAppNotice(sentFrom, notice),
      });
      const id = index.sessionIdFor(sentFrom);
      if (sent && id) index.touch(id);
    },
    [index, controllerFor],
  );

  const onCancel = useCallback(async () => {
    await controller?.interrupt();
  }, [controller]);

  const threads = useMemo(
    () => listed("regular", indexState.sessions.filter((s) => !s.archived), index),
    // links changes the local ids of chats created on this page.
    [indexState.sessions, indexState.links, index],
  );
  const archivedThreads = useMemo(
    () => listed("archived", indexState.sessions.filter((s) => s.archived), index),
    [indexState.sessions, indexState.links, index],
  );

  const reportListError = useCallback((localId: string, error: unknown, fallback: string) => {
    setAppNotice(localId, { message: error instanceof ApiError ? error.message : fallback });
  }, []);

  const threadList = useMemo<ExternalStoreThreadListAdapter>(
    () => ({
      threadId,
      isLoading: indexState.loading,
      threads,
      archivedThreads,
      onSwitchToNewThread: () => {
        // An unsent new chat is reused rather than replaced.
        if (index.sessionIdFor(threadIdRef.current)) setThreadId(newDraftId());
      },
      onSwitchToThread: (id) => setThreadId(id),
      onRename: async (id, title) => {
        const target = index.sessionIdFor(id);
        if (!target) return;
        try {
          await index.rename(target, title);
        } catch (error) {
          reportListError(id, error, "Could not rename the conversation.");
          throw error;
        }
      },
      onArchive: async (id) => {
        const target = index.sessionIdFor(id);
        if (!target) return;
        try {
          await index.archive(target);
        } catch (error) {
          reportListError(id, error, "Could not archive the conversation.");
        }
      },
      onDelete: async (id) => {
        const target = index.sessionIdFor(id);
        if (!target || !window.confirm(DELETE_CONFIRM)) return;
        try {
          await index.remove(target);
        } catch (error) {
          reportListError(id, error, "Could not delete the conversation.");
          return;
        }
        controllers.current.get(target)?.dispose();
        controllers.current.delete(target);
        if (threadIdRef.current === id) setThreadId(newDraftId());
      },
    }),
    [threadId, indexState.loading, threads, archivedThreads, index, reportListError],
  );

  const suggestions = useMemo(
    () =>
      appConfig.suggestions.map((s) => ({ title: s.title, prompt: s.prompt, ...(s.label ? { label: s.label } : {}) })),
    [],
  );

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    convertMessage: (m) => m,
    isRunning: isBusy(snapshot),
    isLoading: !!controller && snapshot.loading && snapshot.view.turns.length === 0,
    isDisabled: !!session?.archived || snapshot.connection === "closed",
    suggestions,
    onNew,
    onCancel,
    adapters: { threadList },
  });
  runtimeRef.current = runtime;

  const reloadIndex = useCallback(() => void index.load(), [index]);

  const value = useMemo<ChatContextValue>(
    () => ({ threadId, session, controller, snapshot, index: indexState, reloadIndex, restoreDraft }),
    [threadId, session, controller, snapshot, indexState, reloadIndex, restoreDraft],
  );

  return (
    <ChatContext.Provider value={value}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </ChatContext.Provider>
  );
}
