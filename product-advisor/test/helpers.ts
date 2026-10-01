import type { Server } from "node:http";
import { Catalog } from "../mcp/catalog.js";
import { catalogApp } from "../mcp/server.js";
import { Receipts } from "../src/storage/receipts.js";
import { Conversations } from "../src/storage/conversations.js";
import { Advisor } from "../src/server/advisor.js";
import { FakePlatform } from "./fake-platform.js";

export async function listen(
  app: { listen: (port: number, host: string, cb: () => void) => Server },
  port = 0,
) {
  const server = await new Promise<Server>((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => resolve(server));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no_port");
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
export async function fixture() {
  const receipts = new Receipts(":memory:");
  const mcp = await listen(catalogApp(new Catalog(), receipts));
  const store = new Conversations(":memory:");
  const fake = new FakePlatform(mcp.url + "/mcp");
  const advisor = new Advisor(
    store,
    fake.client,
    "test-agent",
    mcp.url + "/mcp",
  );
  return {
    receipts,
    mcp,
    store,
    fake,
    advisor,
    close: async () => {
      await advisor.close();
      await mcp.close();
      receipts.close();
      store.close();
    },
  };
}
export async function waitFor(check: () => boolean) {
  for (let n = 0; n < 100; n++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("test_wait_timeout");
}
