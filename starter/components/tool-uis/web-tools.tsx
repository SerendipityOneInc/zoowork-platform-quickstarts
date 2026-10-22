"use client";

// web_search and web_fetch cards. The Platform sends a short, truncated
// result preview for each call, not the full result list or page. Search
// cards list the results that are complete in that preview; raw JSON is
// never shown. Adapted from the Claude Managed Agents assistant-ui quickstart (MIT).

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { GlobeIcon, LoaderIcon, SearchIcon } from "lucide-react";
import type { ToolResultPayload } from "@/lib/chat/reducer";
import { looksLikeJson, searchHits } from "@/lib/chat/tool-preview";
import { cn } from "@/lib/utils";
import { ApprovalBar } from "./approval-bar";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- search
type SearchArgs = { query?: string };

export const WebSearchToolUI: ToolCallMessagePartComponent<SearchArgs, ToolResultPayload> = ({
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  // An interrupted call never gets a result; only spin while the turn is
  // actually still running (status is the message status until a result lands).
  const running = !result && status.type === "running" && approval?.approved !== false;
  const hits = result && !result.isError ? searchHits(result.text) : [];
  return (
    <div className="aui-tool-web-search my-1 rounded-lg border border-border">
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {running ? (
          <LoaderIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-muted-foreground text-xs">
          {running ? "Searching" : result?.isError ? "Search failed" : result ? "Searched" : "Search"}
        </span>
        <span className="truncate rounded-md bg-muted px-2 py-0.5 font-medium">{args?.query ?? "…"}</span>
      </div>
      <ApprovalBar
        approval={approval}
        respondToApproval={respondToApproval}
        what="search the web"
        className="border-t px-3 py-2"
      />
      {hits.length > 0 && (
        <ul className="grid gap-0.5 border-t px-3 py-2">
          {hits.slice(0, 5).map((hit) => (
            <li key={hit.url} className="flex min-w-0 items-baseline gap-2 text-[13px]">
              <a href={hit.url} target="_blank" rel="noreferrer noopener" className="truncate font-medium hover:underline">
                {hit.title}
              </a>
              <span className="shrink-0 text-[11px] text-muted-foreground">{hostOf(hit.url)}</span>
            </li>
          ))}
        </ul>
      )}
      {!running && result?.isError && result.text && !looksLikeJson(result.text) && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-[12px] text-muted-foreground">
          {result.text}
        </pre>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- fetch
type FetchArgs = { url?: string };

export const WebFetchToolUI: ToolCallMessagePartComponent<FetchArgs, ToolResultPayload> = ({
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  const url = args?.url ?? "";
  // Same guard as WebSearchToolUI: no spinner on a cancelled/denied call.
  const running = !result && status.type === "running" && approval?.approved !== false;
  const errored = !!result?.isError;
  return (
    <div className="aui-tool-web-fetch my-1 rounded-lg border border-border">
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {running ? (
          <LoaderIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <GlobeIcon className={cn("size-3.5 shrink-0", errored ? "text-red-500" : "text-muted-foreground")} />
        )}
        <span className="text-muted-foreground text-xs">
          {running ? "Fetching" : errored ? "Failed" : result ? "Fetched" : "Fetch"}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate font-mono text-[12px] hover:underline"
        >
          {url}
        </a>
      </div>
      <ApprovalBar
        approval={approval}
        respondToApproval={respondToApproval}
        what={`fetch ${hostOf(url) || "this page"}`}
        className="border-t px-3 py-2"
      />
      {result?.text && !looksLikeJson(result.text) && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-[11px] text-muted-foreground">
          {result.text.slice(0, 1200)}
          {result.text.length > 1200 ? "…" : ""}
        </pre>
      )}
    </div>
  );
};
