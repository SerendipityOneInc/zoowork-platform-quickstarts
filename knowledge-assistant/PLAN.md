# Knowledge Assistant design plan

Startup: RAG discussion first. Technical focus: connecting existing external retrieval.
Read [official examples and open decisions](docs/RAG-RESEARCH.md) and this app's
[rules](AGENTS.md). Keep RAG-specific research and decisions in this directory.

## Intended product flow

A user asks a question against an existing knowledge base, receives an evidence-grounded
answer and can open the cited excerpts. A follow-up remains in the same conversation.
The app distinguishes unsupported questions, an empty retrieval result and provider failure.

## Prepare before implementation

Recommend the smallest complete app for the developer question "can I connect my existing
RAG?" Compare a few real adapters, choose a representative small corpus and explain the
setup burden. Discuss the first provider, whether ingestion is included, source identity,
application user permissions and citation display with Finn before adding dependencies or
implementing a retrieval schema. Do not select a provider on behalf of the other sessions.

## Proposed boundary

Platform owns the Agent and Session. The application executes retrieval using server-side
provider credentials, then passes evidence into the Agent through a Custom Tool. A provider
adapter normalizes source IDs and chunks. Retrieval access must be checked in backend code,
not determined by a model-provided user ID. This remains a proposal until the discussion.

## Intended acceptance

Retrieval uses the chosen real provider. Citations resolve to evidence actually retrieved.
Unsupported questions do not invent sources. Provider errors remain visible. A small
corpus and evaluation set cover supported answers, absent information and citation accuracy.
The implementation and live verification are a later step after the design discussion.
