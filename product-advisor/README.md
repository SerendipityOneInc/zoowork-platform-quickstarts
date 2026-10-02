# Product Advisor

一个完整的 Platform remote MCP 示例。用户输入预算和使用需求，取得目录候选和推荐卡，选择商品进行参数比较，再在同一会话调整条件。价格、参数和推荐理由来自成功 MCP 调用的远程 snapshot。

示例包含笔记本、显示器、耳机，每类 6 条自制商品。所有型号、价格、参数和插图均为 synthetic data，没有真实购买链接或市场报价。未提供的参数显示“目录未提供”，不当作满足硬条件。

## 安装与离线检查

需要 Node **22.20+**、npm。本目录独立安装，不需要 sibling repositories 或本地 SDK override。

```sh
npm ci
npm run check
npm run build
```

`check` 运行 TypeScript 和离线测试。测试通过官方 MCP client 调用实际本地 HTTP Server；Platform 的 lifecycle、events 和 approvals 使用 test-only adapter，不花费 model tokens。`check` 不依赖 credentials 或 staging。

没有 Project key 时，`npm run dev` 可以打开界面，显示“服务尚未配置”，不会生成模拟推荐。

## 先验证 MCP Server

```sh
# Terminal A，在本目录运行。
npm run mcp:dev
# Terminal B
npm run mcp:probe -- http://localhost:4311/mcp
```

默认监听 `localhost:4311`。probe 验证 initialize、三个工具的 discovery、实际 search、preview 中的短 receipt 和完整结果读取。它只验证 MCP Server，不证明 Platform 能访问 localhost。

| 工具 | 输入 | 结果 |
| --- | --- | --- |
| `search_products` | category、CNY minor units 预算、typed filters、可选 model query、limit | 筛选后的摘要：价格、核心参数、total、版本和 receipt |
| `get_products` | 1–4 个 product IDs 和 exact catalogVersion | 完整事实，未知值保留 null |
| `compare_products` | 同类别 2–4 个 IDs、exact version、可选 attributes | 原始参数矩阵，包含每个商品的值 |

金额用整数分表示：6500 元传 `650000`。工具不接收用户身份或任意外部 URL。比较不做推测评分，模型负责排序，应用负责验证事实。

## 让 Platform 访问目录

Engine 从远端执行 MCP，不能访问浏览器或开发者电脑的 localhost。当前 Project-key 路径支持公开、无需认证的 HTTP MCP，不能通过 public gateway 配置 authenticated MCP credentials。这个 Server 因此只提供可公开的 synthetic facts。

准备一个**经过授权**的 Node host 或临时开发 tunnel，使以下路径在同一固定 HTTPS origin 可达：

- `POST /mcp`：stateless Streamable HTTP，支持 JSON response。
- `GET /health`：目录版本和 synthetic 标记。
- `GET /evidence/:receiptId`：读取已执行结果，不执行新工具。
- `/unavailable/mcp`：没有 handler，返回 404，供受控故障验证。

TLS proxy 必须保留 `Accept`、`Content-Type`、`MCP-Protocol-Version` 等 MCP headers 和请求 body。不能把 `/mcp` 重定向到登录页或另一个 origin。若使用路径前缀，proxy 必须一致转发 evidence 路径。Engine 仍会执行 egress/DNS 校验。

本仓提供独立 MCP Docker image；下面是构建和运行方法，不会自动部署：

```sh
docker build -t product-advisor-mcp .
docker run --rm -p 127.0.0.1:4311:4311 \
  --mount type=volume,src=product-advisor-catalog,dst=/app/.local \
  product-advisor-mcp
```

镜像以非 root 用户运行，volume 保存 receipt 和私有审计。容器内监听 `0.0.0.0:4311`，host 端口只绑定 loopback。公开托管时由授权的 TLS proxy 转发。可用 `MCP_ALLOWED_HOSTS` 约束 Host；incoming Origin 默认拒绝，需要 browser MCP clients 时用 `MCP_ALLOWED_ORIGINS` 允许指定值。Platform 的 server-to-server 请求通常没有 Origin。

确认 public endpoint 后，运行 `npm run mcp:probe -- https://your-authorized-host.example/mcp`。这仍是本机 read probe；实际 Platform turn 才能证明 Engine 接通。

## 运行真实选购应用

```sh
cp .env.example .env
# 填写服务端 ZOOWORK_API_KEY、明确的 ZOOWORK_BASE_URL、MCP_PUBLIC_URL。
# 设置一个至少 32 字符、重启保持不变的 APP_COOKIE_SECRET。
# 默认 APP_ORIGIN=http://localhost:4310。
npm run setup
npm run dev
# 浏览器打开 http://localhost:4310
```

`ZOOWORK_API_KEY` 必须是 Platform Project key（`zwp_live_`）。gateway 决定 Org/Project/owner，应用不传任意 tenancy。setup 创建本应用 Agent，`.local/agent.json` 保存 exact resource、create key 和返回 ID；再次运行会复用记录。不要填现有 Work Agent 的 ID。

Agent 声明 `catalog` MCP Server、direct exposure 和三个 exact tools。搜索是 `always_allow`；详情/比较是 `always_ask`，同时显式配置源代码支持的 `requireConfirmation: true`。该字段比 SDK 0.9.0 的 nested type 新，代码通过 structurally compatible object 交给 published SDK 序列化，未替换 SDK。部署若不支持强制确认，功能 staging 会失败，不能宣称审批通过。

配置 URL、model 或 persona 改动后，先停止本地应用，再执行：

```sh
npm run configure
npm run dev
```

configure 验证 owned labels，先保存 exact pending resource，再发送 update。结果不明确时继续用相同 pending resource 恢复，不把新 env 配置当作已应用。不要在进行中的会话里修改 Agent。

production build 的本机启动方式：

```sh
npm run build
npm start
```

`APP_ORIGIN` 是浏览器使用的 exact origin，写 API 检查 Origin；默认 `localhost`，不要混用 `127.0.0.1`。`APP_HOST` / `PORT` 控制 server listen。Web 应用公开托管另需正式认证、HTTPS、访问策略和运维配置；当前 cookie 只是本地 demo 的访客归属。

production server 和离线 UI harness 的页面、静态资源按每个 IP 每分钟 300 次限流，超出时返回 429 和 `Retry-After`。API 和 SSE 不计入这个页面限制。

## 可以完成的流程

1. 选择“笔记本 · 6500 元”示例，输入办公/编程需求和最低 16 GB 内存。实际搜索排除超过预算、内存不足和不可选购的商品。
2. 查看最多三个推荐。卡片展示目录价格、预算差额、已知参数、unknown 和数据依据；商品事实由 receipt 填充，不采用模型抄写的价格。
3. 点击完整参数，在原生审批里允许这次或拒绝。也可以勾选 2–4 件同版本商品，发起比较并批准，查看远程参数表。
4. 追问“预算降到5000元”。后端同步明确的 budget 变化，模型按新条件搜索，新推荐必须满足新预算。先前 snapshot 保留原始条件和价格。
5. 展开底部“查看 MCP 调用记录与请求 JSON”，查看工具名、实际参数 JSON、等待审批/已返回/未执行状态和 receipt。debug 保持简洁的折叠文本样式；离线预览注明 Platform 事件为模拟。
6. 刷新后从会话历史恢复。会话、工具状态、审批、比较选择和证据保存在 SQLite；相同 cookie secret 保持访客身份。

表单是应用确认的硬条件。自然语言中明确的数字预算、内存和重量约束也会同步；其他含糊变更需要澄清或修改表单。模型没有严格 JSON output API，最终 block 无效时仍显示已有候选，并说明未形成可验证推荐，不自动发起付费修复回合。

## 审批与故障恢复

| 状态 | 应用行为 |
| --- | --- |
| tool phase=blocked | 尚未执行；等待同 Session 的原生 approval |
| resolve 返回 signaled / 202 | 显示“决策已提交”，继续等 approval resolved、tool end 和 run.finished |
| 拒绝 / 超时 | 不调用本地替代工具，不取被拒绝操作的 receipt；保留成功 search 的摘要 |
| 审批响应不明确 | 保存原 decision，只能重新提交原决策；禁止切换另一决定 |
| approvals API 为 501 | 显示原生审批不可用，停止等待；不能模拟批准 |
| MCP connection/authentication failed | 明确目录故障；没有新 evidence 时不产生新推荐 |
| receipt 缺失或过期 | 保存 hydration job，有限 read retry 或显式重新读取 |
| 发送结果不明确 | 保留原请求和 key；“恢复本次发送”复用 exact body，不新建 paid turn |
| event stream 中断 | cursor resume + REST replay；按 seq 去重，start/end 按 toolCallId 配对 |

receipt 远程保留至少 24 小时；应用读到后保存本地 snapshot，历史不依赖远程永久可达。Engine 的 resultPreview 当前最多 512 字符，receipt 放在 structuredContent 前部；后端只从实际成功 tool-end event 提取受限 ID，读取固定 origin 的 evidence endpoint。模型写出的 receipt 或 URL 不能替代成功事件。

新一轮推荐还必须引用本轮成功调用的 receipt。连接失败时，之前的 snapshot 仍可查看，但不能据此生成新推荐。同一会话的并发追问只接受一个，其余返回进行中状态，不覆盖已保存的请求。

public receipt 只含 synthetic facts，没有 user text、visitor、Session、runtime context 或 key。私有 audit 只留有限 runtime coordinates；context 用于关联调用，不是认证。浏览器不收到 key，也不能指定任意 Agent/Session/actor。

## 离线浏览器验证

```sh
npm run build
npm run test:ui
# http://localhost:4390
```

这是 test-only harness：Platform lifecycle/events/approvals 为 mock，目录来自实际 HTTP MCP，不使用 key。它明确标记离线，不属于 `npm start` bundle，也不会作为真实运行的 fallback。可演示选购、拒绝、批准比较、预算追问、刷新和响应式界面。它不证明真实 Platform 的 MCP 或 approval 部署效果。

## Staging 和清理

仅在已有明确授权时运行。foundation smoke 用 1 个临时 Agent/Session 和 1 个 model turn，不依赖目录，不算 feature evidence：

```sh
npm run test:staging -- --confirm-staging
```

功能验证需要已获授权的 public endpoint 和同一 MCP 实例的私有 audit DB（`MCP_AUDIT_DB`），用于核对拒绝后实际调用数为零：

```sh
npm run test:feature-staging -- --confirm-staging
```

它最多创建 1 个临时 Agent、2 个 Sessions、4 个 user turns：搜索+批准详情、降低预算、搜索+拒绝详情、同测试 Agent 的 unavailable endpoint。比较在离线 HTTP 集成和浏览器中覆盖；脚本不会把它称为 live comparison。不自动重试 paid turns。缺少 approval、receipt 或 runtime audit correlation 都判失败。

```sh
# 先停止本地 Web 服务，再清理记录的 Sessions 和 Agent。
npm run cleanup
# smoke/feature 清理失败时，用脚本输出的 exact filename：
npm run cleanup -- feature-<recorded-instance>.json
```

清理只用 ledger 中的 IDs 和匹配的 Agent labels，Session metadata 也必须匹配。创建结果不明确或删除失败时保留恢复状态，不能扫描 Project 选择资源、删除 `.local` 或自动换 Agent。SQLite 保留到 Agent stop/delete 成功后再清除对应会话。

## 结构与验证记录

- `mcp/`、`data/`：独立 readonly MCP 和自制目录。
- `src/server/`：SDK 会话、native approvals、receipt hydration、同源 API。
- `src/storage/`：SQLite conversation ledger、receipt/audit store。
- `src/ui/`、`public/products/`：业务界面、自制 SVG。
- `test/`：domain、HTTP MCP、approval、delivery recovery、ownership、foundation。
- [PLAN.md](PLAN.md)：范围、平台来源、完成标准。
- [VALIDATION.md](VALIDATION.md)：实际结果和仍需 live 验证的项目。
- [REFERENCES.md](REFERENCES.md)：protocol/source snapshots。
