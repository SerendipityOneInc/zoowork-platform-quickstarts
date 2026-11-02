// Runs once when the server starts. Opening the runtime starts the worker that
// answers the Agent's searches, so a search left waiting by a restart is
// answered even if no browser has opened the page yet.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getRuntime } = await import("./lib/zoowork/runtime");
  await getRuntime().catch(() => {
    // Not set up yet. The status check reports it, and the first request after setup opens the runtime.
  });
}
