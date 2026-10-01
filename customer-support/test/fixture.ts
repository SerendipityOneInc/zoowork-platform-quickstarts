import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type {
  CustomToolCallRecord,
  SessionEvent,
  ZooworkClient,
  OutboundEvent,
} from "@zoowork-ai/sdk";

/** Offline transport fixture. It exercises the real app handlers, never calls a model. */
export function fixtureClient() {
  const histories = new Map<string, SessionEvent[]>();
  const pending = new Map<string, CustomToolCallRecord>();
  const sessionKeys = new Map<string, string>();
  const inputKeys = new Set<string>();
  const results = new Map<string, Record<string, unknown>[]>();
  let posts = 0,
    resolves = 0,
    failResolve = false,
    failPost = false;
  const emit = (
    id: string,
    type: string,
    payload: Record<string, unknown>,
    runId = "run-fixture",
  ) => {
    const history = histories.get(id)!;
    history.push({
      seq: history.length + 1,
      eventType: type,
      payload,
      runId,
      createdAt: new Date().toISOString(),
      cursor: `fixture:${history.length + 1}`,
    });
  };
  const request = (
    sessionId: string,
    name: string,
    input: Record<string, unknown>,
  ) => {
    const callId = randomUUID();
    const call: CustomToolCallRecord = {
      call_id: callId,
      session_id: sessionId,
      tool_call_id: callId,
      name,
      input,
      status: "pending",
      requested_at: new Date().toISOString(),
      timeout_at: new Date(Date.now() + 600_000).toISOString(),
    };
    pending.set(callId, call);
    emit(sessionId, "agent.custom_tool_use", {
      phase: "requested",
      callId,
      name,
      input,
      timeoutAt: call.timeout_at,
    });
    return call;
  };
  const client = {
    createSession: async (_agent: string, _input: unknown, key: string) => {
      let id = sessionKeys.get(key);
      if (!id) {
        id = "session-" + randomUUID();
        sessionKeys.set(key, id);
        histories.set(id, []);
      }
      return { session_id: id };
    },
    postEvents: async (_agent: string, id: string, events: OutboundEvent[]) => {
      for (const event of events) {
        const key = String(event.idempotency_key);
        if (inputKeys.has(key)) continue;
        inputKeys.add(key);
        posts++;
        results.set(id, []);
        emit(id, "user.message", {
          content: event.content,
          idempotency_key: key,
        });
        emit(id, "run.started", {});
        const text = String(event.content),
          orderId = /ORD-\d{4}/.exec(text)?.[0] ?? "ORD-1001";
        if (/ticket|refund|return|damage/i.test(text))
          request(id, "create_support_ticket", {
            order_id: orderId,
            category: /refund/i.test(text)
              ? "refund"
              : /return/i.test(text)
                ? "return"
                : /damage/i.test(text)
                  ? "damage"
                  : "delivery",
            reason: /<script>/.test(text)
              ? '<script>alert("fixture")</script> Please investigate the delayed shipment.'
              : "Please investigate the delayed shipment and provide a delivery update.",
          });
        else {
          request(id, "lookup_order", { order_id: orderId });
          request(id, "lookup_shipment", { order_id: orderId });
        }
      }
      if (failPost)
        throw new Error("synthetic network failure after acceptance");
      return { events: [{ accepted: true }] };
    },
    listEventsPage: async (
      _agent: string,
      id: string,
      options: { cursor?: string } = {},
    ) => {
      const history = histories.get(id)!,
        seq = Number(options.cursor?.split(":")[1] ?? 0);
      return {
        events: history.filter((event) => event.seq > seq),
        hasMore: false,
        nextCursor: history.length ? `fixture:${history.length}` : undefined,
      };
    },
    listCustomToolCalls: async () =>
      [...pending.values()].map((call) => ({ ...call })),
    resolveCustomToolCall: async (
      _agent: string,
      callId: string,
      input: { content: { type: string; value?: unknown }[]; isError: boolean },
    ) => {
      resolves++;
      if (failResolve) throw new Error("synthetic result delivery failure");
      const call = pending.get(callId);
      if (!call)
        return { call_id: callId, signaled: false, status: "completed" };
      pending.delete(callId);
      const result = input.content[0].value as Record<string, unknown>;
      const values = results.get(call.session_id) ?? [];
      values.push(result);
      results.set(call.session_id, values);
      emit(call.session_id, "agent.custom_tool_use", {
        phase: "resolved",
        callId,
        outcome: "completed",
        isError: input.isError,
      });
      if (
        ![...pending.values()].some(
          (value) => value.session_id === call.session_id,
        )
      ) {
        const ticket = values.find((value) => value.ticket)?.ticket as
          | { id: string }
          | undefined;
        const shipment = values.find((value) => value.shipment)?.shipment as
          | { status: string; estimatedDelivery: string }
          | undefined;
        const text = ticket
          ? `Your ticket ${ticket.id} is open. It records your request; it does not approve a refund.`
          : values.some((value) => value.code)
            ? `The request was not completed: ${values.find((value) => value.code)!.code}. No ticket was created.`
            : `Your shipment is ${shipment?.status}. Estimated delivery: ${shipment?.estimatedDelivery}. These are synthetic shop records.`;
        emit(call.session_id, "agent.assistant", {
          message: { role: "assistant", content: [{ type: "text", text }] },
        });
        emit(call.session_id, "run.finished", { status: "succeeded" });
      }
      return { ...call, signaled: true };
    },
    streamEvents: async function* (
      _agent: string,
      id: string,
      options: { cursor?: string; signal?: AbortSignal } = {},
    ) {
      let seq = Number(options.cursor?.split(":")[1] ?? 0);
      while (!options.signal?.aborted) {
        for (const event of histories
          .get(id)!
          .filter((event) => event.seq > seq)) {
          seq = event.seq;
          yield event;
        }
        await setTimeout(20, undefined, { signal: options.signal });
      }
    },
  } as unknown as ZooworkClient;
  return {
    client,
    histories,
    pending,
    request,
    emit,
    get posts() {
      return posts;
    },
    get resolves() {
      return resolves;
    },
    get sessionCount() {
      return sessionKeys.size;
    },
    set failResolve(value: boolean) {
      failResolve = value;
    },
    set failPost(value: boolean) {
      failPost = value;
    },
  };
}
