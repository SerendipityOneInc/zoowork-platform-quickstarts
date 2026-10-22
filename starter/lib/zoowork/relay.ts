import { ZooworkError, type SessionEvent } from "@zoowork-ai/sdk";
import type { RelayEnvelope, WireEvent } from "@/lib/chat/wire";
import { errorCode } from "./errors";
import type { ChatClient } from "./runtime";

const encoder = new TextEncoder();
const HEARTBEAT_MS = 15_000;
/** Browser reconnect delay after the server closes an idle stream. */
const RETRY_MS = 1_500;
const CURSOR = /^[A-Za-z0-9:._-]{1,200}$/;

export function toWire(event: SessionEvent): WireEvent {
  return {
    seq: event.seq,
    eventType: event.eventType,
    payload: event.payload,
    ...(event.runId ? { runId: event.runId } : {}),
    ...(event.createdAt ? { createdAt: event.createdAt } : {}),
    ...(event.processedAt !== undefined ? { processedAt: event.processedAt } : {}),
  };
}

/** Pick the resume cursor: the browser's Last-Event-ID on reconnect, or `?cursor=` on a fresh reopen. */
export function resumeCursor(request: Request): string | undefined {
  const value = request.headers.get("last-event-id") || new URL(request.url).searchParams.get("cursor") || undefined;
  return value && CURSOR.test(value) ? value : undefined;
}

/**
 * Relay one Session's durable event stream to the browser as SSE.
 *
 * Without a cursor the Platform replays the Session from its first event and
 * then continues live, so this one stream is both the history load and the
 * live tail. Each frame's `id:` is the Platform cursor. When the Platform
 * closes an idle stream, this response ends too; the browser's EventSource
 * reconnects with `Last-Event-ID` and resumes after the last event.
 *
 * Closing the browser ends the relay, not the run: the Agent keeps working
 * and its output is in the log when the page comes back.
 */
export function relayStream(
  client: Pick<ChatClient, "streamEvents">,
  agentId: string,
  sessionId: string,
  cursor: string | undefined,
  requestSignal: AbortSignal,
): ReadableStream<Uint8Array> {
  const upstream = new AbortController();
  const stop = () => upstream.abort();
  requestSignal.addEventListener("abort", stop, { once: true });
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (envelope: RelayEnvelope, id?: string) =>
        write(`${id ? `id: ${id}\n` : ""}data: ${JSON.stringify(envelope)}\n\n`);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        requestSignal.removeEventListener("abort", stop);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      write(`retry: ${RETRY_MS}\n: connected\n\n`);
      heartbeat = setInterval(() => write(": heartbeat\n\n"), HEARTBEAT_MS);

      void (async () => {
        try {
          for await (const event of client.streamEvents(agentId, sessionId, {
            ...(cursor ? { cursor } : {}),
            signal: upstream.signal,
          })) {
            send({ kind: "event", event: toWire(event) }, event.cursor);
          }
        } catch (error) {
          if (!upstream.signal.aborted) {
            // A 4xx (unknown or archived Session, revoked key) will not fix itself.
            const fatal = error instanceof ZooworkError && error.status >= 400 && error.status < 500 && error.status !== 429;
            send({ kind: "relay_error", code: errorCode(error), fatal });
          }
        } finally {
          close();
        }
      })();
    },
    cancel() {
      clearInterval(heartbeat);
      upstream.abort();
    },
  });
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
