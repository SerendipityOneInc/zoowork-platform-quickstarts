import type {
  ApprovalRecord,
  OutboundEvent,
  SessionEvent,
} from "@zoowork-ai/sdk";
import { z } from "zod";
import {
  attributeInfo,
  formatMoney,
  formatSpec,
  mismatches,
  type Evidence,
  type Product,
  type Requirements,
} from "./catalog.js";

export interface ToolState {
  id: string;
  name: string;
  phase: string;
  args?: Record<string, unknown>;
  isError?: boolean;
  executionStarted?: boolean;
  deniedReason?: string;
  receiptId?: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}
export interface ShortlistItem {
  product: Product;
  reasons: string[];
  caveats: string[];
  receiptId: string;
}
export interface Conversation {
  id: string;
  visitorId: string;
  agentId: string;
  sessionId?: string;
  createdAt: string;
  title: string;
  requirements: Requirements;
  status:
    | "creating"
    | "running"
    | "awaiting_approval"
    | "finished"
    | "failed"
    | "uncertain"
    | "recovering";
  createRequest: {
    metadata: Record<string, string>;
    initial_events: OutboundEvent[];
  };
  createKey: string;
  pendingMessage?: { requestId: string; events: OutboundEvent[] };
  sentRequestIds: string[];
  messages: Message[];
  events: SessionEvent[];
  cursor?: string;
  lastSeq: number;
  turnStartSeq?: number;
  tools: Record<string, ToolState>;
  approvals: ApprovalRecord[];
  evidence: Record<string, Evidence>;
  hydration: Record<string, { toolCallId: string; attempts: number }>;
  warnings: string[];
  shortlist: ShortlistItem[];
  comparison?: Evidence;
  assistantBlocks: string[];
  pendingReply?: string;
  denied: boolean;
  selectedIds: string[];
  approvalRequests?: Record<
    string,
    { decision: "allow-once" | "deny"; uncertain: boolean }
  >;
}
export type ConversationView = Pick<
  Conversation,
  | "id"
  | "title"
  | "createdAt"
  | "requirements"
  | "status"
  | "messages"
  | "tools"
  | "approvals"
  | "evidence"
  | "warnings"
  | "shortlist"
  | "comparison"
  | "selectedIds"
>;
export function view(c: Conversation): ConversationView {
  const {
    id,
    title,
    createdAt,
    requirements,
    status,
    messages,
    tools: savedTools,
    approvals,
    evidence,
    warnings,
    shortlist,
    comparison,
    selectedIds,
  } = c;
  // Older snapshots predate deniedReason projection. Durable events retain
  // native denials even when the runtime emits no tool-end event.
  const denials = new Map<string, string>();
  for (const event of c.events) {
    const p = event.payload;
    if (
      event.eventType === "agent.tool" &&
      p.phase === "blocked" &&
      typeof p.toolCallId === "string" &&
      typeof p.deniedReason === "string" &&
      p.deniedReason
    )
      denials.set(p.toolCallId, p.deniedReason);
  }
  const tools = Object.fromEntries(
    Object.entries(savedTools).map(([id, t]) => [
      id,
      denials.has(id)
        ? { ...t, deniedReason: denials.get(id), executionStarted: false }
        : t,
    ]),
  );
  return {
    id,
    title,
    createdAt,
    requirements,
    status,
    messages,
    tools,
    approvals,
    evidence,
    warnings,
    shortlist,
    comparison,
    selectedIds,
  };
}
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
    readonly conversationId?: string,
  ) {
    super(code);
  }
}
const replySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("recommendation"),
      items: z
        .array(
          z
            .object({
              productId: z.string(),
              receiptId: z.string(),
              reasonCodes: z
                .array(
                  z.enum([
                    "budget",
                    "ram",
                    "weight",
                    "battery",
                    "refresh",
                    "usb",
                    "anc",
                  ]),
                )
                .max(7),
            })
            .strict(),
        )
        .min(1)
        .max(3),
    })
    .strict(),
  z
    .object({
      type: z.literal("clarification"),
      question: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({ type: z.literal("message"), message: z.string().min(1).max(500) })
    .strict(),
]);
export function parseReply(
  text: string,
): z.infer<typeof replySchema> | undefined {
  const block = /```product-advisor-result\s*\n([\s\S]*?)```/.exec(text);
  if (!block) return undefined;
  try {
    return replySchema.parse(JSON.parse(block[1]!));
  } catch {
    return undefined;
  }
}
export function recommendations(
  c: Conversation,
  items: Extract<
    z.infer<typeof replySchema>,
    { type: "recommendation" }
  >["items"],
): ShortlistItem[] {
  const all: ShortlistItem[] = [];
  const seen = new Set<string>();
  const currentReceipts = new Set(
    c.events
      .filter(
        (event) =>
          event.seq > (c.turnStartSeq ?? -1) &&
          event.eventType === "agent.tool" &&
          event.payload.phase === "end",
      )
      .map((event) => c.tools[String(event.payload.toolCallId)]?.receiptId),
  );
  const searchIds = new Set(
    Object.values(c.evidence)
      .filter((e) => e.tool === "search_products")
      .flatMap((e) =>
        e.result.products.map((p) => `${p.catalogVersion}:${p.productId}`),
      ),
  );
  for (const item of items) {
    const e = c.evidence[item.receiptId];
    const p = e?.result.products.find((p) => p.productId === item.productId);
    if (
      !e ||
      !p ||
      !currentReceipts.has(item.receiptId) ||
      !searchIds.has(`${p.catalogVersion}:${p.productId}`) ||
      mismatches(p, c.requirements).length ||
      seen.has(p.productId)
    )
      continue;
    seen.add(p.productId);
    const reasons: string[] = [];
    if (c.requirements.maxPriceMinor !== undefined)
      reasons.push(
        `Catalog price ${formatMoney(p.priceMinor)}, ${formatMoney(c.requirements.maxPriceMinor - p.priceMinor)} below budget`,
      );
    const reasonsMap = {
      ram: "ramGB",
      weight: "weightKg",
      battery: "batteryHours",
      refresh: "refreshHz",
      usb: "usbPowerW",
      anc: "anc",
    } as const;
    for (const code of item.reasonCodes)
      if (code !== "budget") {
        const key = reasonsMap[code];
        const value = p.specs[key];
        if (value !== null && value !== undefined)
          reasons.push(
            `${{ ramGB: "RAM", weightKg: "Weight", batteryHours: "Catalog battery life", refreshHz: "Refresh rate", usbPowerW: "USB-C power", anc: "Noise cancellation" }[key]}: ${formatSpec(key, value)}`,
          );
      }
    const caveats = Object.entries(p.specs)
      .filter(([, v]) => v === null)
      .map(([k]) => `${attributeInfo[k]?.label ?? k}: Not provided by catalog`);
    all.push({ product: p, reasons, caveats, receiptId: e.receiptId });
  }
  return all;
}
export const userMessageSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
    requirements: z
      .object({
        category: z.enum(["laptop", "monitor", "headphones"]).optional(),
        maxPriceMinor: z.number().int().positive().max(100_000_000).optional(),
        filters: z.record(z.union([z.number(), z.boolean()])).optional(),
      })
      .optional(),
  })
  .strict();
