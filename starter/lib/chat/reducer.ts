// Turns a ZooWork Session event log into an assistant-ui conversation.
//
// It is a pure fold: the same function handles the replayed history and the
// live tail (they arrive on the same stream), so an old conversation and a
// running one render the same way. No React, no fetching, no clocks.
//
// The mapping:
//   user.message                    → a user bubble
//   run.started / run.finished      → whether a turn is live, and its outcome
//   agent.thinking                  → a "Thinking…" part (progress only; no reasoning text is shown)
//   agent.assistant                 → assistant text (complete segments; this API has no token deltas)
//   agent.tool start / end / blocked → a tool-call part and its result
//   agent.approval requested/resolved → the Allow/Deny gate on that tool part
//   agent.custom_tool_use           → a tool-call part (this starter does not execute custom tools)
//   agent.error                     → the error shown if the run fails (not itself a verdict)
//
// Adapted from the Claude Managed Agents assistant-ui quickstart reducer
// (MIT, see third-party/anthropic-MIT.txt) for the ZooWork event model.

import type { WireEvent } from "./wire";

// ---------------------------------------------------------------------------
// Message model: a structural subset of assistant-ui's ThreadMessageLike.
// ---------------------------------------------------------------------------

/** What a tool call produced. The Platform sends a result preview, not the full output. */
export type ToolResultPayload = {
  text: string;
  isError: boolean;
  /** Set when the call ended without running (`deniedReason`). */
  blocked?: string;
};

export type ToolApproval = { id: string; approved?: boolean; reason?: string };

export type TextPart = { type: "text"; text: string };
export type ReasoningPart = { type: "reasoning"; text: string };
export type ToolPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  toolKind: "platform" | "custom";
  args: Record<string, unknown>;
  argsText: string;
  result?: ToolResultPayload;
  isError?: boolean;
  approval?: ToolApproval;
};
export type ContentPart = TextPart | ReasoningPart | ToolPart;

export type MessageStatus =
  | { type: "running" }
  | { type: "requires-action"; reason: "tool-calls" }
  | { type: "complete"; reason: "stop" | "unknown" }
  | { type: "incomplete"; reason: "cancelled" | "error"; error?: string };

export type ThreadMessage = {
  id: string;
  role: "assistant" | "user";
  content: ContentPart[];
  createdAt: Date;
  status?: MessageStatus;
  /** The outcome recorded by run.finished; the live status is derived from it. */
  settled?: MessageStatus;
};

export const THINKING_LABEL = "Thinking…";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Projection = {
  messages: readonly ThreadMessage[];
  /** Highest seq folded. The stream is ordered, so anything at or below it is a duplicate. */
  lastSeq: number;
  /** A run started and has not finished. */
  isRunning: boolean;
  /** seq of the latest run.started (0 before any). */
  lastRunStartSeq: number;
  /** Approval ids the Agent is waiting on. */
  pendingApprovals: readonly string[];
  /** user.message seq → index in `messages`. */
  userSeqs: ReadonlyMap<number, number>;
  /** user.message seq → the id its optimistic bubble used, so the swap keeps one message id. */
  aliases: ReadonlyMap<number, string>;
  /** Latest agent.error in the current run. */
  lastError: string | null;
};

export const initialProjection = (): Projection => ({
  messages: [],
  lastSeq: 0,
  isRunning: false,
  lastRunStartSeq: 0,
  pendingApprovals: [],
  userSeqs: new Map(),
  aliases: new Map(),
  lastError: null,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Text of a message `content`: a plain string, or the text blocks of a block array. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((b) => (isObj(b) && b.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
}

const UNKNOWN_TIME = new Date(0);
const timeOf = (iso?: string) => (iso ? new Date(iso) : UNKNOWN_TIME);

/** Index of the assistant message for the current turn, creating one after a user message. */
function currentAssistantIndex(messages: ThreadMessage[], event: WireEvent): number {
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") return messages.length - 1;
  messages.push({ id: `a${event.seq}`, role: "assistant", content: [], createdAt: timeOf(event.createdAt) });
  return messages.length - 1;
}

function findToolPart(messages: readonly ThreadMessage[], toolCallId: string) {
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const msg = messages[mi]!;
    if (msg.role !== "assistant") continue;
    const pi = msg.content.findIndex((p) => p.type === "tool-call" && p.toolCallId === toolCallId);
    if (pi !== -1) return { mi, pi } as const;
  }
  return null;
}

function updateToolPart(messages: ThreadMessage[], mi: number, pi: number, patch: (p: ToolPart) => Partial<ToolPart>) {
  const msg = messages[mi]!;
  const content = [...msg.content];
  const part = content[pi]!;
  if (part.type !== "tool-call") return;
  content[pi] = { ...part, ...patch(part) };
  messages[mi] = { ...msg, content };
}

function appendPart(messages: ThreadMessage[], event: WireEvent, part: ContentPart): { mi: number; pi: number } {
  const mi = currentAssistantIndex(messages, event);
  const msg = messages[mi]!;
  messages[mi] = { ...msg, content: [...msg.content, part] };
  return { mi, pi: messages[mi]!.content.length - 1 };
}

/** Find the tool part for a call, creating it if its start event was not seen. */
function ensureToolPart(
  messages: ThreadMessage[],
  event: WireEvent,
  toolCallId: string,
  init: () => Omit<ToolPart, "type" | "toolCallId">,
) {
  return findToolPart(messages, toolCallId) ?? appendPart(messages, event, { type: "tool-call", toolCallId, ...init() });
}

function toolArgs(value: unknown): { args: Record<string, unknown>; argsText: string } {
  const args = isObj(value) ? value : {};
  return { args, argsText: JSON.stringify(args, null, 2) };
}

/** A gate the Agent no longer waits on must not keep live Allow/Deny buttons. */
function stripUnresolvedApprovals(messages: readonly ThreadMessage[]): readonly ThreadMessage[] {
  let changed = false;
  const next = messages.map((msg) => {
    if (msg.role !== "assistant") return msg;
    let msgChanged = false;
    const content = msg.content.map((part) => {
      if (part.type !== "tool-call" || !part.approval || part.approval.approved !== undefined) return part;
      msgChanged = changed = true;
      const rest = { ...part };
      delete rest.approval;
      return rest;
    });
    return msgChanged ? { ...msg, content } : msg;
  });
  return changed ? next : messages;
}

const BLOCKED_REASONS: Record<string, string> = {
  "approval-denied": "Denied",
  "approval-timeout": "The approval request timed out",
  "approval-cancelled": "The approval request was cancelled",
  interrupted: "Stopped",
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** The current turn's assistant message carries the live status; earlier ones keep their outcome. */
function withDerivedStatuses(state: Projection): Projection {
  let li = -1;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i]!.role === "assistant") {
      li = i;
      break;
    }
  }
  if (li === -1) return state;
  const last = state.messages[li]!;
  const isCurrentTurn = li === state.messages.length - 1;
  let status: MessageStatus;
  if (isCurrentTurn && state.pendingApprovals.length > 0) status = { type: "requires-action", reason: "tool-calls" };
  else if (isCurrentTurn && state.isRunning) status = { type: "running" };
  else status = last.settled ?? { type: "complete", reason: "unknown" };
  if (JSON.stringify(last.status ?? null) === JSON.stringify(status)) return state;
  const messages = [...state.messages];
  messages[li] = { ...last, status };
  return { ...state, messages };
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

export function applyEvent(state: Projection, event: WireEvent): Projection {
  if (!Number.isFinite(event.seq) || event.seq <= state.lastSeq) return state;
  const next = applyEventInner({ ...state, lastSeq: event.seq }, event);
  return withDerivedStatuses(next);
}

function applyEventInner(state: Projection, event: WireEvent): Projection {
  const p = event.payload;
  switch (event.eventType) {
    case "user.message": {
      const messages = [...state.messages];
      messages.push({
        id: state.aliases.get(event.seq) ?? `u${event.seq}`,
        role: "user",
        content: [{ type: "text", text: textOf(p.content) }],
        createdAt: timeOf(event.createdAt),
      });
      const userSeqs = new Map(state.userSeqs).set(event.seq, messages.length - 1);
      return { ...state, messages, userSeqs, lastError: null };
    }

    case "run.started":
      return { ...state, isRunning: true, lastRunStartSeq: event.seq, lastError: null };

    case "agent.thinking": {
      const messages = [...state.messages];
      const mi = currentAssistantIndex(messages, event);
      const lastPart = messages[mi]!.content.at(-1);
      if (lastPart?.type !== "reasoning") appendPart(messages, event, { type: "reasoning", text: THINKING_LABEL });
      return { ...state, messages };
    }

    case "agent.assistant": {
      const text = textOf(isObj(p.message) ? p.message.content : undefined);
      if (!text) return state;
      const messages = [...state.messages];
      appendPart(messages, event, { type: "text", text });
      return { ...state, messages };
    }

    case "agent.tool": {
      const toolCallId = str(p.toolCallId);
      if (!toolCallId) return state;
      const toolName = str(p.toolName) ?? "tool";
      const messages = [...state.messages];
      const at = ensureToolPart(messages, event, toolCallId, () => ({ toolName, toolKind: "platform", ...toolArgs(p.args) }));
      if (p.phase === "end") {
        const result: ToolResultPayload = { text: str(p.resultPreview) ?? "", isError: p.isError === true };
        updateToolPart(messages, at.mi, at.pi, () => ({ result, isError: result.isError }));
      } else if (p.phase === "blocked") {
        const reason = str(p.deniedReason) ?? "blocked";
        const result: ToolResultPayload = { text: BLOCKED_REASONS[reason] ?? `Not run: ${reason}`, isError: true, blocked: reason };
        updateToolPart(messages, at.mi, at.pi, (part) => ({
          result,
          isError: true,
          ...(part.approval && part.approval.approved === undefined
            ? { approval: { ...part.approval, approved: false, reason: result.text } }
            : {}),
        }));
      } else if (isObj(p.args)) {
        updateToolPart(messages, at.mi, at.pi, () => toolArgs(p.args));
      }
      return { ...state, messages };
    }

    case "agent.approval": {
      const approvalId = str(p.approvalId);
      const toolCallId = str(p.toolCallId);
      if (!approvalId || !toolCallId) return state;
      const messages = [...state.messages];
      const at = ensureToolPart(messages, event, toolCallId, () => ({
        toolName: str(p.toolName) ?? "tool",
        toolKind: "platform",
        ...toolArgs(p.arguments),
      }));
      if (p.phase === "requested") {
        updateToolPart(messages, at.mi, at.pi, (part) =>
          part.approval?.approved !== undefined ? {} : { approval: { id: approvalId } },
        );
        const pendingApprovals = state.pendingApprovals.includes(approvalId)
          ? state.pendingApprovals
          : [...state.pendingApprovals, approvalId];
        return { ...state, messages, pendingApprovals };
      }
      const resolution = str(p.resolution) ?? "";
      const approved = resolution.startsWith("allow");
      updateToolPart(messages, at.mi, at.pi, () => ({
        approval: {
          id: approvalId,
          approved,
          ...(!approved && resolution && resolution !== "deny" ? { reason: resolution } : {}),
        },
      }));
      return { ...state, messages, pendingApprovals: state.pendingApprovals.filter((id) => id !== approvalId) };
    }

    case "agent.custom_tool_use": {
      const callId = str(p.toolCallId) ?? str(p.callId);
      if (!callId) return state;
      const messages = [...state.messages];
      const at = ensureToolPart(messages, event, callId, () => ({
        toolName: str(p.name) ?? "custom_tool",
        toolKind: "custom",
        ...toolArgs(p.input),
      }));
      if (p.phase === "resolved") {
        const outcome = str(p.outcome) ?? "completed";
        const result: ToolResultPayload = { text: outcome, isError: p.isError === true || outcome !== "completed" };
        updateToolPart(messages, at.mi, at.pi, () => ({ result, isError: result.isError }));
      }
      return { ...state, messages };
    }

    case "agent.error":
      return { ...state, lastError: str(p.errorMessage) ?? "The Agent reported an error." };

    case "run.finished": {
      const outcome = str(p.status);
      const messages = [...stripUnresolvedApprovals(state.messages)];
      const last = messages[messages.length - 1];
      const hasTurnMessage = last?.role === "assistant";
      let settled: MessageStatus | undefined;
      if (outcome === "failed") {
        settled = { type: "incomplete", reason: "error", error: state.lastError ?? "The run failed." };
      } else if (outcome === "aborted") {
        settled = { type: "incomplete", reason: "cancelled" };
      } else {
        settled = { type: "complete", reason: "stop" };
      }
      // A failed run can end before the Agent wrote anything: give the error a message to sit on.
      if (hasTurnMessage || outcome === "failed") {
        const mi = currentAssistantIndex(messages, event);
        messages[mi] = { ...messages[mi]!, settled };
      }
      return { ...state, messages, isRunning: false, pendingApprovals: [] };
    }

    default:
      // agent.lifecycle, agent.item, agent.compaction, echoed interrupts and
      // any type added later are not rendered. Ignore rather than fail.
      return state;
  }
}

export function project(events: Iterable<WireEvent>, from = initialProjection()): Projection {
  let state = from;
  for (const event of events) state = applyEvent(state, event);
  return state;
}

/** The Agent is working, or waiting for an Allow/Deny decision. */
export const isBusy = (state: Projection): boolean => state.isRunning || state.pendingApprovals.length > 0;

/**
 * The messages route returned the accepted user.message's seq. Record that
 * the event should keep its optimistic bubble's id; if the echo already
 * folded, rename it in place. assistant-ui keys messages by id, and a new id
 * in the same position would read as an edited second branch.
 */
export function aliasUserMessage(state: Projection, seq: number, id: string): Projection {
  const aliases = new Map(state.aliases).set(seq, id);
  const index = state.userSeqs.get(seq);
  if (index === undefined) return { ...state, aliases };
  const messages = [...state.messages];
  messages[index] = { ...messages[index]!, id };
  return { ...state, messages, aliases };
}
