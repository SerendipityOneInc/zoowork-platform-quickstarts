"use client";

// Tool cards by exact tool name. Add a card for one of your tools here; any
// tool without one uses the generic ToolCard.

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ToolCard } from "./tool-card";
import { SearchKnowledgeCard } from "./search-knowledge";

export const TOOL_CARDS: Record<string, ToolCallMessagePartComponent> = {
  search_knowledge: SearchKnowledgeCard,
};

export const ToolCallPart: ToolCallMessagePartComponent = (props) => {
  const Card = TOOL_CARDS[props.toolName] ?? ToolCard;
  return <Card {...props} />;
};
