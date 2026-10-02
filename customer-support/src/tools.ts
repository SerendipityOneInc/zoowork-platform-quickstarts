import type { CustomToolCallRecord } from "@zoowork-ai/sdk";
import { AppError, categories, Store, type ToolJob } from "./store.js";

function validate(name: string, input: Record<string, unknown>) {
  const expected =
    name === "create_support_ticket"
      ? ["order_id", "category", "reason"]
      : ["order_id"];
  if (
    !["lookup_order", "lookup_shipment", "create_support_ticket"].includes(name)
  )
    throw new AppError("tool_unavailable");
  if (
    Object.keys(input).some((key) => !expected.includes(key)) ||
    typeof input.order_id !== "string" ||
    !/^ORD-\d{4}$/.test(input.order_id)
  )
    throw new AppError("invalid_tool_input");
  if (
    name === "create_support_ticket" &&
    (!categories.includes(input.category as (typeof categories)[number]) ||
      typeof input.reason !== "string" ||
      input.reason.trim().length < 5 ||
      input.reason.length > 500)
  )
    throw new AppError("invalid_tool_input");
}
export class Tools {
  constructor(
    readonly store: Store,
    readonly now: () => number = Date.now,
  ) {}
  receive(conversationId: string, call: CustomToolCallRecord): ToolJob {
    const conversation = this.store.conversation(conversationId);
    if (call.session_id !== conversation.sessionId)
      throw new AppError("tool_session_mismatch", 403);
    const existing = this.store.job(conversationId, call.call_id);
    if (existing) {
      const canonical = (input: Record<string, unknown>) =>
        JSON.stringify(
          Object.keys(input)
            .sort()
            .map((key) => [key, input[key]]),
        );
      if (
        existing.name !== call.name ||
        canonical(existing.input) !== canonical(call.input)
      )
        throw new AppError("tool_replay_mismatch", 409);
      return existing;
    }
    return this.store.transaction(() => {
      const job: ToolJob = {
        conversationId,
        callId: call.call_id,
        name: call.name,
        input: call.input,
        requestedAt: call.requested_at,
        expiresAt:
          call.timeout_at ?? new Date(this.now() + 600_000).toISOString(),
        status: "result",
      };
      try {
        if (call.status !== "pending")
          throw new AppError("tool_already_terminal");
        if (this.expired(job)) throw new AppError("confirmation_timeout");
        validate(job.name, job.input);
        const order = this.store.order(
          String(job.input.order_id),
          conversation.customerId,
        );
        conversation.selectedOrder = order.id;
        if (job.name === "lookup_order") job.result = { ok: true, order };
        else if (job.name === "lookup_shipment")
          job.result = {
            ok: true,
            shipment: this.store.shipment(order.id, conversation.customerId),
          };
        else {
          job.status = "waiting_confirmation";
          conversation.status = "waiting_confirmation";
        }
      } catch (error) {
        job.result = {
          ok: false,
          code: error instanceof AppError ? error.code : "handler_failed",
        };
        job.isError = true;
      }
      this.store.saveJob(job);
      this.store.saveConversation(conversation);
      return job;
    });
  }
  expired(job: ToolJob) {
    return (
      !Number.isFinite(Date.parse(job.expiresAt)) ||
      Date.parse(job.expiresAt) <= this.now()
    );
  }
  decide(
    conversationId: string,
    callId: string,
    owner: string,
    decision: "confirm" | "cancel" | "timeout",
  ): ToolJob {
    this.store.conversation(conversationId, owner);
    return this.store.transaction(() => {
      const job = this.store.job(conversationId, callId);
      if (!job) throw new AppError("tool_not_found", 404);
      if (job.status !== "waiting_confirmation") return job;
      if (this.expired(job)) decision = "timeout";
      if (decision === "confirm") {
        // Revalidate ownership at commit time. The ticket and durable tool result are atomic.
        const conversation = this.store.conversation(conversationId);
        validate(job.name, job.input);
        this.store.order(String(job.input.order_id), conversation.customerId);
        const ticket = this.store.addTicket(job);
        job.result = { ok: true, ticket };
        job.isError = false;
      } else {
        job.result = {
          ok: false,
          code:
            decision === "cancel"
              ? "confirmation_cancelled"
              : "confirmation_timeout",
          ticketCreated: false,
        };
        job.isError = true;
      }
      job.status = "result";
      job.decision = decision;
      this.store.saveJob(job);
      const conversation = this.store.conversation(conversationId);
      conversation.status = this.store
        .jobs(conversationId)
        .some((value) => value.status === "waiting_confirmation")
        ? "waiting_confirmation"
        : "running";
      this.store.saveConversation(conversation);
      return job;
    });
  }
  expire(conversationId: string) {
    const conversation = this.store.conversation(conversationId);
    for (const job of this.store.jobs(conversationId))
      if (job.status === "waiting_confirmation" && this.expired(job))
        this.decide(conversationId, job.callId, conversation.owner, "timeout");
  }
}
