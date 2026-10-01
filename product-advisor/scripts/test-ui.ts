// Deliberately excluded from the production build. No Platform key or paid calls.
import express from "express";
import { resolve } from "node:path";
import { applicationApi } from "../src/server/http.js";
import { fixture } from "../test/helpers.js";

const f = await fixture();
const origin = "http://localhost:4390";
const app = applicationApi(f.advisor, {
  origin,
  cookieSecret: "offline-test-secret-not-a-production-secret",
  testMode: true,
});
app.use(express.static(resolve("dist", "client")));
app.get("/{*path}", (_req, res) =>
  res.sendFile(resolve("dist", "client", "index.html")),
);
const server = app.listen(4390, "localhost", () =>
  console.log(
    "Offline UI harness: " +
      origin +
      "; mock Platform, actual HTTP catalog MCP.",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => {
      void f.close().then(() => process.exit(0));
    });
  });
