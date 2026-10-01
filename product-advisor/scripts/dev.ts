import { createServer } from "vite";
import { appRuntime } from "../src/server/runtime.js";
const runtime = await appRuntime();
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "spa",
});
runtime.app.use(vite.middlewares);
const url = new URL(runtime.origin);
const server = runtime.app.listen(Number(url.port || 4310), "localhost", () =>
  console.log(`Product Advisor: ${runtime.origin}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void vite.close();
    server.close(() => {
      void runtime.close().then(() => process.exit(0));
    });
    server.closeAllConnections();
  });
