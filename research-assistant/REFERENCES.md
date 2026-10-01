# Research Assistant 参考与复用记录

核对日期：2026-10-01。补充共享 [docs/REFERENCES.md](../docs/REFERENCES.md)。
已保留 [完整 Anthropic MIT notice](third-party/anthropic-MIT.txt)，以下记录实际改写范围。

## Claude 官方示例

- Repository：[anthropics/claude-quickstarts](https://github.com/anthropics/claude-quickstarts)。
- 核对 commit：`3994db7dc2464d9ab255aba1dfda3594fc994c21`，commit 时间 2026-09-30 UTC。
- 示例：[managed-agents/chat-sdk](https://github.com/anthropics/claude-quickstarts/tree/3994db7dc2464d9ab255aba1dfda3594fc994c21/managed-agents/chat-sdk)。
- License：[MIT，Copyright (c) 2023 Anthropic](https://github.com/anthropics/claude-quickstarts/blob/3994db7dc2464d9ab255aba1dfda3594fc994c21/LICENSE)。
- foundation 记录的是 `09bdac6`；本轮核对新快照，不修改共享记录。

已读取 package、README、CLAUDE.md、setup prompt、下表中的 src 模块、React UI 和代表性 CSS。
复制或实质改写时必须保留完整 MIT notice，在本应用内保存对应 license，并记录实际复制路径。

以下 Source path 均相对 `managed-agents/chat-sdk/`。

| Source path | 复用判断 | 实际改写位置 |
| --- | --- | --- |
| `src/bot.ts` | 官方 adapter wiring、memory state、concurrent handler；加入 local owner 和 Platform bridge。 | `src/bot.ts` |
| `src/app.ts` | Hono route 组织；应用 mapping/export/interrupt 原创。 | `src/app.ts` |
| `src/main.ts` | Node host/esbuild recipe；加入本机绑定、配置、process lease。 | `src/main.ts`、`scripts/build.ts` |
| `src/activity.ts` | fan-out 结构参考；durable replay 和 snapshot 实现重写。 | 结构参考落在 `src/turns.ts`，未复制函数。 |
| `src/brief.ts` | 纯函数/shared types 的组织方式；去掉 Console URL/fence 协议。 | `src/brief.ts` 的结构参考，projection/来源判定重写。 |
| `src/card.tsx` | 参考产品意图，不复制多 adapter JSX card。 | 未复制 |
| `web/app.tsx`、`web/app.css`、`web/index.html` | React/useChat/remount/sidebar/阅读布局基础；简报、来源、版本、状态和样式适配。 | 对应 `web/` 三个文件 |
| `src/managed-agents.ts` | 串行、anchor、恢复原则。 | 未复制；`src/turns.ts` 完整重写。 |
| `src/sessions.ts` | 单一日志恢复原则。 | 未复制；`src/conversations.ts` 原创。 |
| `setup/agent-config.ts` | 一手资料、短确认、上下文延续原则。 | 未复制；`src/research-prompt.ts` 重写。 |
| `setup/create-agent.ts`、`setup/update-agent.ts` | 沿用本 demo lifecycle。 | 未复制 Claude provisioning。 |

## Vercel Chat SDK

- 官方说明：[Web adapter](https://chat-sdk.dev/adapters/official/web)，
  [Markdown 文档](https://chat-sdk.dev/adapters/official/web.md)。
- 核对点：getUser、thread ID encode/decode、persistMessageHistory、useChat/transport、
  thread.post、request abort。Web response 与 Platform run 是不同生命周期。
- 官方示例使用 `chat`、`@chat-adapter/web`、`@chat-adapter/state-memory` `4.34.0`。
  npm 已确认该版本存在及 peer ranges；当日最新为 `4.41.1`。
- [vercel/chat](https://github.com/vercel/chat) main head 当日为
  `4b458b4c345ee61056fa4d4d6877593dc2a38107`；未从此 head 复制库实现。
- 使用已发布包，不复制 adapter 内部源码，不依赖未经核对的 tool/data parts。

## ZooWork SDK 与契约

- 已下载并读取 npm `@zoowork-ai/sdk@0.9.0` 的 client 类型、相关实现、events 类型/实现和 exports。
- [SDK v0.9.0](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/releases/tag/v0.9.0)。
- 公共文档快照 `83ab0521fcb45db13f993d327abf001636ef9e7a`：
  [Agents](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/agents.md)、
  [Tools](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/tools.md)、
  [Sessions](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/sessions.md)、
  [Events](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/events.md)。
- 核对重点：canonical persona docs、tool allow/deny、write-once metadata、Agent-nested Session、
  字符串输入、idempotency、input/run anchor、tool phases、分页、opaque cursor 和 interrupt。
- preview、typed citations、完整 tool result 和可靠费用显示不作为首版已发布能力。

## Platform gateway

- ECAP main 快照：`4184093a8214cd2244f752616aac64ce23e6923f`。
- [Project-key router](https://github.com/SerendipityOneInc/ecap-workspace/blob/4184093a8214cd2244f752616aac64ce23e6923f/services/claw-interface/app/routes/service_api/router.py)。
- [Agent access](https://github.com/SerendipityOneInc/ecap-workspace/blob/4184093a8214cd2244f752616aac64ce23e6923f/services/claw-interface/app/routes/service_api/_agents.py)。
- 相关边界：gateway 派生 ownership，校验 Project/owner，转发 Agent 下的 Session；
  不新增 Engine 直连，不借其他 Project 的 Agent。

## 实施时核对的输入关联

真实 staging 首轮暴露公开 event ID 和内部 inboundMessageId 不同。
只读核对本机 Engine 快照 `9e1dd474ee8146571ac6e758803e53e7ea5c125f` 的
`packages/storage-pg/src/public-session-events.ts`、`services/controld/src/peripheral/sessions-api.ts`、
`services/agent-worker/src/workflows/session-observability.ts` 和 `activities/run-lifecycle-activities.ts`。
ledger ID 独立生成；run anchor 来自内部 inbound ID。因此首版依赖 app 单写入和 seq/input echo 关联，
不能宣称 SDK 提供二者直接 join。未修改或复制 Engine 代码。

source-reviewed、offline-tested、staging-verified 的具体范围见 [VALIDATION.md](VALIDATION.md)。
