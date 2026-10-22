import { createZooworkClient, type ZooworkClient } from "@zoowork-ai/sdk";
import type { PlatformConfig } from "./config";
import { StarterError } from "./errors";

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The ZooWork client used by setup and by the server routes. Its fetch only
 * reaches the configured `/service/v1` prefix and refuses redirects, so the
 * key cannot leave for another origin. Ordinary requests time out after 30
 * seconds; event streams are long-lived and end only through their signal.
 */
export function createPlatformClient(config: PlatformConfig): ZooworkClient {
  const expected = new URL(config.baseUrl);
  return createZooworkClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      if (
        url.origin !== expected.origin ||
        !url.pathname.startsWith(`${expected.pathname}/`) ||
        url.username ||
        url.password ||
        url.hash
      ) {
        throw new StarterError("out_of_scope_request", 500);
      }
      const isStream = url.pathname.endsWith("/events/stream");
      const signals = [init.signal, isStream ? undefined : AbortSignal.timeout(REQUEST_TIMEOUT_MS)].filter(
        (s): s is AbortSignal => !!s,
      );
      return fetch(input, { ...init, signal: signals.length ? AbortSignal.any(signals) : undefined, redirect: "error" });
    },
  });
}
