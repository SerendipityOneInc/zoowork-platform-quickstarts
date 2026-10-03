# References and copying policy

Checked 2026-10-01. No third-party app code is copied in this foundation. Lifecycle code
is original, following the public SDK and the SDK repository's existing E2E sequence.

| Source | Snapshot | Intended use |
| --- | --- | --- |
| [ZooWork SDK](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/releases/tag/v0.9.0) | `0.9.0` | Lifecycle and smoke pattern |
| [Claude Chat SDK](https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/chat-sdk) | `09bdac604c1709ff1e38175e832b5f8124f0e63e`, 2026-09-22 | Web adapter, session bridge, history/progress UI |
| [Chat SDK Web](https://chat-sdk.dev/adapters/official/web) | Docs checked 2026-10-01 | Browser transport and application identity |
| [OpenAI Knowledge Retrieval](https://github.com/openai/openai-knowledge-retrieval) | `f62c5dd49955d2bc793e0a55989863dca61f1ead`, 2026-01-13 | Retrieval adapters, citations, evals |
| [Claude RAG cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/capabilities/retrieval_augmented_generation) | Source checked 2026-10-01 | Retrieval/evaluation recipe |
| [Claude Knowledge Wiki](https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/knowledge-wiki) | `09bdac604c1709ff1e38175e832b5f8124f0e63e`, 2026-09-22 | Provenance/missing information |
| [OpenAI Agents API apps](https://github.com/openai/openai-cookbook/tree/main/examples/agents_api) | Source checked 2026-10-01 | Scenario README and cleanup |

Before copying code, read its license, pin the source commit and retain copyright/license
notices. Record copied paths and adaptations here. Adapt runtime calls to Platform.

## Application source records

- [Customer Support references and license review](../customer-support/docs/REFERENCES.md)
  record the complete-example sources used by the delivered workbench.
- [Research Assistant references and retained Anthropic MIT notice](../research-assistant/REFERENCES.md)
  record the adapted Claude Web adapter/Hono/React reading structure from
  `3994db7dc2464d9ab255aba1dfda3594fc994c21` and its Platform adaptations.

Feature deliveries maintain their own source commits, copied paths and license notices in the
application directory. The foundation source record above does not replace those app records.
