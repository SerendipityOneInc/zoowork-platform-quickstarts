// npm run preview — the chat page without a key. The server answers with
// scripted events from lib/zoowork/preview.ts; nothing is sent to ZooWork
// and no credits are used. Conversations live in memory until you stop it.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
// In preview mode the server never reads ZOOWORK_API_KEY, even if .env has one.
const env: NodeJS.ProcessEnv = { ...process.env, ZOOWORK_PREVIEW: "1" };

console.log("Offline preview: simulated replies, no ZooWork requests.");
const child = spawn(process.execPath, [next, "dev", "--hostname", "localhost", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
