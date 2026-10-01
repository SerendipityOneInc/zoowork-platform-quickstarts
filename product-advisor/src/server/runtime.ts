import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createZooworkClient } from "@zoowork-ai/sdk";
import { loadState, readConfig, ownedAgent } from "../platform.js";
import { demo, publicMcpUrl } from "../agent.js";
import { Conversations } from "../storage/conversations.js";
import { Advisor } from "./advisor.js";
import { applicationApi } from "./http.js";

export async function appRuntime() {
  const dir = resolve(".local");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const secret =
    process.env.APP_COOKIE_SECRET || randomBytes(32).toString("hex");
  if (process.env.ZOOWORK_API_KEY && !process.env.APP_COOKIE_SECRET)
    throw new Error("app_cookie_secret_required");
  const origin = process.env.APP_ORIGIN ?? "http://localhost:4310";
  const url = new URL(origin);
  if (url.origin !== origin) throw new Error("app_origin_required");
  const store = new Conversations(resolve(dir, "conversations.sqlite"));
  let advisor: Advisor | undefined;
  if (process.env.ZOOWORK_API_KEY) {
    const config = readConfig();
    const state = await loadState(resolve(dir, "agent.json"), config, demo);
    if (state?.agentId) {
      const expected = new URL(config.baseUrl);
      const client = createZooworkClient({
        ...config,
        fetch: async (input, init = {}) => {
          const u = new URL(input);
          if (
            u.origin !== expected.origin ||
            !u.pathname.startsWith("/service/v1/")
          )
            throw new Error("out_of_scope_request");
          return fetch(input, {
            ...init,
            redirect: "error",
            signal: AbortSignal.any([
              AbortSignal.timeout(
                u.pathname.endsWith("/stream") ? 75_000 : 30_000,
              ),
              ...(init.signal ? [init.signal] : []),
            ]),
          });
        },
      });
      await ownedAgent(client, state);
      const storedUrl = state.resource.mcp?.find(
        (m) => m.name === "catalog",
      )?.url;
      if (state.pendingResource || !storedUrl || storedUrl !== publicMcpUrl())
        throw new Error("run_configure_before_start");
      if (store.agentIds().some((id) => id !== state.agentId))
        throw new Error("retained_session_agent_mismatch");
      advisor = new Advisor(store, client, state.agentId, storedUrl);
      advisor.resume();
    }
  }
  const app = applicationApi(advisor, {
    origin,
    cookieSecret: secret,
    secure: url.protocol === "https:",
  });
  return {
    app,
    store,
    advisor,
    origin,
    close: async () => {
      await advisor?.close();
      store.close();
    },
  };
}
