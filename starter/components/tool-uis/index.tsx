"use client";

// Tool cards. Every entry is a "backend" tool: the Platform runs it, and
// assistant-ui only renders the call, its result preview and any approval
// gate. Tools without a card here (MCP tools, other Platform tools, custom
// tools) fall through to ToolFallback. Add a card for a tool your Agent uses
// by registering it below.

import { defineToolkit, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import type { ToolResultPayload } from "@/lib/chat/reducer";
import { WebFetchToolUI, WebSearchToolUI } from "./web-tools";

// display: "standalone" keeps a card out of the collapsed "N tool calls"
// group, so an Allow/Deny gate on it is always visible.
export const toolkit = defineToolkit({
  web_search: { type: "backend", display: "standalone", render: WebSearchToolUI },
  web_fetch: { type: "backend", display: "standalone", render: WebFetchToolUI },
});

/** The generic card: unwrap our result payload so the stock fallback shows its text. */
export const StarterToolFallback: ToolCallMessagePartComponent = (props) => {
  const payload = props.result as ToolResultPayload | undefined;
  const result = payload && typeof payload === "object" && "text" in payload ? payload.text : props.result;
  return <ToolFallback {...props} result={result} isError={payload?.isError ?? props.isError} />;
};
