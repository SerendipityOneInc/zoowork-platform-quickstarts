import { randomBytes } from "node:crypto";
import { AppError, isCode, isTransportFailure } from "../zoowork/errors";
import { RETRY_DELAY_MS, retryOnce } from "../zoowork/retry";
import type { IndexedDocument, KnowledgeIndex, Passage, Retriever } from "./retriever";

// Every Cloudflare call in this app is in this file. It uses the AI Search
// REST API, so the app does not run on Cloudflare and needs no Workers binding.
// https://developers.cloudflare.com/ai-search/get-started/api/

const NAMESPACE = "default";
const REQUEST_TIMEOUT_MS = 30_000;
const ITEMS_PER_PAGE = 50;
/** How many passages one search hands to the Agent. */
export const MAX_PASSAGES = 6;
// Vector scores rate every passage about the same product as similar, so reranking
// reads the question and each passage together and puts the best one first. It
// filters nothing: a correct document can rank first with a score below 0.01, and
// a passage that never reaches the Agent cannot be recovered, while an extra one
// can be ignored. The threshold is sent as 0 because omitting it applies the
// service's own minimum, which drops those documents too.
const RERANK_MODEL = "@cf/baai/bge-reranker-base";
const RERANK_KEEP_ALL = 0;

export type CloudflareConfig = { accountId: string; apiToken: string };

export function readCloudflareConfig(env: Record<string, string | undefined> = process.env): CloudflareConfig {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken || [accountId, apiToken].some((value) => value.startsWith("replace_with"))) {
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

/** A chunk from the middle of a document has no document title, so fall back to the file name. */
function titleOf(text: string, key: string): string {
  const heading = /^#\s+(.+)$/.exec(text.trimStart().split("\n", 1)[0]!)?.[1]?.trim();
  if (heading) return heading;
  const name = (key.split("/").pop() ?? key).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return name ? name[0]!.toUpperCase() + name.slice(1) : key;
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
  error instanceof AppError && /^cloudflare_(unreachable|timeout|http_5\d\d)$/.test(error.code);

type Item = { id?: string; key?: string; status?: string; error?: string | null };

// Anything else, such as `skipped`, is final without being searchable. Setup
// reports it by name instead of waiting for a change that will not come.
const PENDING_STATUSES = new Set(["queued", "running", "outdated"]);

function toDocument(item: Item): IndexedDocument | undefined {
  if (!item.key) return undefined;
  if (item.status === "completed") return { key: item.key, state: "ready" };
  if (PENDING_STATUSES.has(item.status ?? "")) return { key: item.key, state: "pending" };
  return { key: item.key, state: "failed", reason: item.error || item.status || "unknown" };
}

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
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${config.apiToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (!isTransportFailure(error)) throw error;
      throw new AppError((error as Error).name === "TimeoutError" ? "cloudflare_timeout" : "cloudflare_unreachable", 502);
    }
    if (!response.ok) throw new AppError(`cloudflare_http_${response.status}`, 502);
    return response.json().catch(() => {
      throw new AppError("cloudflare_invalid_response", 502);
    });
  }

  const itemsOf = (body: unknown) => (body as { result?: Item[] } | null)?.result ?? [];

  const retried = <T>(attempt: () => Promise<T>) => retryOnce(attempt, retryDelayMs, isRetryable);

  return {
    async exists() {
      try {
        await retried(() => call(instance));
        return true;
      } catch (error) {
        if (isCode(error, "cloudflare_http_404")) return false;
        throw error;
      }
    },

    async create() {
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
        if (!isCode(error, "cloudflare_http_409")) throw error;
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

    async documents() {
      const documents: IndexedDocument[] = [];
      for (let page = 1; ; page += 1) {
        const body = (await retried(() => call(`${instance}/items?page=${page}&per_page=${ITEMS_PER_PAGE}`))) as {
          result?: Item[];
          result_info?: { total_count?: number };
        } | null;
        if (!Array.isArray(body?.result)) throw new AppError("cloudflare_invalid_response", 502);
        documents.push(...body.result.flatMap((item) => toDocument(item) ?? []));
        if (body.result.length < ITEMS_PER_PAGE) return documents;
      }
    },

    async destroy() {
      try {
        await call(instance, { method: "DELETE" });
        return true;
      } catch (error) {
        if (isCode(error, "cloudflare_http_404")) return false;
        throw error;
      }
    },

    async search(query) {
      const body = await retried(() =>
        call(`${instance}/search`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: query }],
            ai_search_options: {
              reranking: { enabled: true, model: RERANK_MODEL, match_threshold: RERANK_KEEP_ALL },
            },
          }),
        }),
      );
      return toPassages(body);
    },
  };
}
