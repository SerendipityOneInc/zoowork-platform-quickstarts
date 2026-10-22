import { Store } from "../src/store.js";
import { SupportService } from "../src/service.js";
import { supportServer } from "../src/http.js";
import { fixtureClient } from "./fixture.js";

// Browser tests only (started by playwright.config.ts). Serves the real routes,
// store and handlers with the fake Platform transport from fixture.js and an
// in-memory database. Application code and npm scripts never start it.
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
const server = supportServer(service, { origin: () => origin });
await new Promise<void>((resolveReady) =>
  server.listen(port, "localhost", resolveReady),
);
console.log(`Browser test fixture: ${origin}. No model or Platform requests.`);
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
