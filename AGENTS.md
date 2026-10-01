# Platform Quickstarts

Read `docs/OUTLINE.md`, `docs/PLATFORM.md` and the target demo's README first.

- Use only Platform Project keys (`zwp_live_`) and the published SDK. The application's
  setup creates its Agent; the gateway derives Org/Project/owner tenancy.
- Each demo installs independently. No workspace links, sibling imports or local SDK overrides.
  Keep changes in the requested demo. Propose SDK changes in the SDK repository separately.
- Keep credentials server-side, outside Git and logs. Commit only `.env.example`.
- Run `npm ci` and `npm run check` in the changed demo before committing. CI is offline.
- Live tests require user authorization. The staging smoke creates one temporary Agent/Session,
  performs one model turn and cleans up. Finding a key or passing a flag is not authorization.
- Preserve recovery state after ambiguous creation or failed cleanup. Operate only on recorded
  resource IDs with matching labels; never scan a Project to choose resources for deletion.
- RAG provider and UX are undecided. Read `docs/RAG-RESEARCH.md` and discuss the choice
  before adding ingestion, embeddings, a vector database or provider dependencies.
- Use `docs/handoffs/` for the four feature sessions. Do not start other demos in the same PR.
- Preserve licenses when copying code; record source commits and paths in `docs/REFERENCES.md`.
- Commit as `finn-srp <finn@srp.one>`; use Finn's active GitHub identity.

Current status: runnable SDK lifecycle foundation. Feature demos are not implemented yet.
