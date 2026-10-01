import express from "express";
import { resolve } from "node:path";
import { appRuntime } from "../src/server/runtime.js";
const runtime = await appRuntime();
runtime.app.use(express.static(resolve("dist", "client")));
runtime.app.get("/{*path}", (_req, res) =>
  res.sendFile(resolve("dist", "client", "index.html")),
);
const url = new URL(runtime.origin);
const server = runtime.app.listen(
  Number(process.env.PORT || url.port || 4310),
  process.env.APP_HOST ?? "localhost",
  () => console.log(`Product Advisor: ${runtime.origin}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => {
      void runtime.close().then(() => process.exit(0));
    });
    server.closeAllConnections();
  });
