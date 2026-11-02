import { randomBytes } from "node:crypto";
import { AppError, isTransportFailure } from "../zoowork/errors";
import type { IndexStats, KnowledgeIndex, Passage, Retriever } from "./retriever";

// Every Cloudflare call in this app is in this file. It uses the AI Search
// REST API, so the app does not run on Cloudflare and needs no Workers binding.
// https://developers.cloudflare.com/ai-search/get-started/api/

const NAMESPACE = "default";
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 500;
/** How many passages one search hands to the Agent. */
export const MAX_PASSAGES = 6;

export type CloudflareConfig = { accountId: string; apiToken: string };

export function readCloudflareConfig(env: Record<string, string | undefined> = process.env): CloudflareConfig {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken || apiToken.startsWith("replace_with")) {
    throw new AppError("cloudflare_credentials_required", 500);
  }
  return { accountId, apiToken };
}

/** A name for a new AI Search instance. It is recorded before the create request is sent. */
export const newInstanceId = () => `knowledge-assistant-${randomBytes(4).toString("hex")}`;

type Chunk = {
  text?: unknown;
  score?: unknown;
  item?: { key?: unknown };
};

function titleOf(text: string, key: string): string {
  return /^#{1,3}\s+(.+)$/m.exec(text)?.[1]?.trim() ?? key;
}

/** Search results as passages. A chunk without text or a document key cannot be cited, so it is dropped. */
export function toPassages(body: unknown): Passage[] {
  const chunks = (body as { result?: { chunks?: Chunk[] } } | null)?.result?.chunks;
  if (!Array.isArray(chunks)) throw new AppError("cloudflare_invalid_response", 502);
  const passages: Passage[] = [];
  for (const chunk of chunks) {
    const key = chunk.item?.key;
    if (typeof chunk.text !== "string" || !chunk.text.trim() || typeof key !== "string" || !key) continue;
    passages.push({
      key,
      title: titleOf(chunk.text, key),
      text: chunk.text.trim(),
      score: typeof chunk.score === "number" ? chunk.score : 0,
    });
  }
  return passages.slice(0, MAX_PASSAGES);
}

const isRetryable = (error: unknown) =>
  isTransportFailure(error) || (error instanceof AppError && /^cloudflare_http_5\d\d$/.test(error.code));

/**
 * The knowledge service for one AI Search instance. Errors carry a status code
 * only, never the token or a response body.
 */
export function connectKnowledge(
  instanceId: string,
  config: CloudflareConfig = readCloudflareConfig(),
  fetchImpl: typeof fetch = fetch,
  retryDelayMs = RETRY_DELAY_MS,
): KnowledgeIndex & Retriever {
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai-search/namespaces/${NAMESPACE}/instances`;
  const instance = `${base}/${encodeURIComponent(instanceId)}`;

  async function call(url: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetchImpl(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${config.apiToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new AppError(`cloudflare_http_${response.status}`, 502);
    return response.json().catch(() => {
      throw new AppError("cloudflare_invalid_response", 502);
    });
  }

  const hasCode = (error: unknown, code: string) => error instanceof AppError && error.code === code;

  const itemsOf = (body: unknown) => (body as { result?: { id?: string }[] } | null)?.result ?? [];

  return {
    async ensure() {
      try {
        await call(instance);
        return;
      } catch (error) {
        if (!hasCode(error, "cloudflare_http_404")) throw error;
      }
      try {
        await call(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Hybrid search is the default. The similarity cache is for repeated
          // generated answers, and it would keep an early empty result.
          body: JSON.stringify({ id: instanceId, cache: false }),
        });
      } catch (error) {
        // A lost response from an earlier run: the recorded name already exists.
        if (!hasCode(error, "cloudflare_http_409")) throw error;
      }
    },

    async upload(key, text) {
      const form = new FormData();
      form.append("file", new File([text], key, { type: "text/markdown" }));
      await call(`${instance}/items`, { method: "POST", body: form });
    },

    async removeDocument(key) {
      const body = await call(`${instance}/items?key=${encodeURIComponent(key)}`);
      for (const item of itemsOf(body)) {
        if (item.id) await call(`${instance}/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      }
    },

    async stats(): Promise<IndexStats> {
      const body = (await call(`${instance}/stats`)) as { result?: Partial<IndexStats> } | null;
      const s = body?.result;
      if (!s) throw new AppError("cloudflare_invalid_response", 502);
      return { completed: s.completed ?? 0, queued: s.queued ?? 0, running: s.running ?? 0, error: s.error ?? 0 };
    },

    async destroy() {
      await call(instance, { method: "DELETE" });
    },

    async search(query) {
      const attempt = () =>
        call(`${instance}/search`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: query }] }),
        });
      let body: unknown;
      try {
        body = await attempt();
      } catch (error) {
        if (!isRetryable(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        body = await attempt();
      }
      return toPassages(body);
    },
  };
}
