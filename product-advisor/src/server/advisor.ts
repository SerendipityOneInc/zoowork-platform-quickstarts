import { randomUUID } from "node:crypto";
import {
  assistantText,
  ZooworkError,
  type ZooworkClient,
  type OutboundEvent,
  type SessionEvent,
} from "@zoowork-ai/sdk";
import {
  evidenceSchema,
  requirementsSchema,
  mismatches,
  toolNames,
  type Requirements,
  type Evidence,
} from "../domain/catalog.js";
import {
  AppError,
  parseReply,
  recommendations,
  type Conversation,
  type ConversationView,
  view,
} from "../domain/conversation.js";
import { confirmedRequirements } from "../domain/requirements.js";
import { Conversations } from "../storage/conversations.js";

type Client = Pick<
  ZooworkClient,
  | "createSession"
  | "postEvents"
  | "streamEvents"
  | "listAllEvents"
  | "getSession"
  | "listApprovals"
  | "resolveApproval"
>;
export class Advisor {
  private workers = new Map<string, Promise<void>>();
  private controls = new Map<string, AbortController>();
  private submitting = new Set<string>();
  private closed = false;
  constructor(
    readonly store: Conversations,
    readonly client: Client,
    readonly agentId: string,
    readonly mcpUrl: string,
    readonly fetcher: typeof fetch = fetch,
  ) {}
  resume(): void {
    for (const c of this.store.active()) this.watch(c.id);
  }
  private userEvent(
    visitor: string,
    text: string,
    r: Requirements,
    id: string,
    instruction = "",
  ): OutboundEvent {
    return {
      type: "user.message",
      actor: { ref: `visitor:${visitor}` },
      idempotency_key: id,
      content: `User requirements: ${text}\nConfirmed application requirements (clarify missing fields): ${JSON.stringify(r)}\n${instruction}\nUse only the catalog MCP. Return verifiable results in the product-advisor-result format. Always write user-facing messages in English.`,
    };
  }
  async create(
    visitor: string,
    text: string,
    r: Requirements,
    requestId: string,
  ): Promise<ConversationView> {
    const previous = this.store.createdByKey(
      visitor,
      `advisor:${visitor}:${requestId}`,
    );
    if (previous) return view(previous);
    r = confirmedRequirements(text, r);
    const id = randomUUID();
    const c: Conversation = {
      id,
      visitorId: visitor,
      agentId: this.agentId,
      createdAt: new Date().toISOString(),
      title: text.slice(0, 40),
      requirements: r,
      status: "creating",
      createKey: `advisor:${visitor}:${requestId}`,
      createRequest: {
        metadata: { source: "product-advisor", conversation: id },
        initial_events: [this.userEvent(visitor, text, r, requestId)],
      },
      sentRequestIds: [requestId],
      messages: [{ id: requestId, role: "user", text }],
      events: [],
      lastSeq: -1,
      tools: {},
      approvals: [],
      evidence: {},
      hydration: {},
      warnings: [],
      shortlist: [],
      assistantBlocks: [],
      denied: false,
      selectedIds: [],
    };
    this.store.insert(c);
    await this.createSession(id);
    return view(this.store.get(id));
  }
  private async createSession(id: string): Promise<void> {
    if (this.submitting.has(id)) throw new AppError("request_in_progress", 409);
    this.submitting.add(id);
    try {
      const c = this.store.get(id);
      if (c.sessionId) {
        this.watch(id);
        return;
      }
      const s = await this.client.createSession(
        this.agentId,
        c.createRequest,
        c.createKey,
      );
      if (!s.session_id) throw new Error("invalid_session_receipt");
      this.store.update(id, (c) => {
        c.sessionId = s.session_id;
        c.status = "running";
        c.warnings = c.warnings.filter(
          (w) => w !== "message_delivery_uncertain",
        );
      });
      this.watch(id);
    } catch {
      this.store.update(id, (c) => {
        c.status = "uncertain";
        c.warnings.push("message_delivery_uncertain");
      });
      throw new AppError("message_delivery_uncertain", 503, id);
    } finally {
      this.submitting.delete(id);
    }
  }
  async message(
    visitor: string,
    id: string,
    text: string,
    r: Requirements,
    requestId: string,
    instruction = "",
  ): Promise<ConversationView> {
    let c = this.store.get(id, visitor);
    if (c.pendingMessage?.requestId === requestId) {
      await this.retry(visitor, id);
      return view(this.store.get(id));
    }
    if (c.sentRequestIds.includes(requestId)) return view(c);
    if (!["finished", "failed"].includes(c.status))
      throw new AppError("turn_in_progress", 409);
    await this.idle(id);
    c = this.store.get(id, visitor);
    if (c.sentRequestIds.includes(requestId)) return view(c);
    if (!["finished", "failed"].includes(c.status))
      throw new AppError("turn_in_progress", 409);
    r = confirmedRequirements(text, r);
    this.store.update(id, (c) => {
      c.requirements = r;
      c.turnStartSeq = c.lastSeq;
      c.pendingReply = undefined;
      c.pendingMessage = {
        requestId,
        events: [this.userEvent(visitor, text, r, requestId, instruction)],
      };
      c.messages.push({ id: requestId, role: "user", text });
      c.status = "running";
      c.shortlist = [];
      c.comparison = undefined;
      c.assistantBlocks = [];
      c.denied = false;
      c.warnings = [];
    });
    await this.sendPending(id);
    return view(this.store.get(id));
  }
  private async sendPending(id: string): Promise<void> {
    if (this.submitting.has(id)) throw new AppError("request_in_progress", 409);
    this.submitting.add(id);
    try {
      const c = this.store.get(id);
      if (!c.pendingMessage || !c.sessionId)
        throw new AppError("no_pending_message", 409);
      const response = await this.client.postEvents(
        this.agentId,
        c.sessionId,
        c.pendingMessage.events,
      );
      if (response.events.some((e) => e.accepted === false))
        throw new Error("message_not_accepted");
      this.store.update(id, (c) => {
        c.sentRequestIds.push(c.pendingMessage!.requestId);
        c.pendingMessage = undefined;
        c.status = "running";
        c.warnings = c.warnings.filter(
          (w) => w !== "message_delivery_uncertain",
        );
      });
      this.watch(id);
    } catch {
      this.store.update(id, (c) => {
        c.status = "uncertain";
        c.warnings.push("message_delivery_uncertain");
      });
      throw new AppError("message_delivery_uncertain", 503, id);
    } finally {
      this.submitting.delete(id);
    }
  }
  async retry(visitor: string, id: string): Promise<void> {
    const c = this.store.get(id, visitor);
    if (!c.sessionId) await this.createSession(id);
    else if (c.pendingMessage) await this.sendPending(id);
    else if (["finished", "failed"].includes(c.status)) {
      this.store.update(id, (c) => {
        for (const job of Object.values(c.hydration)) job.attempts = 0;
      });
      await this.hydrate(id);
      if (this.closed) return;
      this.finish(id);
    } else this.watch(id);
  }
  async decide(
    visitor: string,
    id: string,
    approvalId: string,
    decision: "allow-once" | "deny",
  ): Promise<void> {
    const c = this.store.get(id, visitor);
    if (!c.sessionId) throw new AppError("session_not_ready", 409);
    const saved =
      c.approvalRequests && Object.hasOwn(c.approvalRequests, approvalId)
        ? c.approvalRequests[approvalId]
        : undefined;
    if (saved && saved.decision !== decision)
      throw new AppError("approval_decision_locked", 409);
    let pending;
    try {
      pending = await this.client.listApprovals(this.agentId, {
        status: "pending",
      });
    } catch (error) {
      if (error instanceof ZooworkError && error.status === 501)
        throw new AppError("approvals_unavailable", 501);
      throw new AppError("approval_read_failed", 503);
    }
    const a = pending.find(
      (a) => a.approval_id === approvalId && a.session_id === c.sessionId,
    );
    if (!a) throw new AppError("approval_not_pending", 409);
    if (a.allowed_decisions && !a.allowed_decisions.includes(decision))
      throw new AppError("approval_decision_not_allowed", 409);
    if (this.submitting.has(id)) throw new AppError("request_in_progress", 409);
    this.submitting.add(id);
    this.store.update(id, (c) => {
      c.approvalRequests = {
        ...c.approvalRequests,
        [approvalId]: { decision, uncertain: true },
      };
      const a = c.approvals.find((a) => a.approval_id === approvalId);
      if (a) {
        a.signaled = true;
        a.decision = decision;
        a.deliveryUncertain = true;
      }
      if (decision === "deny") c.denied = true;
    });
    try {
      await this.client.resolveApproval(this.agentId, approvalId, {
        decision,
        resolvedBy: `visitor:${visitor}`,
      });
      this.store.update(id, (c) => {
        c.approvalRequests![approvalId]!.uncertain = false;
        const existing = c.approvals.find((a) => a.approval_id === approvalId);
        if (existing) {
          existing.deliveryUncertain = false;
        }
        c.warnings = c.warnings.filter(
          (w) => w !== "approval_delivery_uncertain",
        );
      });
      this.watch(id);
    } catch (error) {
      this.store.update(id, (c) => {
        if (!c.warnings.includes("approval_delivery_uncertain"))
          c.warnings.push("approval_delivery_uncertain");
      });
      if (error instanceof ZooworkError && error.status === 501) {
        await this.interrupt(visitor, id);
        throw new AppError("approvals_unavailable", 501);
      }
      throw new AppError("approval_delivery_uncertain", 503);
    } finally {
      this.submitting.delete(id);
    }
  }
  async interrupt(visitor: string, id: string): Promise<void> {
    const c = this.store.get(id, visitor);
    if (!c.sessionId) throw new AppError("session_not_ready", 409);
    await this.client.postEvents(this.agentId, c.sessionId, [
      { type: "user.interrupt" },
    ]);
    this.watch(id);
  }
  async compare(
    visitor: string,
    id: string,
    ids: string[],
    requestId: string,
  ): Promise<ConversationView> {
    const c = this.store.get(id, visitor);
    const products = Object.values(c.evidence)
      .filter((e) => e.tool === "search_products")
      .reverse()
      .flatMap((e) => e.result.products);
    if (ids.length < 2 || ids.length > 4 || new Set(ids).size !== ids.length)
      throw new AppError("select_two_to_four_products");
    const selected = ids.map((id) => products.find((p) => p.productId === id));
    if (
      selected.some((p) => !p) ||
      selected.some(
        (p) =>
          p!.category !== selected[0]!.category ||
          p!.catalogVersion !== selected[0]!.catalogVersion,
      )
    )
      throw new AppError("comparison_not_in_session");
    this.store.update(id, (c) => {
      c.selectedIds = ids;
    });
    return this.message(
      visitor,
      id,
      `Compare specifications for ${selected.map((p) => p!.name).join(", ")}.`,
      c.requirements,
      requestId,
      `Call compare_products with product IDs ${ids.join(", ")} and catalogVersion ${selected[0]!.catalogVersion}. Wait for native user approval. Keep the product set unchanged.`,
    );
  }
  async details(
    visitor: string,
    id: string,
    productId: string,
    catalogVersion: string,
    requestId: string,
  ): Promise<ConversationView> {
    const c = this.store.get(id, visitor);
    const p = Object.values(c.evidence)
      .filter(
        (e) =>
          e.tool === "search_products" && e.catalogVersion === catalogVersion,
      )
      .flatMap((e) => e.result.products)
      .find((p) => p.productId === productId);
    if (!p) throw new AppError("product_not_in_session");
    return this.message(
      visitor,
      id,
      `View full specifications for ${p.name}.`,
      c.requirements,
      requestId,
      `Call get_products with productIds ["${productId}"] and catalogVersion ${catalogVersion}. Wait for native user approval.`,
    );
  }
  private watch(id: string): void {
    if (this.workers.has(id)) return;
    const work = this.run(id)
      .catch(() => {
        this.store.update(id, (c) => {
          if (!["finished", "failed", "uncertain"].includes(c.status)) {
            c.status = "recovering";
            if (!c.warnings.includes("stream_recovery_required"))
              c.warnings.push("stream_recovery_required");
          }
        });
      })
      .finally(() => {
        this.workers.delete(id);
        this.controls.delete(id);
      });
    this.workers.set(id, work);
  }
  async idle(id: string): Promise<void> {
    await this.workers.get(id);
  }
  private async run(id: string): Promise<void> {
    for (let attempt = 0; attempt < 3 && !this.closed; attempt++) {
      const c = this.store.get(id);
      if (!c.sessionId) return;
      await this.hydrate(id);
      if (this.closed) return;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 70_000);
      this.controls.set(id, ctl);
      try {
        await this.refreshApprovals(id);
        if (this.closed) return;
        for await (const e of this.client.streamEvents(
          this.agentId,
          c.sessionId,
          { ...(c.cursor ? { cursor: c.cursor } : {}), signal: ctl.signal },
        )) {
          await this.processEvent(id, e);
          if (e.eventType === "run.finished") return;
        }
      } catch {
      } finally {
        clearTimeout(timer);
        ctl.abort();
      }
      if (this.closed) return;
      const replay = await this.client.listAllEvents(this.agentId, c.sessionId);
      for (const e of replay)
        if (e.seq > this.store.get(id).lastSeq) {
          await this.processEvent(id, e);
          if (e.eventType === "run.finished") return;
        }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    throw new Error("stream_retry_budget_exhausted");
  }
  private async refreshApprovals(id: string): Promise<void> {
    const c = this.store.get(id);
    try {
      const all = await this.client.listApprovals(this.agentId, {
        status: "pending",
      });
      this.store.update(id, (c) => {
        c.approvals = all
          .filter((a) => a.session_id === c.sessionId)
          .map((a) => {
            const approvalId = a.approval_id ?? "";
            const saved =
              c.approvalRequests &&
              Object.hasOwn(c.approvalRequests, approvalId)
                ? c.approvalRequests[approvalId]
                : undefined;
            return saved
              ? {
                  ...a,
                  signaled: true,
                  decision: saved.decision,
                  deliveryUncertain: saved.uncertain,
                }
              : a;
          });
        if (c.approvals.length) c.status = "awaiting_approval";
      });
    } catch (error) {
      if (error instanceof ZooworkError && error.status === 501) {
        this.store.update(id, (c) => {
          if (!c.warnings.includes("approvals_unavailable"))
            c.warnings.push("approvals_unavailable");
        });
        if (c.approvals.length && c.sessionId)
          await this.interrupt(c.visitorId, id);
      }
    }
  }
  async processEvent(id: string, e: SessionEvent): Promise<void> {
    const current = this.store.get(id);
    if (e.seq < 0 || e.seq <= current.lastSeq) return;
    const p = e.payload;
    let approval = false;
    let end = false;
    this.store.update(id, (c) => {
      c.events.push(e);
      c.lastSeq = e.seq;
      if (e.cursor) c.cursor = e.cursor;
      if (e.eventType === "run.started") c.status = "running";
      if (e.eventType === "agent.assistant") {
        const text = assistantText(e);
        if (text) c.assistantBlocks.push(text);
      }
      if (e.eventType === "agent.error")
        c.warnings.push(
          typeof p.kind === "string" &&
            ["mcp_connection_failed", "mcp_authentication_failed"].includes(
              p.kind,
            )
            ? p.kind
            : "agent_error",
        );
      if (
        e.eventType === "agent.tool" &&
        typeof p.toolCallId === "string" &&
        typeof p.toolName === "string"
      ) {
        const t = c.tools[p.toolCallId] ?? {
          id: p.toolCallId,
          name: p.toolName,
          phase: "start",
        };
        t.phase = typeof p.phase === "string" ? p.phase : "unknown";
        if (p.args && typeof p.args === "object")
          t.args = p.args as Record<string, unknown>;
        if (typeof p.isError === "boolean") t.isError = p.isError;
        if (typeof p.executionStarted === "boolean")
          t.executionStarted = p.executionStarted;
        if (t.phase === "blocked") {
          t.executionStarted = false;
          if (typeof p.deniedReason === "string" && p.deniedReason)
            t.deniedReason = p.deniedReason;
        }
        c.tools[t.id] = t;
        if (
          t.phase === "end" &&
          !t.isError &&
          toolNames.some((n) => t.name === `mcp__catalog__${n}`)
        ) {
          const match =
            typeof p.resultPreview === "string"
              ? /"receiptId"\s*:\s*"(rcp_[a-f0-9]{32})"/.exec(p.resultPreview)
              : null;
          if (match) {
            t.receiptId = match[1];
            c.hydration[match[1]!] = { toolCallId: t.id, attempts: 0 };
          } else c.warnings.push("tool_receipt_missing");
        }
        if (t.isError && !(t.executionStarted === false && c.denied))
          c.warnings.push("catalog_tool_failed");
      }
      if (e.eventType === "agent.approval") {
        if (p.phase === "requested") {
          approval = true;
          c.status = "awaiting_approval";
          if (
            typeof p.approvalId === "string" &&
            !c.approvals.some((a) => a.approval_id === p.approvalId)
          )
            c.approvals.push({
              approval_id: p.approvalId,
              session_id: c.sessionId,
              tool_name:
                typeof p.toolName === "string" ? p.toolName : undefined,
              status: "pending",
              allowed_decisions: ["allow-once", "deny"],
            });
        } else if (p.phase === "resolved") {
          c.approvals = c.approvals.filter(
            (a) => a.approval_id !== p.approvalId,
          );
          c.status = "running";
          c.warnings = c.warnings.filter(
            (w) => w !== "approval_delivery_uncertain",
          );
          if (p.resolution === "deny") c.denied = true;
        }
      }
      if (e.eventType === "run.finished") {
        end = true;
        c.approvals = [];
        if (p.status !== "succeeded")
          c.warnings.push(
            p.status === "aborted" ? "turn_stopped" : "turn_failed",
          );
      }
    });
    await this.hydrate(id);
    if (approval) {
      const c = this.store.get(id);
      const approvalId = String(p.approvalId);
      const submitted =
        c.approvalRequests && Object.hasOwn(c.approvalRequests, approvalId)
          ? c.approvalRequests[approvalId]
          : undefined;
      if (c.denied && submitted?.decision !== "deny")
        await this.interrupt(c.visitorId, id);
      else await this.refreshApprovals(id);
    }
    if (end) {
      this.store.update(id, (c) => {
        c.status = p.status === "succeeded" ? "finished" : "failed";
      });
      this.finish(id);
    }
  }
  private async hydrate(id: string): Promise<void> {
    const c = this.store.get(id);
    for (const [receiptId, job] of Object.entries(c.hydration)) {
      if (job.attempts >= 3) continue;
      this.store.update(id, (c) => {
        c.hydration[receiptId]!.attempts++;
      });
      try {
        const base = new URL(this.mcpUrl);
        base.pathname = base.pathname.replace(
          /\/mcp\/?$/,
          "/evidence/" + receiptId,
        );
        base.search = "";
        base.hash = "";
        const r = await this.fetcher(base, {
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        });
        if (!r.ok) throw new Error("receipt_unavailable");
        const reader = r.body?.getReader();
        if (!reader) throw new Error("receipt_body_missing");
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.byteLength;
            if (length > 256_000) throw new Error("receipt_too_large");
            chunks.push(part.value);
          }
        } finally {
          await reader.cancel();
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        const evidence = evidenceSchema.parse(JSON.parse(raw));
        this.validateEvidence(c, evidence, job.toolCallId);
        this.store.update(id, (c) => {
          c.evidence[receiptId] = evidence;
          if (evidence.tool === "search_products")
            c.selectedIds = c.selectedIds.filter((id) =>
              evidence.result.products.some((p) => p.productId === id),
            );
          delete c.hydration[receiptId];
          if (!Object.keys(c.hydration).length)
            c.warnings = c.warnings.filter((w) => w !== "evidence_unavailable");
          if (evidence.tool === "compare_products") c.comparison = evidence;
        });
      } catch {
        this.store.update(id, (c) => {
          if (!c.warnings.includes("evidence_unavailable"))
            c.warnings.push("evidence_unavailable");
        });
      }
    }
  }
  private validateEvidence(c: Conversation, e: Evidence, callId: string): void {
    const t = c.tools[callId];
    if (
      !t ||
      t.phase !== "end" ||
      t.executionStarted === false ||
      t.isError ||
      t.receiptId !== e.receiptId ||
      t.name !== `mcp__catalog__${e.tool}` ||
      e.result.products.some((p) => p.catalogVersion !== e.catalogVersion)
    )
      throw new Error("evidence_mismatch");
    if (e.tool !== "search_products") {
      const ids = t.args?.productIds;
      if (
        !Array.isArray(ids) ||
        JSON.stringify([...ids].sort()) !==
          JSON.stringify(e.result.products.map((p) => p.productId).sort()) ||
        t.args?.catalogVersion !== e.catalogVersion
      )
        throw new Error("evidence_argument_mismatch");
      if (
        e.tool === "compare_products" &&
        (!e.result.rows?.length ||
          e.result.rows.some((row) =>
            e.result.products.some(
              (p) => row.values[p.productId] !== (p.specs[row.key] ?? null),
            ),
          ))
      )
        throw new Error("comparison_facts_mismatch");
    }
  }
  private finish(id: string): void {
    this.store.update(id, (c) => {
      const final =
        c.assistantBlocks
          .slice()
          .reverse()
          .find((t) => parseReply(t)) ?? c.pendingReply;
      if (final) c.pendingReply = final;
      const reply = final ? parseReply(final) : undefined;
      c.messages = c.messages.filter((m) => m.id !== `reply-${c.lastSeq}`);
      if (reply?.type === "recommendation") {
        c.shortlist = recommendations(c, reply.items);
        c.messages.push({
          id: `reply-${c.lastSeq}`,
          role: "assistant",
          text: c.shortlist.length
            ? `Prepared ${c.shortlist.length} ${c.shortlist.length === 1 ? "candidate" : "candidates"} from catalog records. See the product cards for specifications and verified reasons.`
            : "No recommendation meets the confirmed requirements in this turn. Check the candidates and unmet requirements.",
        });
      } else if (reply)
        c.messages.push({
          id: `reply-${c.lastSeq}`,
          role: "assistant",
          text:
            reply.type === "clarification"
              ? reply.question
              : c.denied
                ? "This specification query was denied. Previously retrieved catalog summaries remain available."
                : c.comparison
                  ? "The remote comparison is ready. See the specifications table."
                  : Object.values(c.evidence).some(
                        (e) =>
                          e.tool === "search_products" &&
                          !e.result.products.length,
                      )
                    ? "No catalog products match these requirements. Adjust them before querying again."
                    : "This turn ended. See the verified candidates and call states.",
        });
      else
        c.messages.push({
          id: `reply-${c.lastSeq}`,
          role: "assistant",
          text: c.denied
            ? "This specification query was denied. Earlier catalog summaries are preserved."
            : c.warnings.includes("mcp_connection_failed")
              ? "The catalog is unreachable. No new recommendation evidence was obtained in this turn."
              : "No verifiable recommendation was produced in this turn. Review existing candidates or explicitly request another query.",
        });
      c.assistantBlocks = [];
    });
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const ctl of this.controls.values()) ctl.abort();
    await Promise.allSettled(this.workers.values());
  }
}
