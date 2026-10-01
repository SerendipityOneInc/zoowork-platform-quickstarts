# Knowledge Assistant

Read `PLAN.md` and `docs/RAG-RESEARCH.md` before changing this app.

- This session starts with RAG design discussion. Put research, alternatives and decisions
  in this directory; other sessions do not choose this app's provider or retrieval schema.
- Prepare a recommendation for connecting an existing retrieval service. Discuss the
  first provider, corpus, citations, user permissions and whether ingestion is included
  with Finn before implementing retrieval or adding provider/embedding/vector-store dependencies.
- Preserve Platform as the Agent runtime. A provider supplies retrieved evidence, not
  a replacement agent backend. Distinguish retrieved facts, missing information and failures.
- Root lifecycle, credential, Git and validation rules still apply.
