# Research Assistant References

## Vercel Chat SDK

- Official [Web adapter documentation](https://chat-sdk.dev/adapters/official/web)
  and [Markdown documentation](https://chat-sdk.dev/adapters/official/web.md).
- Reviewed getUser, thread ID encode/decode, persistMessageHistory, useChat/transport,
  thread.post and request abort. Web response and Platform run have separate lifecycles.
- This demo pins `chat`, `@chat-adapter/web` and `@chat-adapter/state-memory` to 4.34.0.
  npm confirmed availability and peer ranges; latest at review was 4.41.1.
- [vercel/chat](https://github.com/vercel/chat) main was
  `4b458b4c345ee61056fa4d4d6877593dc2a38107`; library implementation was not copied.
- Use published packages, without copied adapter internals or unreviewed tool/data parts.
