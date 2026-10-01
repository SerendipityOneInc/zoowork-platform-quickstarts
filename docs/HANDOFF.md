# Session handoff

Use a separate worktree and branch for each demo. Start from the merged foundation commit.
If its PR is open, recheck its actual head and use that branch as the feature PR's base.
Do not change another session's checkout or branch.

| Session | Prompt | Scope |
| --- | --- | --- |
| Custom Tool | [custom-tool.md](handoffs/custom-tool.md) | `custom-tool/` |
| MCP | [mcp.md](handoffs/mcp.md) | `mcp/` |
| RAG | [rag.md](handoffs/rag.md) | `rag/`; discussion first |
| Chat SDK | [chat-sdk.md](handoffs/chat-sdk.md) | `chat-sdk/` |

Prompts request one runnable app and feature PR after local checks. They do not grant
production deployment or unrestricted live tests. Finn can authorize a bounded staging
run when starting the session. Credentials and local recovery state do not transfer via Git.
Resolve retained smoke state before a new live run; cleanup only recorded resources.
