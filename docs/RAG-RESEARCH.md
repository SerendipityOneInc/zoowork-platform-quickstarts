# RAG examples and open decisions

Checked 2026-10-01. Both vendors have official retrieval examples. RAG's provider/UX
remain undecided; the foundation does not implement retrieval.

## OpenAI

[OpenAI Knowledge Retrieval](https://github.com/openai/openai-knowledge-retrieval) is a
complete starter with ingestion, retrieval, a ChatKit UI and evals. It supports OpenAI
File Search and a custom store path with a Qdrant adapter. Latest checked repository
commit: `f62c5dd49955d2bc793e0a55989863dca61f1ead`, 2026-01-13.

The [current Retrieval guide](https://developers.openai.com/api/docs/guides/retrieval)
allows vector-store search separately from answer generation. A possible Platform
integration is to return those retrieved chunks through an application Custom Tool.
This is a design option, not a verified integration in this PR.

Borrow adapter separation, source citations and small evaluation datasets. Keep Platform
as the Agent runtime when adapting the example.

## Claude

[RAG cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/capabilities/retrieval_augmented_generation)
contains a traditional retrieval notebook and evaluation materials. It is a recipe, not
a complete browser starter.

[Managed Agents Knowledge Wiki](https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/knowledge-wiki)
extracts documents into a memory-store wiki, resolves questions, consolidates it and
answers with provenance. Latest checked path commit: `09bdac604c1709ff1e38175e832b5f8124f0e63e`,
2026-09-22. Consolidation requires gated Dreaming access and a preview SDK. This is not
an adapter for an existing third-party vector store. Borrow provenance and explicit
missing-information behavior, rather than assuming Platform offers the same memory API.

[anthropic-retrieval-demo](https://github.com/anthropics/anthropic-retrieval-demo) has
older external search examples but is archived. It is historical reference.

## Discuss before implementation

1. Connect an existing retrieval service, or teach ingestion from documents too?
2. First real adapter: generic HTTP, Dify knowledge, Qdrant, or OpenAI vector-store search?
3. Show answers/citation excerpts only, or retrieval query, scores and source selection too?
4. How do document versions, application user permissions and source IDs work?
5. Which small corpus and expected answers prove retrieval, missing answers and citations?

If the primary question remains “can I connect my existing RAG?”, start with application
retrieval and one adapter; make ingestion an optional extension. Confirm this with Finn
before adding provider dependencies or committing a retrieval schema.
