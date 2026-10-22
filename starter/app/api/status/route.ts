import type { AppStatus } from "@/lib/chat/wire";
import { errorCode } from "@/lib/zoowork/errors";
import { route } from "@/lib/zoowork/http";
import { getRuntime } from "@/lib/zoowork/runtime";

// GET /api/status — is the app ready to chat? The page shows a banner from
// this: setup not run yet, the Agent stopped, or agent/agent.md changed since
// the last `npm run setup`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  let status: AppStatus;
  try {
    const check = await (await getRuntime()).checkAgent();
    status = {
      agent: !check.definitionApplied ? "definition_changed" : check.desiredState !== "running" ? "not_running" : "ready",
    };
  } catch (error) {
    status = { agent: "unavailable", code: errorCode(error) };
  }
  return Response.json(status);
});
