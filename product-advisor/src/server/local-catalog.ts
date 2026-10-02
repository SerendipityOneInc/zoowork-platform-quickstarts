import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Catalog } from "../../mcp/catalog.js";
import { catalogApp } from "../../mcp/server.js";
import { Receipts } from "../storage/receipts.js";
import { FoundationError } from "../platform.js";

export function tunnelEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    [
      "PATH",
      "HOME",
      "LANG",
      "SystemRoot",
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "NO_PROXY",
      "SSL_CERT_FILE",
      "SSL_CERT_DIR",
    ]
      .filter((key) => env[key] !== undefined)
      .map((key) => [key, env[key]]),
  );
}

export async function quickTunnel(
  localUrl: string,
  binary = "cloudflared",
  timeoutMs = 45_000,
) {
  const child = spawn(
    binary,
    ["tunnel", "--no-autoupdate", "--url", localUrl],
    { env: tunnelEnvironment(process.env), stdio: ["ignore", "pipe", "pipe"] },
  );
  const exited = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  const close = async () => {
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(timer);
  };
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new FoundationError("tunnel_start_timeout")),
        timeoutMs,
      );
      let text = "";
      const receive = (chunk: Buffer) => {
        text = (text + chunk.toString()).slice(-8192);
        const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/.exec(
          text,
        )?.[0];
        if (url && text.includes("Registered tunnel connection")) {
          clearTimeout(timer);
          resolve(url);
        }
      };
      child.stdout.on("data", receive);
      child.stderr.on("data", receive);
      child.once("error", () => {
        clearTimeout(timer);
        reject(new FoundationError("cloudflared_required"));
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new FoundationError("tunnel_exited"));
      });
    });
    return { url, exited, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function verifyCatalog(url: string): Promise<void> {
  const client = new Client({
    name: "product-advisor-startup",
    version: "1.0.0",
  });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)), {
      timeout: 15_000,
    });
    const tools = await client.listTools({}, { timeout: 15_000 });
    if (
      tools.tools
        .map((t) => t.name)
        .sort()
        .join(",") !== "compare_products,get_products,search_products"
    )
      throw new FoundationError("catalog_tool_set_mismatch");
  } finally {
    await client.close();
  }
}

export async function waitTunnelDns(
  url: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 60_000,
): Promise<void> {
  const host = new URL(url).hostname;
  if (!/^[a-z0-9-]+\.trycloudflare\.com$/.test(host))
    throw new FoundationError("unexpected_tunnel_hostname");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Ask Cloudflare before the first local lookup; early NXDOMAIN responses
      // can otherwise remain in the machine's DNS cache after publication.
      const r = await fetcher(
        `https://cloudflare-dns.com/dns-query?name=${host}&type=A`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        },
      );
      const result = (await r.json()) as {
        Status?: number;
        Answer?: { type: number; data: string }[];
      };
      if (
        r.ok &&
        result.Status === 0 &&
        result.Answer?.some((a) => a.type === 1)
      )
        return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new FoundationError("tunnel_dns_not_ready");
}

export async function localCatalog(
  options: {
    port?: number;
    binary?: string;
    path?: string;
    onUrl?: (url: string) => void;
  } = {},
) {
  const receipts = new Receipts(
    options.path ?? resolve(".local", "catalog.sqlite"),
  );
  let server: Server | undefined;
  let tunnel: Awaited<ReturnType<typeof quickTunnel>> | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await tunnel?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    receipts.close();
  };
  try {
    server = await new Promise<Server>((resolve, reject) => {
      const pending = catalogApp(new Catalog(), receipts).listen(
        options.port ?? 0,
        "localhost",
        () => resolve(pending),
      );
      pending.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new FoundationError("catalog_listen_failed");
    tunnel = await quickTunnel(
      `http://localhost:${address.port}`,
      options.binary,
    );
    const url = tunnel.url + "/mcp";
    options.onUrl?.(url);
    await waitTunnelDns(url);
    // DNS propagation is read-only; retry health, never a paid Platform turn.
    let ready = false;
    const deadline = Date.now() + 75_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(tunnel.url + "/health", {
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) throw new FoundationError("public_catalog_unreachable");
    await verifyCatalog(url);
    return { url, exited: tunnel.exited, close };
  } catch (error) {
    await close();
    throw error;
  }
}
