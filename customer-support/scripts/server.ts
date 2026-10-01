import { createZooworkClient } from "@zoowork-ai/sdk";
import { chmod, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { demo } from "../src/agent.js";
import {
  FoundationError,
  loadState,
  ownedAgent,
  readConfig,
  safeError,
} from "../src/platform.js";
import { Store } from "../src/store.js";
import { SupportService } from "../src/service.js";
import { supportServer } from "../src/http.js";

try {
  const config = readConfig();
  const state = await loadState(resolve(".local/agent.json"), config, demo);
  if (!state?.agentId) throw new FoundationError("run_setup_first");
  const expected = new URL(config.baseUrl);
  // No process-wide timeout or request budget: the web app is long-lived. Each request remains bounded.
  const client = createZooworkClient({
    ...config,
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      if (
        url.origin !== expected.origin ||
        !url.pathname.startsWith(expected.pathname + "/") ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error("Out of scope");
      return fetch(input, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([
          AbortSignal.timeout(45_000),
          ...(init.signal ? [init.signal] : []),
        ]),
      });
    },
  });
  await ownedAgent(client, state);
  if (
    !state.resource.custom_tools?.some(
      (tool) => tool.name === "create_support_ticket",
    )
  )
    throw new FoundationError("agent_config_outdated_cleanup_then_setup");
  await mkdir(".local", { recursive: true, mode: 0o700 });
  const store = new Store(
    resolve(".local/support.sqlite"),
    `${config.baseUrl}:${state.instance}:${state.agentId}`,
  );
  store.claimProcess();
  await chmod(".local/support.sqlite", 0o600);
  const service = new SupportService(store, client, state.agentId);
  const port = Number(process.env.PORT ?? 4600);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid port");
  const origin = `http://localhost:${port}`;
  const server = supportServer(service, { origin: () => origin });
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(port, "localhost", resolveReady);
  });
  console.log(`Customer Support: ${origin} (synthetic data)`);
  void service
    .resume()
    .catch(() =>
      console.error("Recovery paused. Use the workbench recovery control."),
    );
  let ticking = false;
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void service
      .tick()
      .catch(() => console.error("Recovery paused."))
      .finally(() => {
        ticking = false;
      });
  }, 3000);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    server.close();
    server.closeAllConnections();
    await service.stop();
    store.releaseProcess();
    store.close();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
} catch (error) {
  console.error(
    `Cannot start: ${safeError(error)}. Check setup and retained .local state.`,
  );
  process.exitCode = 1;
}
