// Test-only Platform lifecycle. Catalog facts still come from a real HTTP MCP server.
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  ApprovalRecord,
  OutboundEvent,
  SessionEvent,
  ZooworkClient,
} from "@zoowork-ai/sdk";
import {
  evidenceSchema,
  type Evidence,
  type CatalogTool,
} from "../src/domain/catalog.js";

type Session = {
  events: SessionEvent[];
  keys: Set<string>;
  turn: number;
  running: boolean;
  notify?: () => void;
  approval?: {
    id: string;
    tool: CatalogTool;
    args: Record<string, unknown>;
    callId: string;
    resolve: (decision: string) => void;
  };
};
export class FakePlatform {
  sessions = new Map<string, Session>();
  pending = new Map<string, ApprovalRecord>();
  calls = { create: 0, post: 0, resolve: 0 };
  failConnection = false;
  ambiguousCreate = false;
  ambiguousPost = false;
  holdDecisions = false;
  decisions = new Map<string, () => void>();
  client: Pick<
    ZooworkClient,
    | "createSession"
    | "postEvents"
    | "streamEvents"
    | "listAllEvents"
    | "getSession"
    | "listApprovals"
    | "resolveApproval"
  >;
  constructor(readonly mcpUrl: string) {
    this.client = {
      createSession: async (_agent, body, key) => {
        this.calls.create++;
        const previous = [...this.sessions].find(([, s]) =>
          s.keys.has(key ?? ""),
        );
        if (previous) return { session_id: previous[0] };
        const id = randomUUID();
        const s: Session = {
          events: [],
          keys: new Set([key ?? ""]),
          turn: 0,
          running: false,
        };
        this.sessions.set(id, s);
        void this.run(id, (body?.initial_events?.[0]?.content as string) ?? "");
        if (this.ambiguousCreate) {
          this.ambiguousCreate = false;
          throw new Error("lost_receipt");
        }
        return { session_id: id };
      },
      postEvents: async (_agent, id, events) => {
        this.calls.post++;
        const s = this.sessions.get(id)!;
        for (const event of events) {
          if (event.type === "user.interrupt") {
            s.approval?.resolve("deny");
            this.emit(id, "run.finished", { status: "aborted" });
            s.running = false;
            continue;
          }
          const key =
            typeof event.idempotency_key === "string"
              ? event.idempotency_key
              : randomUUID();
          if (s.keys.has(key)) continue;
          s.keys.add(key);
          void this.run(id, (event.content as string) ?? "");
        }
        if (this.ambiguousPost) {
          this.ambiguousPost = false;
          throw new Error("lost_receipt");
        }
        return { events: events.map(() => ({ accepted: true })) };
      },
      streamEvents: (_agent, id, options) =>
        this.stream(id, options?.cursor, options?.signal),
      listAllEvents: async (_agent, id) => this.sessions.get(id)!.events,
      getSession: async (_agent, id) => ({ session_id: id }),
      listApprovals: async () => [...this.pending.values()],
      resolveApproval: async (_agent, id, body) => {
        this.calls.resolve++;
        const a = this.pending.get(id);
        if (!a) throw new Error("not_pending");
        const s = this.sessions.get(a.session_id!)!;
        const deliver = () => s.approval?.resolve(body.decision);
        if (this.holdDecisions) this.decisions.set(id, deliver);
        else setTimeout(deliver, 30);
        return { ...a, signaled: true, decision: body.decision };
      },
    } as typeof this.client;
  }
  emit(id: string, eventType: string, payload: Record<string, unknown>): void {
    const s = this.sessions.get(id)!;
    const seq = s.events.length;
    s.events.push({
      seq,
      eventType,
      payload,
      runId: `run-${s.turn}`,
      turn: s.turn,
      cursor: `fake:${seq}`,
      createdAt: new Date().toISOString(),
    });
    s.notify?.();
    s.notify = undefined;
  }
  private async *stream(
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<SessionEvent> {
    const s = this.sessions.get(id)!;
    let seq = cursor ? Number(cursor.split(":")[1]) + 1 : 0;
    while (!signal?.aborted) {
      while (seq < s.events.length) {
        const e = s.events[seq++]!;
        yield e;
        if (e.eventType === "run.finished" || signal?.aborted) return;
      }
      await new Promise<void>((resolve) => {
        s.notify = resolve;
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    }
  }
  private async tool(
    id: string,
    tool: CatalogTool,
    args: Record<string, unknown>,
    approved = false,
  ): Promise<Evidence | undefined> {
    const s = this.sessions.get(id)!;
    const callId = randomUUID();
    const toolName = `mcp__catalog__${tool}`;
    this.emit(id, "agent.tool", {
      phase: "start",
      toolName,
      toolCallId: callId,
      args,
    });
    if (approved) {
      const approvalId = randomUUID();
      this.emit(id, "agent.tool", {
        phase: "blocked",
        toolName,
        toolCallId: callId,
        executionStarted: false,
      });
      const promise = new Promise<string>((resolve) => {
        s.approval = { id: approvalId, tool, args, callId, resolve };
      });
      this.pending.set(approvalId, {
        approval_id: approvalId,
        session_id: id,
        tool_name: toolName,
        status: "pending",
        arguments_preview: JSON.stringify(args),
        allowed_decisions: ["allow-once", "deny"],
      });
      this.emit(id, "agent.approval", {
        phase: "requested",
        approvalId,
        toolName,
      });
      const decision = await promise;
      this.pending.delete(approvalId);
      s.approval = undefined;
      this.emit(id, "agent.approval", {
        phase: "resolved",
        approvalId,
        resolution: decision,
      });
      if (decision === "deny") {
        this.emit(id, "agent.tool", {
          phase: "end",
          toolName,
          toolCallId: callId,
          isError: true,
          executionStarted: false,
        });
        return undefined;
      }
    }
    if (this.failConnection) throw new Error("mcp_connection_failed");
    const mcp = new Client({ name: "offline-test-client", version: "1.0.0" });
    try {
      await mcp.connect(
        new StreamableHTTPClientTransport(new URL(this.mcpUrl)),
      );
      const result = await mcp.callTool({
        name: tool,
        arguments: args,
        _meta: {
          "ai.zooclaw/context": {
            agentId: "test-agent",
            sessionId: id,
            runId: `run-${s.turn}`,
            turn: s.turn,
          },
        },
      });
      if (result.isError) throw new Error("catalog_tool_failed");
      const evidence = evidenceSchema.parse(result.structuredContent);
      this.emit(id, "agent.tool", {
        phase: "end",
        toolName,
        toolCallId: callId,
        isError: false,
        executionStarted: true,
        resultPreview:
          `structuredContent:\n${JSON.stringify(evidence, null, 2)}`.slice(
            0,
            512,
          ),
      });
      return evidence;
    } finally {
      await mcp.close();
    }
  }
  private async run(id: string, content: string): Promise<void> {
    const s = this.sessions.get(id)!;
    s.turn++;
    s.running = true;
    this.emit(id, "run.started", {});
    try {
      const r = JSON.parse(
        /Confirmed application requirements[^:]*: ([^\n]+)/.exec(
          content,
        )?.[1] ?? "{}",
      ) as Record<string, unknown>;
      let reply: unknown;
      if (!r.category || !r.maxPriceMinor)
        reply = {
          type: "clarification",
          question: "Which product category and budget limit do you want?",
        };
      else if (
        content.includes("compare_products") ||
        content.includes("get_products")
      ) {
        const tool = content.includes("compare_products")
          ? "compare_products"
          : "get_products";
        const ids = [...new Set(content.match(/(?:lap|mon|aud)-\d{2}/g) ?? [])];
        const evidence = await this.tool(
          id,
          tool,
          { productIds: ids, catalogVersion: "demo-2026-10-02-en" },
          true,
        );
        reply =
          evidence && tool === "get_products"
            ? {
                type: "recommendation",
                items: evidence.result.products.map((p) => ({
                  productId: p.productId,
                  receiptId: evidence.receiptId,
                  reasonCodes: ["budget", "ram", "weight", "battery"],
                })),
              }
            : {
                type: "message",
                message: evidence ? "Comparison complete" : "Denied",
              };
      } else {
        const evidence = (await this.tool(id, "search_products", {
          category: r.category,
          maxPriceMinor: r.maxPriceMinor,
          filters: r.filters ?? {},
          limit: 6,
        }))!;
        reply = evidence.result.products.length
          ? {
              type: "recommendation",
              items: evidence.result.products.slice(0, 3).map((p) => ({
                productId: p.productId,
                receiptId: evidence.receiptId,
                reasonCodes: ["budget", "ram", "weight", "battery"],
              })),
            }
          : { type: "message", message: "No matching products" };
      }
      this.emit(id, "agent.assistant", {
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text:
                "```product-advisor-result\n" + JSON.stringify(reply) + "\n```",
            },
          ],
        },
      });
      this.emit(id, "run.finished", { status: "succeeded" });
    } catch {
      this.emit(id, "agent.error", {
        kind: this.failConnection ? "mcp_connection_failed" : "test_failure",
      });
      this.emit(id, "run.finished", { status: "failed" });
    } finally {
      s.running = false;
    }
  }
}
