"use client";

import { useAuiState } from "@assistant-ui/react";
import { ChevronRightIcon, FileTextIcon, TriangleAlertIcon } from "lucide-react";
import { describe } from "@/lib/chat/notices";
import type { RunSources } from "@/lib/chat/reducer";

/**
 * Under a reply: the documents it cited, with the passages the search really
 * returned. Everything here was checked by the server. A citation that did not
 * check out is flagged, and a failed search is shown as a failure.
 */
export function MessageSources() {
  const sources = useAuiState((s) => (s.message.metadata?.custom as { sources?: RunSources } | undefined)?.sources);
  if (!sources?.finished) return null;
  const { citations, searchFailed, uncited } = sources;
  return (
    <div data-slot="message-sources" className="mt-3 flex flex-col gap-2 px-2 text-sm">
      {searchFailed && (
        <p role="alert" className="text-destructive flex items-start gap-1.5 text-xs">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{describe(searchFailed, "The document search failed. Try again; if it keeps failing, check the search service settings in .env")}</span>
        </p>
      )}
      {citations.sources.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium">Sources</p>
          {citations.sources.map((source, index) => (
            <details key={source.key} className="group border-border rounded-md border">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs">
                <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
                <FileTextIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
                <span className="font-medium">
                  [{index + 1}] {source.title}
                </span>
                <span className="text-muted-foreground min-w-0 truncate font-mono">{source.key}</span>
              </summary>
              <div className="border-border flex flex-col gap-2 border-t px-2.5 py-2 text-xs">
                {source.excerpts.map((excerpt) => (
                  <blockquote key={excerpt} className="whitespace-pre-wrap break-words">
                    {excerpt}
                  </blockquote>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {citations.unverified.length > 0 && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Not shown as a source, because the search did not return it in this reply: {citations.unverified.join(", ")}
          </span>
        </p>
      )}
      {uncited && <p className="text-muted-foreground text-xs">No sources: this reply does not cite the docs.</p>}
    </div>
  );
}
