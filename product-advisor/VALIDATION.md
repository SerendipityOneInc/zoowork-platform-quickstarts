# Product Advisor validation

更新于 2026-10-02：已发布 SDK 0.9.0 的真实 feature staging 已通过，详见末尾。下面的初始检查表是 2026-10-01 的历史记录，当时未读取 Project credentials、执行 paid turn 或公开部署。

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| `npm ci` | PASS | 独立安装，136 packages，0 reported vulnerabilities |
| `npm run check` | PASS | TypeScript + 25 个离线 tests |
| `npm run build` | PASS | React/Vite client + compiled Node server/MCP + catalog data |
| 本地 `mcp:probe` | PASS | 官方 client 的 Streamable HTTP initialize/list/search 和 receipt read |
| 浏览器 1440×1000、390×844 | PASS | 搜索 3 个候选、拒绝详情、批准比较、刷新恢复、追问预算 5000 后 1 个推荐；无 page errors 和 document 横向 overflow |
| 独立 UI review | 四项修正 resolved / ship | mobile 入口、字号、常驻模拟声明和键盘表格；这个 verdict 仅针对修正清单 |
| MCP Docker build / probe | PASS | Linux arm64 image；构建内 `npm ci/check/build` 均通过，non-root container 的 initialize/list/search/receipt read 通过 |
| GitHub CI | PASS | PR #22 的四项 app check 通过；[workflow evidence](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/actions/runs/36870445008) 对应实现 commit `b8d62de` |
| 真实 feature staging | NOT RUN | 等待已获授权的 public HTTPS MCP endpoint |

浏览器运行 `scripts/test-ui.ts`：Platform lifecycle/events/approvals 为 mock，数据通过实际本地 HTTP MCP 获取。工具执行与拒绝计数的断言在集成测试中核对；浏览器结果不能用作真实 Platform 接通证据。UI 截图在 ignored `.impeccable/review/`，可本地复查。

离线 tests 覆盖硬预算/参数筛选、unknown/unavailable、版本错误和同类别比较；真实 HTTP MCP、immutable receipt、512 字符 preview 中可识别的短 ID；访客/Origin/other-Session approval 拒绝；allow-once、deny 后 Server 调用数为零、signaled 仍 pending；幂等 delivery 恢复、并发追问只接受一个请求、seq 去重；SQLite 重启恢复 pending approval；receipt 过期；格式错误/无 evidence 的模型输出；目录失败后的旧 receipt 不能产生新推荐；approvals 501；public URL 与 mandatory confirmation declaration。

初始记录中待做的实际部署验证（现由下面的 2026-10-02 记录覆盖）：

- Platform 到已授权 public HTTPS Server 的 discovery 和 tools/call。
- 成功 tool-end 的实际 preview 格式、receipt hydration 与推荐卡一致。
- native mandatory approval 的 allow/deny，以及 private runtime audit 的调用数关联。
- unavailable endpoint 的实际 `mcp_connection_failed` 事件和恢复状态。
- SDK 0.9.0 尚未声明的 `requireConfirmation` 是否在目标部署生效。

最初的 `test:feature-staging` 脚本最多创建 1 Agent / 2 Sessions / 4 user turns，失败不自动重试 paid calls，当时未包含 live comparison。2026-10-02 已增加真实比较和逐次审批验证。默认 demo 的临时目录 tunnel 按用户在本 session 明确提出的完整 demo / SDK 验证要求执行。

2026-10-01 复核时，PR #19 为 OPEN，head `cd932491bcf98eddb7e6650375b6586565c911c5`；当时 feature PR 使用 `feature/platform-demo-handoffs` 为 base。

## 2026-10-02：MCP 请求 JSON

按用户反馈保留原有主体界面和简单的折叠 debug。仅增加工具事件中的实际请求参数 JSON，以及请求已发起、等待审批、已返回和未执行状态；移除独立展示面板、链路图和计数。离线 Platform 与实际本机 HTTP MCP 的来源仍标明。

本次 `npm ci`、`npm run check`（TypeScript + 25 tests）和 `npm run build` 均通过。浏览器检查确认 debug 默认折叠，预算和筛选参数 JSON 与实际工具请求一致，已返回、等待审批和拒绝后的未执行状态正确；1440px 桌面和 390px 窄屏无 document 横向 overflow 或 page errors，JSON 区域支持键盘访问。截图在 ignored `.impeccable/review/mcp-json-desktop.png` 和 `mcp-json-mobile.png`。

PR #19 已于 2026-10-02 合并到 main，merge commit `3696818d31d2bd42a36b05af897bf78b5f9aae0f`；#22 已集成该 main，并使用 main 为 base。未执行新的 live staging。

随后修正 CodeQL 报告的审批动态 key 写入和预览页面缺少 rate limit。审批记录用 computed object key 保存，并只读取 own property；新增 `__proto__` approval ID 的持久化和决策锁定回归测试。页面和静态资源按每个 IP 每分钟 300 次限流，API 不计入这一限制。SPA fallback 使用固定文件名和 root，使 `.worktrees` 路径下的子路由也能返回页面。本机 production server 检查确认前 300 次返回 200，第 301 次返回 429，API status 仍返回 200。`npm ci`、`npm run check`（26 tests）和 `npm run build` 均通过；client bundle 与上面的 UI 检查一致。

## 2026-10-02：真实 Platform / SDK 功能验证

使用本机已授权的 staging Project key、已发布 `@zoowork-ai/sdk@0.9.0` 和本项目 HTTP MCP，经临时 HTTPS tunnel 完成 1 Agent / 2 Sessions / 4 user turns。没有 SDK override、模拟 Platform 或自动付费重试。

| 验证 | 实际结果 |
| --- | --- |
| Agent 创建、启动、Session 输入和事件 | PASS，使用 published SDK |
| 搜索、允许详情、允许比较 | PASS，同一回合收到两次原生审批并分别 allow-once；Server audit 为 search=1、get=1、compare=1 |
| 推荐和比较事实 | PASS，预算/最低 RAM 满足条件，比较包含两个远程商品和参数矩阵 |
| 预算降低到 5000 元 | PASS，新的搜索和推荐满足新预算 |
| 搜索后拒绝详情 | PASS，native deny；该 Session 的 Server audit 为 search=1、get=0、compare=0 |
| receipt preview / hydration | PASS，真实成功 tool-end 的 receipt 可提取，完整结果从固定 endpoint 读取 |
| durable events / REST replay | PASS，stream 中的 seq/type 均存在于 SDK REST 历史 |
| MCP unavailable endpoint | PASS，实际 mcp_connection_failed，无本轮新推荐 |
| 清理 | PASS，仅删除记录的两个 Sessions，停止/删除本次 Agent |

临时 Agent 为 `agt_01m3yb0rrk52pamhzxvmatr186`；Session 为 `32e23e3c86c7489f890dffd6efe74eca` 和 `9edbe59204714d99ab5a2e077d74f481`，均已清理。脱敏报告保存在 ignored `.local/feature-report-42f45a4d-b28a-4419-9ef3-a4a86a72f63d.json`。key 未打印、复制到仓库或传入 tunnel 进程。

`requireConfirmation` 在这一 staging 部署通过 SDK 序列化后生效。SDK 0.9.0 的类型声明仍缺这个字段；这是已知 typing 缺口，不影响本次实际审批。此结果覆盖本应用使用的 SDK API，不代表 SDK 全量功能或其他部署都通过。

## 2026-10-02：默认启动入口和真实浏览器验证

运行 `npm run demo` 时只配置 Project key；本机验证另外显式选择 staging base URL 和 4390 预览端口。没有手工配置 MCP URL、Agent ID 或 cookie secret。入口自动启动本机目录、等待临时 HTTPS tunnel 注册和 DNS / health / MCP discovery，创建本应用 Agent，并生成 private cookie secret。再次启动时通过 SDK 更新同一个 Agent 的新 tunnel URL，访客 cookie 和历史继续有效。

浏览器实际使用 Agent `agt_01m3yce2cb9ckr773d4kq03yds`，两个 Sessions 为 `b58d49befa2545ea8f4d6cf1ba657725` 和 `0faa9fef685447bc9d50b152eef1c31b`。共 4 user turns：搜索、允许详情、允许两件商品的比较，以及新对话搜索后拒绝详情。第一个 Session 的 Server audit 为 search=1、get=1、compare=1；第二个为 search=1、get=0、compare=0。API status 确认 `ready=true`、`testMode=false`。

真实浏览器验证通过：详情和参数比较展示、刷新后的历史与请求 JSON 恢复、1440px 桌面和 390px 窄屏无 document 横向 overflow 或 page errors。报告在 ignored `.local/live-browser-report.json`，截图在 `.impeccable/review/real-sdk-desktop.png` 和 `real-sdk-mobile.png`。

真实拒绝事件是 `agent.approval` resolved=deny，随后 `agent.tool` phase=blocked、deniedReason=approval-denied，没有 tool-end。本次修正了 debug 状态投影，并从 durable events 补全已有历史：拒绝后显示“未执行”，保留原始 blocked phase，不制造结束事件。离线回归测试覆盖这个实际事件序列。

最终代码的 `npm ci`、`npm run check`（TypeScript + 32 tests）和 `npm run build` 均通过，npm audit 报告 0 vulnerabilities。新增检查覆盖默认 SDK 地址与显式 staging、private secret 并发创建、同 Agent 的 tunnel 更新与 pending recovery、tunnel 子进程不接收 Project key、注册和 DNS readiness、真实拒绝事件及历史恢复。

默认入口创建的上述 Agent 和两个历史 Sessions 保留供用户查看真实预览。它们与已经清理的 feature-staging 临时资源分开记录。停止 demo 后，可使用同一 staging 配置运行 `npm run cleanup`，只清理本应用记录并核对 labels / metadata 的资源。
