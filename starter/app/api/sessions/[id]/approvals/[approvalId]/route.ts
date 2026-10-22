import type { ApprovalDecision } from "@zoowork-ai/sdk";
import { StarterError } from "@/lib/zoowork/errors";
import { readJson, route } from "@/lib/zoowork/http";
import { getRuntime, ownedSession } from "@/lib/zoowork/runtime";

// POST /api/sessions/[id]/approvals/[approvalId] {decision} → {decision}
//
// Allow or deny a tool call the Agent is waiting on. Approvals are scoped to
// the Agent, so the route first checks the approval is pending in THIS
// Session before resolving it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; approvalId: string }> };

const DECISIONS: readonly ApprovalDecision[] = ["allow-once", "deny"];

export const POST = route(
  async (request, { params }: Ctx) => {
    const rt = await getRuntime();
    const { id, approvalId } = await params;
    const entry = await ownedSession(rt, id);
    const body = await readJson(request);
    const decision = body.decision as ApprovalDecision;
    if (!DECISIONS.includes(decision)) throw new StarterError("invalid_decision");
    const pending = await rt.client.listApprovals(rt.agentId, { status: "pending", sessionId: entry.id });
    const approval = pending.find((a) => a.approval_id === approvalId);
    if (!approval) throw new StarterError("approval_not_pending", 409);
    if (approval.allowed_decisions && !approval.allowed_decisions.includes(decision)) throw new StarterError("decision_not_allowed", 409);
    await rt.client.resolveApproval(rt.agentId, approvalId, { decision });
    return Response.json({ decision });
  },
  { write: true },
);
