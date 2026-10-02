import {
  assistantText,
  customToolUse,
  runOutcome,
  type SessionEvent,
  type ZooworkClient,
} from "@zoowork-ai/sdk";
import { safeError } from "./platform.js";
import { AppError, Store, type Conversation, type Turn } from "./store.js";
import { Tools } from "./tools.js";

/** One consumer per conversation. SQLite journals business effects before acknowledging events. */
export class SupportService {
  readonly tools: Tools;
  private queues = new Map<string, Promise<unknown>>();
  private workers = new Map<string, AbortController>();
  private tasks = new Set<Promise<unknown>>();
  private stopped = false;
  constructor(
    readonly store: Store,
    readonly client: ZooworkClient,
    readonly agentId: string,
  ) {
    this.tools = new Tools(store);
  }
  private async serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    this.queues.set(id, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(id) === next) this.queues.delete(id);
    }
  }
  private fail(id: string, error: unknown) {
    const conversation = this.store.conversation(id);
    conversation.error =
      error instanceof AppError ? error.code : safeError(error);
    conversation.status = "error";
    this.store.saveConversation(conversation);
  }
  async create(owner: string, id?: string) {
    if (id && !/^[0-9a-f-]{36}$/.test(id))
      throw new AppError("invalid_conversation_id");
    if (id) {
      const existing = this.store
        .conversations(owner)
        .find((value) => value.id === id);
      if (existing) {
        if (!existing.sessionId) await this.createSession(id);
        return this.store.snapshot(id, owner);
      }
    }
    if (this.store.conversations(owner).length >= 20)
      throw new AppError("conversation_limit_reached", 409);
    const conversation = this.store.newConversation(owner, id);
    await this.createSession(conversation.id);
    return this.store.snapshot(conversation.id, owner);
  }
  private async createSession(id: string) {
    await this.serial(id, async () => {
      const conversation = this.store.conversation(id);
      if (conversation.sessionId) return;
      try {
        // Exact body is recorded before this request. Reuse the same key after uncertainty.
        const session = await this.client.createSession(
          this.agentId,
          conversation.request,
          `customer-support:session:${id}`,
        );
        if (!session.session_id)
          throw new AppError("invalid_session_receipt", 502);
        conversation.sessionId = session.session_id;
        conversation.status = "ready";
        delete conversation.error;
        this.store.saveConversation(conversation);
      } catch (error) {
        this.fail(id, error);
        throw error;
      }
    });
  }
  async send(id: string, owner: string, input: { id: string; text: string }) {
    if (
      !/^[0-9a-f-]{36}$/.test(input.id) ||
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > 4000
    )
      throw new AppError("invalid_message");
    await this.serial(id, async () => {
      const conversation = this.store.conversation(id, owner);
      const prior = this.store.turn(input.id);
      if (prior) {
        if (prior.conversationId !== id || prior.text !== input.text.trim())
          throw new AppError("message_replay_mismatch", 409);
        return; // Replay of an HTTP request never initiates another model turn.
      }
      if (!conversation.sessionId) throw new AppError("session_not_ready", 409);
      if (conversation.status !== "ready")
        throw new AppError("conversation_busy", 409);
      const turn: Turn = {
        id: input.id,
        conversationId: id,
        text: input.text.trim(),
        status: "posting",
        at: new Date().toISOString(),
      };
      this.store.transaction(() => {
        this.store.saveTurn(turn);
        this.store.message(id, turn.id, "user", turn.text, turn.at);
        conversation.status = "running";
        delete conversation.error;
        delete conversation.runId;
        this.store.saveConversation(conversation);
      });
      await this.post(conversation, turn);
    });
    this.watch(id);
    return this.store.snapshot(id, owner);
  }
  private async post(conversation: Conversation, turn: Turn) {
    try {
      const receipt = await this.client.postEvents(
        this.agentId,
        conversation.sessionId!,
        [
          {
            type: "user.message",
            content: turn.text,
            idempotency_key: `customer-support:message:${turn.id}`,
          },
        ],
      );
      if (
        !receipt.events.length ||
        receipt.events.some((event) => event.accepted === false)
      )
        throw new AppError("message_not_accepted", 502);
      turn.status = "posted";
      this.store.saveTurn(turn);
    } catch (error) {
      turn.status = "uncertain";
      this.store.saveTurn(turn);
      this.fail(conversation.id, error);
      // Do not automatically repeat a potentially paid input. The UI offers explicit recovery.
    }
  }
  async recover(id: string, owner: string, retryInput = false) {
    const conversation = this.store.conversation(id, owner);
    if (!conversation.sessionId) {
      if (retryInput) await this.createSession(id);
      return this.store.snapshot(id, owner);
    }
    await this.serial(id, async () => {
      try {
        await this.sync(id);
        const current = this.store.conversation(id);
        const uncertain = this.store
          .turns(id)
          .find(
            (turn) => turn.status === "posting" || turn.status === "uncertain",
          );
        if (uncertain && retryInput) {
          current.status = "running";
          delete current.error;
          this.store.saveConversation(current);
          await this.post(current, uncertain);
        } else if (!uncertain && current.status === "error") {
          current.status = this.store
            .jobs(id)
            .some((job) => job.status === "waiting_confirmation")
            ? "waiting_confirmation"
            : this.store.turns(id).some((turn) => turn.status !== "done")
              ? "running"
              : "ready";
          delete current.error;
          this.store.saveConversation(current);
        }
      } catch (error) {
        this.fail(id, error);
      }
    });
    this.watch(id);
    return this.store.snapshot(id, owner);
  }
  async decide(
    id: string,
    owner: string,
    callId: string,
    decision: "confirm" | "cancel",
  ) {
    this.store.conversation(id, owner);
    await this.serial(id, async () => {
      // Read the deployment's current pending calls before a business write. A stale UI cannot confirm a terminal call.
      await this.sync(id);
      const job = this.store.job(id, callId);
      if (!job) throw new AppError("tool_not_found", 404);
      if (job.status === "waiting_confirmation")
        this.tools.decide(id, callId, owner, decision);
      await this.deliver(id);
    });
    this.watch(id);
    return this.store.snapshot(id, owner);
  }
  private async deliver(id: string) {
    for (const job of this.store.jobs(id)) {
      if (job.status !== "result" || !job.result) continue;
      const receipt = await this.client.resolveCustomToolCall(
        this.agentId,
        job.callId,
        {
          content: [{ type: "json", value: job.result }],
          isError: job.isError ?? false,
          resolvedBy: "customer-support-app",
        },
      );
      job.status = receipt.signaled === false ? "terminal" : "delivered";
      this.store.saveJob(job);
    }
  }
  async processEvent(id: string, event: SessionEvent) {
    let conversation = this.store.conversation(id);
    if (event.seq <= conversation.seq) return;
    const call = customToolUse(event);
    if (call?.callId && call.phase === "requested") {
      this.tools.receive(id, {
        call_id: call.callId,
        session_id: conversation.sessionId!,
        tool_call_id: call.toolCallId ?? call.callId,
        name: call.name ?? "",
        input: call.input ?? {},
        status: "pending",
        requested_at: event.createdAt ?? new Date().toISOString(),
        timeout_at: call.timeoutAt,
      });
    }
    // Messages and cursor move atomically; business effects above are already journaled.
    this.store.transaction(() => {
      conversation = this.store.conversation(id);
      const text = assistantText(event);
      if (text.trim())
        this.store.message(
          id,
          `event:${event.seq}`,
          "assistant",
          text,
          event.createdAt ?? new Date().toISOString(),
        );
      if (call?.phase === "resolved") {
        const job = this.store.job(id, call.callId);
        if (job) {
          if (!job.result) {
            job.result = {
              ok: false,
              code: `tool_${call.outcome ?? "terminal"}`,
              ticketCreated: false,
            };
            job.isError = true;
          }
          job.status = "terminal";
          this.store.saveJob(job);
        }
      }
      const active = this.store
        .turns(id)
        .find((turn) => turn.status !== "done");
      if (event.eventType === "run.started" && active) {
        active.runId = event.runId;
        active.status = "posted";
        this.store.saveTurn(active);
        conversation.runId = event.runId;
        conversation.status = "running";
        delete conversation.error;
      }
      const outcome = runOutcome(event);
      if (
        outcome &&
        (!active?.runId || !event.runId || active.runId === event.runId)
      ) {
        if (active) {
          active.status = "done";
          this.store.saveTurn(active);
        }
        conversation.status = outcome === "succeeded" ? "ready" : "error";
        if (outcome !== "succeeded") conversation.error = `turn_${outcome}`;
        else delete conversation.error;
      }
      if (
        this.store.jobs(id).some((job) => job.status === "waiting_confirmation")
      )
        conversation.status = "waiting_confirmation";
      conversation.seq = event.seq;
      if (event.cursor) conversation.cursor = event.cursor;
      this.store.saveConversation(conversation);
    });
    // Failure here leaves a saved result for retry, so replay never repeats a database mutation.
    await this.deliver(id);
  }
  private async sync(id: string) {
    const conversation = this.store.conversation(id);
    if (!conversation.sessionId) return;
    // First replay history. A resolved event must be seen before interpreting a missing pending call.
    let cursor = conversation.cursor;
    for (let pages = 0; pages < 100; pages++) {
      const page = await this.client.listEventsPage(
        this.agentId,
        conversation.sessionId,
        { cursor, limit: 500 },
      );
      for (const event of page.events) await this.processEvent(id, event);
      if (page.nextCursor) {
        const current = this.store.conversation(id);
        current.cursor = page.nextCursor;
        this.store.saveConversation(current);
      }
      if (!page.hasMore) break;
      if (!page.nextCursor || page.nextCursor === cursor || pages === 99)
        throw new AppError("history_cursor_not_advancing", 502);
      cursor = page.nextCursor;
    }
    const pending = (
      await this.client.listCustomToolCalls(this.agentId, { status: "pending" })
    ).filter((call) => call.session_id === conversation.sessionId);
    for (const call of pending) this.tools.receive(id, call);
    for (const job of this.store.jobs(id)) {
      if (
        job.status === "waiting_confirmation" &&
        !pending.some((call) => call.call_id === job.callId)
      ) {
        job.status = "terminal";
        job.result = {
          ok: false,
          code: "tool_no_longer_pending",
          ticketCreated: false,
        };
        job.isError = true;
        this.store.saveJob(job);
      }
    }
    this.tools.expire(id);
    await this.deliver(id);
    const current = this.store.conversation(id);
    if (
      current.status === "waiting_confirmation" &&
      !this.store.jobs(id).some((job) => job.status === "waiting_confirmation")
    ) {
      current.status = this.store
        .turns(id)
        .some((turn) => turn.status !== "done")
        ? "running"
        : "ready";
      this.store.saveConversation(current);
    }
  }
  watch(id: string) {
    if (this.stopped || this.workers.has(id)) return;
    const conversation = this.store.conversation(id);
    if (
      !conversation.sessionId ||
      !this.store.turns(id).some((turn) => turn.status !== "done")
    )
      return;
    const controller = new AbortController();
    this.workers.set(id, controller);
    const task = (async () => {
      try {
        await this.serial(id, () => this.sync(id));
        const current = this.store.conversation(id);
        if (!this.store.turns(id).some((turn) => turn.status !== "done"))
          return;
        for await (const event of this.client.streamEvents(
          this.agentId,
          current.sessionId!,
          { cursor: current.cursor, signal: controller.signal },
        )) {
          await this.serial(id, () => this.processEvent(id, event));
          if (
            runOutcome(event) &&
            !this.store.turns(id).some((turn) => turn.status !== "done")
          )
            break;
        }
      } catch (error) {
        // A bounded SSE read can expire while a human reviews a ticket. Reconnect reads on the next tick.
        if (
          !controller.signal.aborted &&
          safeError(error) !== "timeout_or_cancelled"
        )
          this.fail(id, error);
      } finally {
        this.workers.delete(id);
      }
    })();
    this.tasks.add(task);
    void task.finally(() => this.tasks.delete(task));
  }
  async resume() {
    // Restart recovery is read/resolve only; no new Agent, Session or model input is created.
    for (const conversation of this.store.conversations()) {
      if (this.stopped) break;
      if (!conversation.sessionId) continue;
      await this.recover(conversation.id, conversation.owner);
    }
  }
  async tick() {
    for (const conversation of this.store.conversations()) {
      if (this.stopped) break;
      try {
        await this.serial(conversation.id, async () => {
          this.tools.expire(conversation.id);
          await this.deliver(conversation.id);
        });
      } catch (error) {
        this.fail(conversation.id, error);
      }
      // Retry stream reads on idle; errors require the explicit UI recovery control.
      if (["running", "waiting_confirmation"].includes(conversation.status))
        this.watch(conversation.id);
    }
  }
  async stop() {
    this.stopped = true;
    for (const worker of this.workers.values()) worker.abort();
    await Promise.allSettled([...this.tasks]);
    await Promise.allSettled([...this.queues.values()]);
  }
}
