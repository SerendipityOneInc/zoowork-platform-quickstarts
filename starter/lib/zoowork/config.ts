import { DEFAULT_BASE_URL } from "@zoowork-ai/sdk";
import { StarterError } from "./errors";

export interface PlatformConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * Read the server-side Platform configuration. The key must be a Platform
 * Project key; Work organization keys (`zct_`) are rejected. `ZOOWORK_BASE_URL`
 * is optional and defaults to the SDK's production API. When set, it must be an
 * HTTPS `/service/v1` URL, so a typo cannot silently send the key to another host.
 */
export function readPlatformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
  const apiKey = env.ZOOWORK_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith("zwp_live_") || apiKey.length <= "zwp_live_".length) {
    throw new StarterError("platform_project_key_required", 500);
  }
  let url: URL;
  try {
    url = new URL(env.ZOOWORK_BASE_URL?.trim() || DEFAULT_BASE_URL);
  } catch {
    throw new StarterError("invalid_public_base_url", 500);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/$/, "") !== "/service/v1"
  ) {
    throw new StarterError("invalid_public_base_url", 500);
  }
  return { apiKey, baseUrl: `${url.origin}/service/v1` };
}
