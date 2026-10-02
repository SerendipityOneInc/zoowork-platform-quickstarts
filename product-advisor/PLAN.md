# Product Advisor 实现方案

状态：Finn 已在本 session 说“开搞”，进入实现。应用与独立 MCP 已实现，离线和浏览器检查见 VALIDATION.md；public endpoint 和实际 feature staging 仍需单独核验。

更新日期：2026-10-01。技术重点是 remote MCP。用户给出预算和需求，搜索示例商品目录，比较参数，获得有证据的推荐清单，并在同一会话继续调整条件。

## 1. 上下文与范围

已完整读取 workspace 和本仓 AGENTS.md、docs/HANDOFF.md、docs/OUTLINE.md、docs/PLATFORM.md、本目录原 README/PLAN、共同 session prompt 和 product-advisor handoff。本目录没有额外的 nested AGENTS.md。

- PR [#19](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/pull/19) 核对时为 OPEN；fetch 后的 head 与 PR 一致，为 `cd932491bcf98eddb7e6650375b6586565c911c5`。
- 独立 worktree：`/Users/wangfulong/src/zoo/.worktrees/product-advisor`。Branch：`feature/product-advisor-plan`，从上述实际 head 创建。
- 实现前的基础只有 SDK `0.9.0` 的 Agent setup/status/cleanup、恢复状态和 lifecycle staging smoke，没有商品业务或 Web UI。
- 后续只修改 `product-advisor/`；独立安装，不 import 其他应用或本机 SDK 源码。
- 开发前重新核对 #19。已合并则以最新 main 为集成目标；仍开放则 feature PR base 使用 `feature/platform-demo-handoffs`。不自动 reset、stash 或 rebase 本机状态。

首版提供笔记本、显示器、耳机三个示例类别，每类 6 条 synthetic records。品牌、型号、价格、参数和图片都使用自制内容，界面明确标记“演示商品数据”。其他类别说明尚未接入。完整用户任务结束于 shortlist、比较和来源详情；示例数据没有真实购买能力。

## 2. 已核实的 Platform 能力

下面来自已发布 SDK、当前公开 gateway source 和官方文档。源码支持不等于本应用已经通过部署验证。

| 能力 | 核实结果 | 本应用如何使用 |
| --- | --- | --- |
| Project key | `zwp_live_`、`/service/v1`；gateway 注入 owner/Org/Project | key 只在 Node 后端；setup 创建本应用 Agent |
| Remote MCP | `resource.mcp[]`；HTTP/SSE；禁止 stdio、loopback/private address 和 redirect | public HTTPS `/mcp`；Streamable HTTP |
| MCP 认证 | credential-write route 被 gateway 拒绝 | synthetic read-only catalog；不设计 bearer/OAuth 接入 |
| 工具选择 | toolFilter 为原始工具名；exposure 为 direct/deferred | 三个固定工具逐个列出，使用 direct |
| 审批 | permission/tools 与工具暴露分别配置 | search 自动执行；详情、比较原生审批 |
| 审批 API | listApprovals/resolveApproval；部署可能返回 501 | 按 Session 校验后 allow-once/deny，不伪造成功 |
| 会话 | createSession、postEvents、持久事件及 cursor resume | 保存业务状态，承接追问和恢复 |
| 输出 | durable agent.assistant，不是逐 token append-delta | 显示真实进度，完整消息段提交后再解析 |
| 工具结果 | agent.tool 只公开 resultPreview；当前 Engine 上限 512 字符 | 通过短 receipt 读取远程完整结果 |
| MCP 故障 | agent.error；失败 catalog 可能让工具缺席 | 连接状态、工具结果、turn outcome 分别处理 |
| Environment/Skills | Project-key router 无 top-level 管理路由 | 使用默认 environment，不添加这类 setup 前置条件 |

服务器名用 `catalog`，不含 underscore。MCP endpoint 不需要 ZooWork Project key，应用绝不向它发送这个 key。

## 3. 用户流程与界面

首页提供类别、预算上限、需求文本和三个可编辑示例。例如“预算 6500 元，办公和编程，经常带出门，至少 16 GB 内存”。币种固定 CNY，预算不能为负数或超出约定范围。

也允许只输入自然语言。缺少预算/类别，或文字与已选条件冲突时，先澄清。“本轮条件”显示解析结果。明确输入的预算和参数直接采用；只有含义不清、条件冲突或需要放宽硬条件时才请求确认，避免隐藏地修改预算。

搜索成功后先展示候选卡片，再形成最多 3 个推荐。卡片包含商品名、自制图、目录价格、预算差额、关键参数、匹配依据、取舍、来源记录和目录版本。用户可选 2–4 个同类别商品加入比较。

比较表按需求选择参数行。未知值显示“目录未提供”，不估计，也不当作满足硬条件。追问“降到 5000”“更在意重量”“比较前两个”沿用同一 Session。新结果记录新条件；旧结果保留原条件和版本。

| 界面区域 | 内容 | 交互 |
| --- | --- | --- |
| 顶部 | 应用名、演示数据标记、目录连接状态 | 新会话、恢复历史 |
| 需求区 | 类别、预算、文本、本轮条件 | 提交、确认变更、编辑 |
| 主结果区 | 推荐、候选卡、参数表、不满足的条件 | 加入/移出比较、查看详情和依据 |
| 对话区 | 澄清、各轮结论、追问输入 | 继续同一 Session，运行时可停止 |
| 内联审批 | 服务、工具用途、参数、等待时限 | 允许这次、拒绝；提交后等待执行状态 |
| 折叠诊断区 | 工具 phase、toolCallId、failure kind/reason | 开发者检查执行证据 |

桌面用结果区与对话侧栏；窄屏按需求、结果、对话顺序排列，参数表允许横向滚动。提供键盘操作、明确焦点和 aria-live 状态更新，不能仅靠颜色区分错误。图片为自制静态资源。

空结果显示哪些条件没有匹配及可调整项。放宽预算或参数需要用户确认。没有成功 evidence 时不展示预填推荐；技术日志不代替结果。

## 4. 技术结构

一个独立 npm package：Node 22.20+、TypeScript、React + Vite、Express、SQLite。实施时选择并 pin 支持 Node 22 的已发布 SQLite driver，其他依赖也先核查 engines，再写本目录 lockfile。

ZooWork SDK 保持 `@zoowork-ai/sdk@0.9.0`。MCP 使用已发布 `@modelcontextprotocol/sdk@1.29.0`，与当前 Engine consumer 一致，不依赖上游 main 的 v2 API。

```mermaid
flowchart LR
  U[Browser] --> B[Node backend]
  B --> D[(Conversation and evidence state)]
  B --> G[claw-interface /service/v1]
  G --> P[Platform Agent / Session]
  P --> M[Remote catalog MCP /mcp]
  M --> C[(Synthetic catalog and receipts)]
  P -->|durable events| B
  B -->|read successful receipt| M
  B -->|validated cards and comparison| U
```

浏览器只访问应用后端，不接收 key、不直连 Platform/MCP。后端负责会话归属、SDK、审批、事件恢复和业务结果。Platform 负责模型运行、MCP discovery/call 和审批暂停/恢复。商品 Server 是独立进程；应用进程不执行替代商品工具。

应用 API 使用自己的 conversation ID，服务端查表取得 Agent/Session。计划提供会话创建/列表/详情、messages、events、approvals、compare 和 interrupt 接口。compare 将已校验的 ID 转成同一 Session 的用户请求；它不能直接执行目录函数。events 只输出当前访客有权读取的业务状态，所有写接口检查同源请求，cookie 使用 HttpOnly 和 SameSite，HTTPS 托管时启用 Secure。

```text
product-advisor/
  src/agent.ts              Agent persona、MCP、tool policy
  src/platform.ts           已有 lifecycle/recovery helpers
  src/server/               browser API、ownership、SDK adapter、event worker
  src/domain/               requirements、evidence、cards、comparison、校验
  src/storage/              SQLite schema、repositories、恢复任务
  src/ui/                   React 页面与组件
  mcp/server.ts             Streamable HTTP、health、receipt read API
  mcp/catalog.ts            search/detail/compare 的真实逻辑
  data/catalog.json         三类各 6 条 synthetic 商品
  public/products/          自制图片与来源页资源
  scripts/                  lifecycle、configure、MCP probe、staging 验证
  test/                     offline domain/API/contract/recovery tests
  .local/                   ignored IDs、SQLite、恢复和本机审计记录
  README.md / PLAN.md / REFERENCES.md
```

计划命令：npm ci、check、build、dev、start、mcp:dev、mcp:start、mcp:probe，保留 setup/status/cleanup，并添加显式 configure。MCP 单独构建/启动，托管时支持 PORT 与专用 host 配置。

现有 runtime() 的 180 秒 main phase 用于 CLI/smoke，不能当 Web 进程的 client 生命周期。应用 adapter 使用请求级 deadline、每次 stream 的 AbortSignal，以及有上限的只读重连。浏览器断开不重复发用户输入，也不结束等待审批的 Platform run。

## 5. MCP Server 和示例商品

### 数据约定

每条商品包含 productId、category、name、整数分 priceMinor、currency=CNY、类型化 specs、availability、imagePath、sourcePath、catalogVersion、updatedAt、synthetic=true。预算判断用整数，UI 才格式化为元。各类别分别定义参数 schema，不混用单位。

下面是拟定笔记本 fixtures，不代表真实商品。实际 JSON 在“开始实现”后编写。

| ID / 名称 | 示例价（元） | RAM | 重量 kg | 示例续航 h | 用途 |
| --- | ---: | ---: | ---: | ---: | --- |
| lap-01 / 行简 14 | 5299 | 16 GB | 1.25 | 10 | 轻便、预算内 |
| lap-02 / 码途 14 | 6299 | 32 GB | 1.42 | 8 | 内存优先的取舍 |
| lap-03 / 轻行 Air | 6999 | 16 GB | 1.10 | 12 | 超过 6500 的排除例 |
| lap-04 / 实用 15 | 3999 | 8 GB | 1.80 | 7 | 不满足最低 RAM |
| lap-05 / 行简 Lite | 4799 | 16 GB | 1.35 | 未提供 | unknown 不能满足续航硬条件 |
| lap-06 / 码途 Max | 5999 | 32 GB | 1.65 | 9 | 同预算的不同取舍 |

显示器主要字段是尺寸、分辨率、刷新率、USB-C power；耳机是类型、重量、续航、ANC、连接方式。每类包含未知参数、预算边界和 unavailable 记录。搜索/详情/比较都读取同一份 versioned catalog。

### 工具契约

| 原始工具名 | 输入 | 输出 | 边界 |
| --- | --- | --- | --- |
| search_products | category、可选 query、maxPriceMinor、typed filters、limit | 候选摘要、total、version、receiptId | limit 默认 6、上限 12；hard filters 实际执行，排序稳定 |
| get_products | productIds、catalogVersion | 完整记录、unknown fields、receiptId | 1–4 个 ID；不存在的 ID/version 明确报错 |
| compare_products | productIds、catalogVersion、attributes | 同类别参数矩阵、字段来源、receiptId | 2–4 个 ID；不添加推测事实 |

input/output schema 做运行时校验，工具声明 read-only annotations，但 annotations 不是访问控制。无匹配返回成功的空列表；非法参数/unknown ID 与连接失败区分。输出数量、字节数和字符串长度都有上限。

使用官方 Streamable HTTP transport，首版为 stateless request handling 和 JSON response；initialize/list/call 仍由官方 SDK 处理。GET /mcp 若不提供独立 SSE channel，可按协议返回 405。离线测试必须启动真实 HTTP server，用 MCP client 完成 initialize、tools/list、tools/call。

### 完整结果与 receipt

durable tool event 只有短 preview。当前 Engine 对 structuredContent 的归一化是 `structuredContent:\n` 后的 formatted JSON，会替换 mirrored content。仅在 content 加一段前缀不能保证 preview 保留它。

MCP 成功结果把 receiptId、catalogVersion、tool 放在 structuredContent 最前面，保证标识完整落在前 200 字符内，后面才是商品数据。content 同时提供同一结果的 JSON text，兼容普通 MCP clients。

Server 返回成功前持久化 immutable snapshot，提供 GET /evidence/:receiptId。这条 API 只能读已经执行的结果，不能通过 query 参数执行搜索/比较。公开响应仅含 synthetic 商品事实和版本，不含用户原文、身份、Session ID 或 runtime context。receipt ID 随机且不可预测，但 endpoint 仍然公开，不能用于私有业务数据。

应用只从本 Session 的 mcp__catalog__* 成功 end event 提取短 ID，向配置固定 origin 的 /evidence/ 读取。不能接受模型生成的 URL；只识别受限格式的 receipt 标识，不对截断 JSON 整体 JSON.parse。完整数据校验 schema、tool、catalogVersion 和商品 ID 后入库，关联对应 toolCallId。

详情/比较结果的 ID 集合必须与已持久化 start args 一致；搜索返回的商品再次按已确认硬条件校验。receipt 标识、未知 URL 或模型写出的商品 ID 本身都不是成功执行的证据。

receipt read 暂时失败可有限重试，因为它只读取已执行结果，不触发另一次 tool call。Server 首版 retention 至少 24 小时，托管需要持久 volume。应用成功读取后保存自己的 snapshot，历史不依赖 remote receipt 永久存在。404/过期或缺少 receipt 时标记“结果数据未取得”，不拿新目录数据冒充原结果。

这是应用与示例 Server 的协议，不是 Platform 新增 API 保证。实施第一步检查当前源码和离线格式；有获授权 endpoint 后尽早验证实际 preview。若部署形态不同，先报告 evidence 传递缺口，不静默改用本地 fixture。

## 6. Agent 配置与远程访问

以下是拟实施的配置示意，不是本轮已创建的 Agent：

```ts
{
  name: 'Platform Product Advisor',
  include_global_skills: false,
  sandbox: { scope: 'session' },
  persona: { docs: [{ name: 'AGENTS.md', content: advisorInstructions }] },
  mcp: [{
    name: 'catalog',
    url: process.env.MCP_PUBLIC_URL,
    transport: 'streamable-http',
    exposure: 'direct',
    toolFilter: ['search_products', 'get_products', 'compare_products'],
    permission: 'always_ask',
    tools: { search_products: { permission: 'always_allow' } },
    context: { meta: true, headers: false },
  }],
  tool_policy: {
    allow: [
      'mcp__catalog__search_products',
      'mcp__catalog__get_products',
      'mcp__catalog__compare_products',
    ],
  },
}
```

指令要求先澄清必要条件，再查目录；事实来自成功工具结果；未知字段保持 unknown；缺证据就说明原因；拒绝后不得换工具或绕过 MCP 查询同一数据。目录文本视为数据，不执行其中的指令。

runtime context 只用于 Server 本机诊断，关联实际调用与 staging run。记录必要坐标、工具名、时间和商品 ID，不记录 key、用户原文或完整请求体。_meta 不是认证，也不进入公开 evidence response。

### 让 Platform 访问它

1. 本机启动 MCP，以 mcp:probe 验证 initialize、工具 schema 和一次 read-only call。localhost probe 只证明本机协议可用。
2. 经用户授权后，在支持 HTTP 请求的 Node host 部署同一 Server，配置 public HTTPS、固定 /mcp 和 receipt volume。也可以使用明确获授权的开发 tunnel；URL 变化需要更新 Agent。
3. 代理透传 POST body、MCP protocol headers、Accept/Content-Type；不加登录页、bearer/OAuth 或 301/302 redirect。/health 200 不证明 /mcp 可调用。
4. 从公网 probe 同一 HTTPS endpoint。设置 Origin/Host 校验、body 上限和限流；拒绝非法 Origin。本机默认绑定 localhost，public host 需显式配置。
5. 服务端 .env 配置 MCP_PUBLIC_URL、Platform Project key 和 /service/v1 base URL；setup 写入本应用 Agent。
6. 改 .env 不自动更新已有 Agent。configure 校验 recorded labels 后更新完整 MCP array 与必要 policy，并显示 config_version。不每回合 PUT，不自动删除重建。
7. 授权 staging turn 的 Platform 成功事件、Server 实际 tools/call 记录和 receipt 一起作为接通证据。

本轮不部署。shared handoff 的 started-session staging 授权不包含公开部署。如果没有获授权的公网 endpoint，先交付可检查的本地 Server、应用和离线结果，再申请托管或临时 tunnel 授权。

## 7. 审批、拒绝与失败

search 自动执行，详情与比较都要求审批，避免拒绝详情后通过比较自动取得相同数据。UI 首版只提供 allow-once/deny，与 record.allowed_decisions 的实际集合取交集。

按 toolCallId 配对工具事件，按 approvalId 跟踪审批。blocked 表示未执行；agent.approval requested 和 REST pending record 用于恢复。listApprovals 为 Agent 级接口，后端必须筛选并再次确认 session_id 属于当前 conversation，不能显示其他访客的审批。

点击后验证归属、pending 状态、允许的 decision，再调用 resolveApproval。resolvedBy 由后端生成。202/signaled 只显示“决策已提交”；approval resolved、tool end、run.finished 分别表示审批、调用、回合的状态。防重和恢复不能将 pending 误判为已执行。

deny 后提示“本次查询已拒绝，尚未获取这些参数”，保留已成功取得的搜索摘要，不填被拒绝工具应返回的字段。模型可以根据已有事实说明下一步或结束。对于重复请求相同被拒绝意图，应用停止本轮，等用户新的明确操作；不自动 approve，不执行本地替代工具，也不通过 receipt API查询。Platform deny 不限制公开 endpoint 的其他调用者，所以 Server 只能含 synthetic data。

| 情况 | 用户状态 | 恢复 |
| --- | --- | --- |
| mcp_connection_failed | 无法连接目录，没有本轮新依据 | 保留输入/旧结果；检查公网 URL，用户确认后再查询 |
| mcp_authentication_failed | 目录要求了当前 Platform 不能提供的认证 | 修正 Server/proxy；不让用户在浏览器填 key |
| 单次 tool isError | 哪次失败及受影响字段 | 其他成功结果仍可看，失败字段不进推荐 |
| 成功空列表 | 没有符合条件的商品 | 用户选择是否放宽 |
| 审批过期/已处理 | 该审批不能再提交 | 刷新 pending 与历史，不向新调用发旧 approval |
| approvals 501 | 当前部署没有原生审批 | 停止详情/比较，报告缺口，不自动放行 |
| stream 断开 | 正在恢复本轮状态 | cursor resume/REST replay，不重发 user.message |
| receipt 缺失/过期 | 工具已执行，但完整数据未取得 | 保存 hydration job，有限读重试或显式重新查询 |
| key/owner/billing 错误 | 服务端配置或额度需处理 | 保留会话，给出对应操作，不自动重试付费回合 |

agent.error 不是回合结束，run.finished=succeeded 也不表示所有工具成功。catalog 失败可能让工具直接缺席而模型仍回复，没有成功 evidence 就不能显示“已为你搜索”。

failed catalog 的重试可能受 config pin/TTL 影响，不承诺立即恢复，不自动 bump config_version；修正 endpoint 后通过显式 configure 或后续确认查询验证。

## 8. 会话、恢复和事实校验

本机单实例 demo 使用服务端随机访客身份与签名 HttpOnly cookie，secret 留在 .env，重启保持一致。SQLite 保存 visitor → conversation → recorded Agent/Session 映射。history/events/messages/approval/comparison 都检查归属，浏览器不能指定任意 Agent/Session 或 actor identity。这只提供 demo 的会话归属；公开应用另需正式认证。

保存 typed requirements、durable events、cursor、tool/approval state、完整 evidence、shortlist、比较选择和 pending operations。需要的 actor.ref 从后端验证的访客身份生成；它是 memory attribution，不代替 authorization。只开放三个目录工具、禁用 global skills，并采用 session sandbox scope。

createSession body/key 和 user.message event idempotency_key 在发送前持久化。超时或重启先恢复已记录资源；必要的请求恢复沿用原 body/key，不创建第二个业务会话。ambiguous create 和 failed cleanup 状态保留。

event worker 独立于 browser SSE。按 Session+seq 去重，在同一 SQLite transaction 保存 event/projection/cursor；未 hydrate 的 evidence 保存独立 job。重放、并行事件、重启和多 tab 不能重复生成卡片/提交审批。只读重连不等于付费输入重试。

### 推荐依据

不假设 Platform 提供严格 JSON/schema response 模式。persona 要求最终消息包含约定 product-advisor-result JSON block：类型、product IDs、receipt IDs、reasonCodes、澄清项。unknown caveats 由应用按事实生成。模型决定排序，应用校验可以展示的事实。

商品必须来自本 Session 成功 search evidence。price/specs/image/source 由 remote snapshot 填充，不信任模型抄写。理由使用有限字段谓词，如“价格在已确认预算内”“RAM ≥ 16 GB”“重量 ≤ 1.5 kg”，应用核实后按事实生成句子。未知或不支持的理由不能进卡片。

硬条件不满足或关键字段 unknown 的商品，不能列为满足全部条件的推荐，可单列“需要确认/放宽条件”。比较前检查商品属于已有 evidence 和同版本，再在同一 Session 请求 remote compare。本地仅排列已取得字段，不冒充新的 MCP comparison。

模型格式不合法时不自动发起付费“修复 JSON”回合，显示已验证候选和“本轮尚未形成可验证推荐”，由用户明确选择重新整理。原文保留在诊断/历史；未校验的价格、性能和推荐结论不直接渲染为商品结果。

## 9. 实现步骤

1. 固定 schema、SDK adapter 与成功/失败事件 fixtures。先实现最小 MCP initialize/list/search 和 receipt round-trip，验证 preview 短标识。获授权 endpoint 后尽早检查 actual deployment；不符合预期先报告。
2. 完成 18 条数据、自制资源、search/detail/compare、receipt store、health、限流和 hosting 文档。离线必须使用实际 HTTP MCP client。
3. 完成 Agent 配置/configure、SQLite、访客归属、create/post 幂等、event worker、pending approval 恢复、evidence hydration 和停止操作。
4. 完成需求/澄清、候选/shortlist、来源、比较、追问、审批、空结果/拒绝/连接失败、刷新与恢复。offline UI fixtures 与 live 运行明确区分。
5. 完成独立安装、check、build、浏览器检查，以及 README/env example/walkthrough/cleanup/本应用 REFERENCES。
6. 在“开始实现”后，用 handoff 的 bounded staging 授权和获授权 endpoint 验证真实 remote call、允许/拒绝、故障和恢复。基础 lifecycle smoke 不算功能证据。
7. 复核 PR base，按 Finn 身份提交一个完整 feature PR，分别列出 offline checks、staging evidence 和限制。公开部署另需授权。

没有公网 endpoint 时可以先完成步骤 2–5，但步骤 6 未通过就必须明确报告，不能宣布完整功能已验证。

## 10. 完成标准

### 用户任务

- 浏览器完成输入、search、推荐卡、依据、参数比较和追问。
- 6500 元/最低 16 GB 的示例排除 lap-03/lap-04；参数与 receipt 一致。增加续航硬条件时 unknown 不能通过。
- 降低预算后新 shortlist 符合新预算；旧结果保留原条件。刷新和重启恢复会话、比较选择与 pending approval。
- 拒绝详情/比较时对应 remote tools/call 为 0；保留搜索摘要，不显示未取得字段。
- Server 不可达、空列表、unknown 商品/参数、坏模型格式和审批不可用都有明确状态，没有无依据推荐。

### 离线验证

- 本目录 npm ci、npm run check、npm run build 独立通过，无 credentials、workspace links 或 SDK override。
- Domain tests：预算边界、单位、category isolation、unknown/unavailable、稳定排序、同版本比较、推荐 evidence 校验。
- HTTP MCP tests：initialize/list/call、schema rejection、structuredContent、receipt persistence/expiry、输出上限、非法 Origin。
- API/recovery tests：访客归属、其他 Session approval、allowed_decisions、202 pending、deny/501、幂等、交错事件、cursor replay、重启恢复。
- Browser tests：完整选购、追问、允许/拒绝、故障、键盘、窄屏、cookie 会话归属。关键拒绝断言要检查 Server 调用数，不只检查 UI。
- bundle/log 不含 key/secret；license/source 记录准确；文档链接和 Git whitespace 通过。

### Staging 验证

每个 verification run 最多 1 个临时 Agent、2 个 Session、4 个用户回合，优先少用。不自动重试付费回合，不读 production config。read probe、审批 resolution、lifecycle 与用户回合分别记录。

建议 Session A 第一回合 search → 批准详情/比较 → 验证 shortlist，第二回合降低预算；Session B 第一回合 search 后拒绝参数读取，最后一回合测试受控 unavailable endpoint。故障仅影响本测试 Server/Agent；必要时显式修改这个临时 Agent 的 MCP 配置，避免 healthy catalog pin 隐藏 discovery 失败。不能修改共享服务或超出回合预算。

证据包含无 credentials/隐私的摘要：recorded resource IDs、工具名、审批 phase、Server 关联调用计数、receipt/version、卡片一致性、turn outcome、stream/REST replay、cleanup 结果。deny 需同时核对审批事件和 Server 未执行记录。preview/approval/故障行为不符合目标部署时列为未通过，不能用 mock 替代。

多会话后扩展 state ledger，记录每个需清理的 ID。cleanup 只处理本 session 记录且 labels 匹配的资源，不扫描 Project 选择删除目标。失败保留 private recovery state 和精确恢复命令。

## 11. 核实来源与待验证项

2026-10-01 核查快照如下。其他仓库只读，没有同步其 checkout、修改文件或启动开发环境。

| 来源 | 快照和核实内容 |
| --- | --- |
| 本仓 handoff/Platform contract | cd932491bcf98eddb7e6650375b6586565c911c5，任务边界与 started-session 授权 |
| [SDK 0.9.0](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/blob/6e205a2ac68f20a274583fbdfc7dc2f7379097a9/src/client.ts) | Published v0.9.0，commit 6e205a2ac68f20a274583fbdfc7dc2f7379097a9；MCP、Session、REST approval |
| [Gateway router](https://github.com/SerendipityOneInc/ecap-workspace/blob/73cffba7f/services/claw-interface/app/routes/service_api/router.py) / [Agent routing](https://github.com/SerendipityOneInc/ecap-workspace/blob/73cffba7f/services/claw-interface/app/routes/service_api/_agents.py) | 73cffba7f；核查时 current main 4184093a8214cd2244f752616aac64ce23e6923f 的后续变化只涉及前端，相关 gateway 未变 |
| [MCP docs](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/mcp.md) / [permissions](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/permissions.md) / [events](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/events.md) | current main 83ab0521fcb45db13f993d327abf001636ef9e7a，读取 git snapshot |
| [Engine MCP mapping](https://github.com/SerendipityOneInc/zooclaw-engine/blob/bdfc79ec6a70a769255b8b4d4f0a24a43ab72c2b/services/agent-worker/src/activities/mcp-tools.ts) / [preview](https://github.com/SerendipityOneInc/zooclaw-engine/blob/bdfc79ec6a70a769255b8b4d4f0a24a43ab72c2b/services/agent-worker/src/activities/activity-message-helpers.ts) | current main bdfc79ec6a70a769255b8b4d4f0a24a43ab72c2b；structuredContent normalization、512 字符 preview、SDK consumer 1.29.0 |
| [Official MCP SDK v1.29.0](https://github.com/modelcontextprotocol/typescript-sdk/tree/e12cbd7078db388152f6e839abdbe09ba01f3f32) | tag commit e12cbd7078db388152f6e839abdbe09ba01f3f32；npm 确认已发布，engines Node ≥18 |
| [Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) | HTTP endpoint、POST/GET 与 Origin；实现交给官方 SDK |

公开 ZooWork HTML 文档本次通过 Web 工具不可达，改读官方仓库 current main。尚无本应用 staging evidence。第三方应用代码本轮没有复制；实施时若复用官方例子，先核对 LICENSE，在本目录 REFERENCES 记录 commit、路径和修改。

需要最早实测的三项是 receipt preview 格式、原生 approval 的允许/拒绝效果，以及已授权 public HTTPS endpoint 的可达性。数据和 UI 不依赖这些能力已经在当前 staging 部署完成这一假设。

## 实现补充

详情和比较逐次强制确认使用 `resource.mcp[].tools[tool].requireConfirmation: true`，同时保持 `always_ask`。Engine `mcp-permissions.ts` 对此渲染 `approval.required: true` 和 allow-once/deny。SDK 0.9.0 的 nested type 尚未声明该字段，本应用用 intersection type 传递原始 resource；source-reviewed 支持不能代替 deployment verification。

实现和已验证状态以 README.md、VALIDATION.md 为准。未授权公开部署时，不把本地 HTTP probe、test-only Platform adapter 或 foundation smoke 当作远程功能接通证据。

2026-10-02 按用户明确的交付要求补上默认 `npm run demo` 入口：只需填写 Project key，自动准备示例 MCP 的临时远程入口和本应用 Agent，不使用模拟 Platform。staging 的 1 Agent / 2 Sessions / 4 turns 已验证搜索、分别批准详情/比较、预算追问、拒绝零执行、连接失败、receipt/history 和清理。此验证范围使用已发布 SDK 0.9.0，无本地 SDK override。
