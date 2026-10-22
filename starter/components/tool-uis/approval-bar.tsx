"use client";

// The Allow/Deny gate for a tool call the Agent is waiting on. A tool waits
// for approval when the Agent's tool policy requires it. Allow runs the call
// once; Deny ends it without running, and the Agent continues without it.
// Adapted from the Claude Managed Agents assistant-ui quickstart (MIT).

import { CheckIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Approval = { id: string; approved?: boolean; reason?: string };

export function ApprovalBar({
  approval,
  respondToApproval,
  what = "run this",
  className,
}: {
  approval?: Approval;
  respondToApproval?: (response: { approved: boolean }) => void;
  what?: string;
  className?: string;
}) {
  if (approval && approval.approved !== undefined) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs",
          approval.approved ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          className,
        )}
      >
        {approval.approved ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
        {/* A gate that ended without a decision (stopped, timed out) shows that reason instead. */}
        <span className="font-medium">{approval.approved ? "Allowed" : (approval.reason ?? "Denied")}</span>
      </div>
    );
  }
  if (!approval || !respondToApproval) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 text-amber-700 text-xs dark:text-amber-400">
        <ShieldAlertIcon className="size-3.5" />
        <span className="font-medium">The Agent wants to {what}. Allow?</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => respondToApproval({ approved: true })}>
          <CheckIcon className="size-3.5" />
          Allow
        </Button>
        <Button size="sm" variant="outline" onClick={() => respondToApproval({ approved: false })}>
          <XIcon className="size-3.5" />
          Deny
        </Button>
      </div>
    </div>
  );
}
