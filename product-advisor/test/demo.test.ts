import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_BASE_URL,
  type AgentResource,
  type ZooworkClient,
} from "@zoowork-ai/sdk";
import { readConfig, loadState, STAGING_URL } from "../src/platform.js";
import { cookieSecret } from "../src/server/cookie-secret.js";
import { prepareDemo } from "../src/server/demo-setup.js";
import {
  quickTunnel,
  tunnelEnvironment,
  waitTunnelDns,
} from "../src/server/local-catalog.js";

test("a Project key alone uses the published SDK endpoint; staging stays explicit", () => {
  const apiKey = "zwp_live_synthetic_not_a_real_key";
  assert.deepEqual(readConfig({ ZOOWORK_API_KEY: apiKey }), {
    apiKey,
    baseUrl: DEFAULT_BASE_URL,
  });
  assert.equal(
    readConfig({ ZOOWORK_API_KEY: apiKey, ZOOWORK_BASE_URL: STAGING_URL })
      .baseUrl,
    STAGING_URL,
  );
});

test("generated visitor secret survives concurrent startup and remains private", async () => {
  const dir = await mkdtemp(join(tmpdir(), "advisor-cookie-"));
  const path = join(dir, "cookie-secret");
  try {
    const [a, b] = await Promise.all([cookieSecret(path), cookieSecret(path)]);
    assert.equal(a, b);
    assert.equal(await cookieSecret(path), a);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(await cookieSecret(path, "x".repeat(32)), "x".repeat(32));
    await assert.rejects(cookieSecret(path, "short"));
    await writeFile(path, "invalid", { mode: 0o600 });
    await assert.rejects(cookieSecret(path), /invalid_saved_cookie_secret/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("new tunnel URLs update the owned Agent and ambiguous updates replay exactly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "advisor-demo-"));
  const config = {
    apiKey: "zwp_live_synthetic_not_a_real_key",
    baseUrl: STAGING_URL,
  };
  let declared: AgentResource | undefined;
  let creates = 0,
    failUpdate = false;
  const updates: AgentResource[] = [];
  const client = {
    createAgent: async ({ resource }: { resource: AgentResource }) => {
      creates++;
      declared = resource;
      return { agent_id: "agt_synthetic" };
    },
    getAgent: async () => ({ agent_id: "agt_synthetic", declared }),
    startAgent: async () => ({ warnings: [] }),
    waitUntilRunning: async () => ({ agent_id: "agt_synthetic", declared }),
    updateAgent: async (_id: string, resource: AgentResource) => {
      updates.push(resource);
      if (failUpdate) throw new Error("uncertain");
      declared = resource;
      return { agent_id: "agt_synthetic", declared };
    },
  } as unknown as ZooworkClient;
  try {
    await prepareDemo(client, config, "https://first.example/mcp", dir);
    await prepareDemo(client, config, "https://second.example/mcp", dir);
    assert.equal(creates, 1);
    failUpdate = true;
    await assert.rejects(
      prepareDemo(client, config, "https://third.example/mcp", dir),
    );
    const path = join(dir, "agent.json");
    const before = (await loadState(path, config, "product-advisor"))!;
    assert.equal(before.resource.mcp![0]!.url, "https://second.example/mcp");
    assert.equal(
      before.pendingResource!.mcp![0]!.url,
      "https://third.example/mcp",
    );
    failUpdate = false;
    await prepareDemo(client, config, "https://fourth.example/mcp", dir);
    assert.equal(creates, 1);
    assert.deepEqual(updates[1], updates[2]);
    const after = (await loadState(path, config, "product-advisor"))!;
    assert.equal(after.pendingResource, undefined);
    assert.equal(after.resource.mcp![0]!.url, "https://fourth.example/mcp");
    assert.deepEqual(after.resource.labels, before.resource.labels);
    assert.equal((await readFile(path, "utf8")).includes(config.apiKey), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tunnel process gets no Project key; split output parses and shutdown releases it", async () => {
  assert.deepEqual(
    tunnelEnvironment({
      PATH: "/bin",
      HOME: "/tmp",
      ZOOWORK_API_KEY: "private",
      APP_COOKIE_SECRET: "private",
      UNRELATED_SECRET: "private",
    }),
    { PATH: "/bin", HOME: "/tmp" },
  );
  const dir = await mkdtemp(join(tmpdir(), "advisor-tunnel-"));
  const binary = join(dir, "cloudflared");
  try {
    await writeFile(
      binary,
      '#!/usr/bin/env node\nprocess.stderr.write("https://synthetic-");\nsetTimeout(()=>process.stderr.write("demo.trycloudflare.com\\nRegistered tunnel connection\\n"),20);\nsetInterval(()=>{},1000);\nprocess.on("SIGTERM",()=>process.exit(0));\n',
      { mode: 0o700 },
    );
    const tunnel = await quickTunnel("http://localhost:4311", binary, 5000);
    assert.equal(tunnel.url, "https://synthetic-demo.trycloudflare.com");
    await tunnel.close();
    await tunnel.exited;
    await assert.rejects(
      quickTunnel("http://localhost:4311", join(dir, "missing"), 100),
      /cloudflared_required/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tunnel startup waits for published DNS without exposing config to its resolver", async () => {
  const queries: string[] = [];
  const fetcher = (async (url: string) => {
    queries.push(url);
    return Response.json(
      queries.length === 1
        ? { Status: 3 }
        : { Status: 0, Answer: [{ type: 1, data: "104.16.230.132" }] },
    );
  }) as typeof fetch;
  await waitTunnelDns(
    "https://synthetic-demo.trycloudflare.com/mcp",
    fetcher,
    5000,
  );
  assert.equal(queries.length, 2);
  assert.ok(
    queries.every(
      (q) =>
        q ===
        "https://cloudflare-dns.com/dns-query?name=synthetic-demo.trycloudflare.com&type=A",
    ),
  );
  await assert.rejects(
    waitTunnelDns("https://private.example/mcp", fetcher),
    /unexpected_tunnel_hostname/,
  );
  assert.equal(queries.length, 2);
});
