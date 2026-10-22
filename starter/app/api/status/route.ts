import type { AppStatus } from "@/lib/chat/wire";
import { isPreview } from "@/lib/zoowork/config";
import { errorCode } from "@/lib/zoowork/errors";
import { route } from "@/lib/zoowork/http";
import { getRuntime } from "@/lib/zoowork/runtime";

// GET /api/status — is the app ready to chat? The page shows a banner from
// this: preview mode, setup not run yet, or agent/agent.md changed since the
// last `npm run setup`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  let status: AppStatus;
  try {
    const rt = await getRuntime();
    if (rt.mode === "preview") {
      status = { mode: "preview", agent: "ready" };
    } else {
      const check = await rt.checkAgent!();
      status = {
        mode: "platform",
        agent: !check.definitionApplied ? "definition_changed" : check.desiredState !== "running" ? "not_running" : "ready",
      };
    }
  } catch (error) {
    status = { mode: isPreview() ? "preview" : "platform", agent: "unavailable", code: errorCode(error) };
  }
  return Response.json(status);
});
