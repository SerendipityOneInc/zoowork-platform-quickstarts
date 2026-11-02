# Knowledge Assistant

A chat app that answers from a knowledge service, with checked sources. See README.md.

- `agent/agent.md` defines the Agent. Apply changes with `npm run setup`.
- `corpus/` is the sample knowledge base, all fictional. `npm run setup` uploads what changed.
- `lib/knowledge/cloudflare.ts` holds every Cloudflare call. Keep it that way: the chat, the Agent
  and the search worker depend only on `Retriever` in `lib/knowledge/retriever.ts`.
- `lib/knowledge/worker.ts` answers `search_knowledge` on the server, so a run never depends on a
  browser. A failed search stays a failure; never report it as "nothing found".
- `lib/knowledge/citations.ts` decides what counts as a source. A citation is shown only if the
  run's own search returned that key.
- `app.config.ts` is sent to the browser: no keys or private data.
- `lib/zoowork/` and `lib/knowledge/` (except `citations.ts`) are server-only.
- Keys live only in `.env`. Never put them in code, chat, logs or Git.
- Keep `.local/` after any failed or uncertain setup or cleanup.
- `npm run check` must pass offline. Fakes live only in `test/`; the app has no mock mode. Live
  requests use credits and need the owner's approval.
