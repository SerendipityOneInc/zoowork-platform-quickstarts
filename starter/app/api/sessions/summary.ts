import type { SessionSummary } from "@/lib/chat/wire";
import type { SessionEntry } from "@/lib/zoowork/sessions";

export function summarize(entry: SessionEntry): SessionSummary {
  return {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    archived: entry.archived === true,
  };
}
