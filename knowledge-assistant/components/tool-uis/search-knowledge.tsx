"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ToolCard, toolActivity } from "./tool-card";

/** search_knowledge: the query, and how the search went. A failure never reads as "nothing found". */
export const SearchKnowledgeCard: ToolCallMessagePartComponent = (props) => {
  const query = typeof props.args.query === "string" ? props.args.query : undefined;
  const search = toolActivity(props)?.search;
  return (
    <ToolCard
      {...props}
      details={query ? <p className="min-w-0 text-sm break-words">Searching the docs for “{query}”</p> : undefined}
      preview={
        search ? (
          <p className="text-muted-foreground text-xs">
            {search.passages === 0
              ? "No matching passages."
              : `Found ${search.passages} ${search.passages === 1 ? "passage" : "passages"}.`}
          </p>
        ) : undefined
      }
    />
  );
};
