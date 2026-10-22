"use client";

// One controller per Session, kept in a registry so switching conversations
// keeps each one's state. It owns the moving parts of a live conversation:
//
//   1. the stream: one EventSource on /api/sessions/[id]/stream. Opened
//      without a cursor it replays the whole Session, then stays live. The
//      Platform cursor of every frame is remembered; a reconnect resumes
//      after it, so nothing is lost or folded twice.
//   2. sending: an optimistic bubble shows at once and is swapped for the
//      echoed user.message, keeping the same message id.
//   3. actions: stop (a real interrupt) and Allow/Deny for approvals.
//
// React subscribes with useSyncExternalStore; nothing here touches React.
//
// Adapted from the Claude Managed Agents assistant-ui quickstart session
// controller (MIT, see third-party/anthropic-MIT.txt). The ZooWork stream's
// server-side cursor replaces that controller's history/tail buffering.

import { aliasUserMessage, applyEvent, initialProjection, isBusy, type Projection, type ThreadMessage } from "./reducer";
import { ensureOk, errorCodeOf, postJson, sessionUrl } from "./api";
import { describe } from "./notices";
import type { RelayEnvelope, WireEvent } from "./wire";

type PendingMessage = {
  id: string;
  clientMessageId: string;
  text: string;
  createdAt: Date;
  /** Last seq folded when it was sent: only a later echo can be its own. */
  afterSeq: number;
  /** The accepted user.message's seq, once known. */
  seq?: number;
  /** The messages route accepted it. */
  accepted?: boolean;
};

export type ControllerSnapshot = {
  messages: readonly ThreadMessage[];
  projection: Projection;
  /** The first replay has settled (spinner while false). */
  isLoaded: boolean;
  isConnected: boolean;
  /** The Agent is working, a decision is pending, or a message is on its way. */
  isBusy: boolean;
  /** The Session can no longer be read (deleted, or not this app's). */
  isDead: boolean;
  /** A transport or request problem, for a banner. */
  notice: string | null;
};

type Listener = () => void;

const LOADED_AFTER_QUIET_MS = 300;
/** If an accepted message has not started a run by then, say so. */
const RUN_START_WARNING_MS = 90_000;

const newId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export class SessionController {
  readonly sessionId: string;
  private projection: Projection = initialProjection();
  private pending: PendingMessage[] = [];
  /** Approval ids answered in this tab, shown as settled until the Agent's own event lands. */
  private answered = new Map<string, boolean>();
  /** seq of an accepted message whose run has not started yet. */
  private awaitingRunAfter: number | undefined;
  private runWarningTimer: ReturnType<typeof setTimeout> | null = null;
  /** A failed send, so retrying the same text reuses its idempotency key. */
  private retry: { text: string; clientMessageId: string } | null = null;

  private source: EventSource | null = null;
  private cursor: string | undefined;
  private queue: WireEvent[] = [];
  private flushScheduled = false;
  private loadedTimer: ReturnType<typeof setTimeout> | null = null;
  private reopenTimer: ReturnType<typeof setTimeout> | null = null;
  private reopenDelay = 1_000;
  private failedOpens = 0;
  private disposed = false;

  private snapshot: ControllerSnapshot;
  private listeners = new Set<Listener>();
  private flags = { isLoaded: false, isConnected: false, isDead: false, notice: null as string | null };
  /** The current notice came from the stream, so a healthy reconnect clears it. */
  private streamNotice = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.snapshot = this.compute();
  }

  // ------------------------------------------------------------ subscription
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): ControllerSnapshot => this.snapshot;

  private emit() {
    this.snapshot = this.compute();
    for (const l of this.listeners) l();
  }

  private compute(): ControllerSnapshot {
    // A pending bubble without a known seq matches the first newer echo with
    // the same text. Once its send was accepted, that echo is its own: adopt
    // the seq and let the projection show it under the bubble's id.
    const hidden = new Set<number>();
    for (const p of this.pending) {
      if (p.seq !== undefined) continue;
      for (const [seq, index] of this.projection.userSeqs) {
        if (seq <= p.afterSeq || hidden.has(index)) continue;
        const part = this.projection.messages[index]!.content[0];
        if (part?.type !== "text" || part.text !== p.text) continue;
        if (p.accepted) {
          p.seq = seq;
          this.projection = aliasUserMessage(this.projection, seq, p.id);
        } else {
          // Still waiting for the messages route: hide the echo so it does not show twice.
          hidden.add(index);
        }
        break;
      }
    }
    const { projection } = this;
    // An accepted message whose echo has folded is shown by the projection.
    this.pending = this.pending.filter((p) => p.seq === undefined || !projection.userSeqs.has(p.seq));
    let messages: readonly ThreadMessage[] = projection.messages;
    if (hidden.size) messages = messages.filter((_, i) => !hidden.has(i));
    if (this.answered.size) messages = messages.map((m) => this.withAnswers(m));
    if (this.pending.length) {
      messages = [
        ...messages,
        ...this.pending.map(
          (p): ThreadMessage => ({ id: p.id, role: "user", content: [{ type: "text", text: p.text }], createdAt: p.createdAt }),
        ),
      ];
    }
    const awaitingRun = this.awaitingRunAfter !== undefined && projection.lastRunStartSeq < this.awaitingRunAfter;
    return {
      messages,
      projection,
      ...this.flags,
      isBusy: isBusy(projection) || this.pending.length > 0 || awaitingRun,
    };
  }

  private withAnswers(message: ThreadMessage): ThreadMessage {
    if (message.role !== "assistant") return message;
    let changed = false;
    const content = message.content.map((part) => {
      if (part.type !== "tool-call" || !part.approval || part.approval.approved !== undefined) return part;
      const approved = this.answered.get(part.approval.id);
      if (approved === undefined) return part;
      changed = true;
      return { ...part, approval: { ...part.approval, approved } };
    });
    return changed ? { ...message, content } : message;
  }

  private set(patch: Partial<typeof this.flags>) {
    this.flags = { ...this.flags, ...patch };
    this.emit();
  }

  // ----------------------------------------------------------------- stream
  /** Open the stream if it is not open. Idempotent. */
  attach(): void {
    if (this.disposed || this.source || this.reopenTimer || this.flags.isDead) return;
    this.open();
  }

  /** Close the stream but keep state and cursor; attach() resumes after the last event. */
  detach(): void {
    if (this.reopenTimer) clearTimeout(this.reopenTimer);
    this.reopenTimer = null;
    this.source?.close();
    this.source = null;
    if (this.flags.isConnected) this.set({ isConnected: false });
  }

  dispose(): void {
    this.disposed = true;
    this.detach();
    for (const t of [this.loadedTimer, this.runWarningTimer]) if (t) clearTimeout(t);
    this.listeners.clear();
  }

  private open() {
    const url = sessionUrl(this.sessionId, `/stream${this.cursor ? `?cursor=${encodeURIComponent(this.cursor)}` : ""}`);
    const source = new EventSource(url);
    this.source = source;
    source.onopen = () => {
      this.reopenDelay = 1_000;
      this.failedOpens = 0;
      this.markActivity();
      const clear = this.streamNotice;
      this.streamNotice = false;
      this.set({ isConnected: true, ...(clear ? { notice: null } : {}) });
    };
    source.onmessage = (message) => {
      // The browser also sends this as Last-Event-ID on its own reconnects.
      if (message.lastEventId) this.cursor = message.lastEventId;
      let envelope: RelayEnvelope;
      try {
        envelope = JSON.parse(message.data) as RelayEnvelope;
      } catch {
        return;
      }
      if (envelope.kind === "event") {
        this.queue.push(envelope.event);
        this.scheduleFlush();
        this.markActivity();
        return;
      }
      if (envelope.fatal) {
        source.close();
        if (this.source === source) this.source = null;
        this.streamNotice = true;
        this.set({ isConnected: false, isLoaded: true, notice: describe(envelope.code, "The conversation stream failed") });
      } else {
        this.streamNotice = true;
        this.set({ notice: describe(envelope.code, "Reconnecting to the conversation") });
      }
    };
    source.onerror = () => {
      if (this.disposed) return;
      if (this.flags.isConnected) this.set({ isConnected: false });
      // CONNECTING: the browser retries by itself and sends Last-Event-ID.
      // CLOSED: the route answered with an error status; reopen with backoff.
      if (source.readyState === EventSource.CLOSED && this.source === source) {
        this.source = null;
        this.failedOpens += 1;
        void this.scheduleReopen();
      }
    };
  }

  private async scheduleReopen() {
    if (this.reopenTimer || this.disposed) return;
    if (this.failedOpens >= 3) {
      // Find out why the stream keeps failing instead of retrying blindly.
      try {
        const res = await fetch(sessionUrl(this.sessionId), { cache: "no-store" });
        if (!res.ok) {
          const code = await errorCodeOf(res);
          if (res.status === 404) {
            this.set({ isDead: true, isLoaded: true, notice: describe(code, "This conversation no longer exists") });
            return;
          }
          this.streamNotice = true;
          this.set({ isLoaded: true, notice: describe(code, "Cannot reach the conversation") });
        }
      } catch {
        this.streamNotice = true;
        this.set({ isLoaded: true, notice: "Cannot reach the local server. Is npm run dev still running?" });
      }
    }
    const delay = this.reopenDelay;
    this.reopenDelay = Math.min(delay * 2, 30_000);
    this.reopenTimer = setTimeout(() => {
      this.reopenTimer = null;
      if (!this.disposed && !this.source && !this.flags.isDead) this.open();
    }, delay);
  }

  /** Fold queued events in one pass, so a long replay re-renders once, not per event. */
  private scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushScheduled = false;
      const events = this.queue;
      this.queue = [];
      let projection = this.projection;
      for (const event of events) projection = applyEvent(projection, event);
      if (projection === this.projection) return;
      this.projection = projection;
      if (this.awaitingRunAfter !== undefined && projection.lastRunStartSeq > this.awaitingRunAfter) this.clearAwaitingRun();
      for (const id of this.answered.keys()) if (!projection.pendingApprovals.includes(id)) this.answered.delete(id);
      this.emit();
    }, 0);
  }

  /** The replay counts as loaded once the stream has been quiet briefly. */
  private markActivity() {
    if (this.flags.isLoaded) return;
    if (this.loadedTimer) clearTimeout(this.loadedTimer);
    this.loadedTimer = setTimeout(() => {
      this.loadedTimer = null;
      this.set({ isLoaded: true });
    }, LOADED_AFTER_QUIET_MS);
  }

  /** Wait for the accepted message's run to start, unless it already has. */
  private startAwaitingRun(seq: number) {
    this.clearAwaitingRun();
    // A fast run can start, and even finish, before the messages route answers.
    if (this.projection.lastRunStartSeq > seq) return;
    this.awaitingRunAfter = seq;
    this.runWarningTimer = setTimeout(() => {
      this.runWarningTimer = null;
      if (this.awaitingRunAfter === undefined) return;
      this.awaitingRunAfter = undefined;
      this.set({ notice: "The message was accepted, but the Agent has not started. Check npm run status." });
    }, RUN_START_WARNING_MS);
  }

  private clearAwaitingRun() {
    this.awaitingRunAfter = undefined;
    if (this.runWarningTimer) clearTimeout(this.runWarningTimer);
    this.runWarningTimer = null;
  }

  // --------------------------------------------------------------- actions
  // The stream is opened by the thread's effect (runtime-provider.tsx) while
  // the conversation is on screen; sending does not open it, so a message sent
  // from a conversation the user has already left cannot leak a connection.
  async sendMessage(text: string): Promise<void> {
    if (this.snapshot.isBusy) throw new Error("The Agent is still working on the previous message.");
    const clientMessageId = this.retry?.text === text ? this.retry.clientMessageId : newId();
    const message: PendingMessage = {
      id: `local-${clientMessageId}`,
      clientMessageId,
      text,
      createdAt: new Date(),
      afterSeq: this.projection.lastSeq,
    };
    this.pending.push(message);
    this.set({ notice: null });

    let res: Response;
    try {
      res = await postJson(sessionUrl(this.sessionId, "/messages"), { text, clientMessageId });
    } catch {
      // The request may or may not have reached the Platform. Sending the same
      // text again reuses the key, so it cannot be delivered twice.
      this.retry = { text, clientMessageId };
      this.dropPending(message, "Could not reach the local server. The message may not have been sent; reload to check, or send it again.");
      throw new Error("send failed");
    }
    if (!res.ok) {
      const code = await errorCodeOf(res);
      if (res.status >= 500 || code === "timeout_or_cancelled") this.retry = { text, clientMessageId };
      this.dropPending(message, describe(code, "The message was not sent"));
      throw new Error(code ?? "send failed");
    }
    this.retry = null;
    message.accepted = true;
    const body = (await res.json().catch(() => ({}))) as { seq?: number };
    if (typeof body.seq === "number" && message.seq === undefined) {
      message.seq = body.seq;
      this.projection = aliasUserMessage(this.projection, body.seq, message.id);
    }
    // Without a seq, the text match in compute() hides the echo's duplicate until the bubble is replaced.
    this.startAwaitingRun(body.seq ?? message.afterSeq);
    this.emit();
  }

  private dropPending(message: PendingMessage, notice: string) {
    this.pending = this.pending.filter((p) => p !== message);
    this.set({ notice });
  }

  async interrupt(): Promise<void> {
    this.clearAwaitingRun();
    const res = await postJson(sessionUrl(this.sessionId, "/interrupt"), {});
    if (!res.ok) this.set({ notice: describe(await errorCodeOf(res), "Could not stop the Agent") });
    else this.emit();
  }

  async respondToApproval(approvalId: string, approved: boolean): Promise<void> {
    if (this.answered.has(approvalId)) return;
    this.answered.set(approvalId, approved);
    this.emit();
    try {
      await ensureOk(
        await postJson(sessionUrl(this.sessionId, `/approvals/${encodeURIComponent(approvalId)}`), {
          decision: approved ? "allow-once" : "deny",
        }),
        "record the decision",
      );
    } catch (error) {
      this.answered.delete(approvalId);
      this.set({ notice: error instanceof Error ? error.message : "The decision was not recorded" });
    }
  }
}

// ------------------------------------------------------------------ registry
const registry = new Map<string, SessionController>();

export function getSessionController(sessionId: string): SessionController {
  let controller = registry.get(sessionId);
  if (!controller) {
    controller = new SessionController(sessionId);
    registry.set(sessionId, controller);
  }
  return controller;
}

export function dropSessionController(sessionId: string): void {
  registry.get(sessionId)?.dispose();
  registry.delete(sessionId);
}
