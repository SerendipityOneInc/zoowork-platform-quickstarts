import { Store } from "../src/store.js";
import { SupportService } from "../src/service.js";
import { supportServer } from "../src/http.js";
import { fixtureClient } from "../test/fixture.js";

// The fake remote transport is ephemeral too. Platform mode uses an on-disk journal.
const store = new Store(":memory:", "offline-fixture"),
  fixture = fixtureClient();
store.claimProcess();
const service = new SupportService(
  store,
  fixture.client,
  "agent-offline-fixture",
);
const port = Number(process.env.PORT ?? 4600),
  origin = `http://localhost:${port}`;
const server = supportServer(service, { origin: () => origin, offline: true });
await new Promise<void>((resolveReady) =>
  server.listen(port, "localhost", resolveReady),
);
console.log(`Offline test fixture: ${origin}. No model or Platform requests.`);
const timer = setInterval(() => {
  void service.tick();
}, 200);
let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  clearInterval(timer);
  server.close();
  server.closeAllConnections();
  await service.stop();
  store.releaseProcess();
  store.close();
}
process.once("SIGINT", () => {
  void close();
});
process.once("SIGTERM", () => {
  void close();
});
