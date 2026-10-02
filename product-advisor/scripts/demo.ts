import { createServer as httpServer } from "node:http";
import { setDefaultResultOrder } from "node:dns";
import { resolve } from "node:path";
import { createServer as viteServer } from "vite";
import { publicMcpUrl } from "../src/agent.js";
import {
  FoundationError,
  readConfig,
  runtime,
  safeError,
  withStateLock,
} from "../src/platform.js";
import { localCatalog, verifyCatalog } from "../src/server/local-catalog.js";
import { prepareDemo } from "../src/server/demo-setup.js";
import { appRuntime } from "../src/server/runtime.js";

try {
  // Local VPNs may advertise IPv6 while only routing IPv4 to the tunnel edge.
  setDefaultResultOrder("ipv4first");
  const config = readConfig();
  const origin = process.env.APP_ORIGIN ?? "http://localhost:4310";
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.hostname !== "localhost" ||
    url.protocol !== "http:"
  )
    throw new FoundationError("local_demo_origin_required");
  await withStateLock(resolve(".local", "demo-runtime.json"), async () => {
    let catalog: Awaited<ReturnType<typeof localCatalog>> | undefined;
    let app: Awaited<ReturnType<typeof appRuntime>> | undefined;
    let vite: Awaited<ReturnType<typeof viteServer>> | undefined;
    let stopping = false;
    const server = httpServer((_req, res) => {
      res.writeHead(503).end("Product Advisor is starting");
    });
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const stop = () => finish();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(Number(url.port || 4310), "localhost", resolve);
      });
      if (process.env.MCP_PUBLIC_URL) {
        process.env.MCP_PUBLIC_URL = publicMcpUrl();
        await verifyCatalog(process.env.MCP_PUBLIC_URL);
      } else {
        console.log(
          "Starting the bundled synthetic catalog and a temporary public HTTPS tunnel.",
        );
        catalog = await localCatalog({
          port: process.env.MCP_PORT ? Number(process.env.MCP_PORT) : undefined,
          onUrl: (url) =>
            console.log(`Checking catalog HTTPS endpoint: ${url}`),
        });
        process.env.MCP_PUBLIC_URL = catalog.url;
        void catalog.exited.then(() => {
          if (stopping) return;
          console.error("MCP tunnel closed; restart npm run demo.");
          process.exitCode = 1;
          finish();
        });
      }
      console.log(`Catalog MCP: ${process.env.MCP_PUBLIC_URL}`);
      await prepareDemo(
        runtime(config).client,
        config,
        process.env.MCP_PUBLIC_URL,
      );
      app = await appRuntime();
      vite = await viteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.app.use(vite.middlewares);
      server.removeAllListeners("request");
      server.on("request", app.app);
      console.log(
        `Product Advisor: ${origin}; real Platform SDK + remote MCP.`,
      );
      await finished;
    } finally {
      stopping = true;
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await vite?.close();
      await app?.close();
      await catalog?.close();
      console.log(
        "Local services stopped. Saved Agent/Session records remain; npm run cleanup removes them.",
      );
    }
  });
} catch (error) {
  console.error(
    `FAIL: ${safeError(error)}; see README and retained .local state.`,
  );
  process.exitCode = 1;
}
