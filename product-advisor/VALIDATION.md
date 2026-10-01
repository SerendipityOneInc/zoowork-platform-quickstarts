# Product Advisor validation

2026-10-01。离线证据和实际 Platform deployment 证据分开记录。当前没有读取 Project credentials、执行 paid turn 或公开部署。

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| `npm ci` | PASS | 独立安装，136 packages，0 reported vulnerabilities |
| `npm run check` | PASS | TypeScript + 25 个离线 tests |
| `npm run build` | PASS | React/Vite client + compiled Node server/MCP + catalog data |
| 本地 `mcp:probe` | PASS | 官方 client 的 Streamable HTTP initialize/list/search 和 receipt read |
| 浏览器 1440×1000、390×844 | PASS | 搜索 3 个候选、拒绝详情、批准比较、刷新恢复、追问预算 5000 后 1 个推荐；无 page errors 和 document 横向 overflow |
| 独立 UI review | 四项修正 resolved / ship | mobile 入口、字号、常驻模拟声明和键盘表格；这个 verdict 仅针对修正清单 |
| MCP Docker build / probe | PASS | Linux arm64 image；构建内 `npm ci/check/build` 均通过，non-root container 的 initialize/list/search/receipt read 通过 |
| 真实 feature staging | NOT RUN | 等待已获授权的 public HTTPS MCP endpoint |

浏览器运行 `scripts/test-ui.ts`：Platform lifecycle/events/approvals 为 mock，数据通过实际本地 HTTP MCP 获取。工具执行与拒绝计数的断言在集成测试中核对；浏览器结果不能用作真实 Platform 接通证据。UI 截图在 ignored `.impeccable/review/`，可本地复查。

离线 tests 覆盖硬预算/参数筛选、unknown/unavailable、版本错误和同类别比较；真实 HTTP MCP、immutable receipt、512 字符 preview 中可识别的短 ID；访客/Origin/other-Session approval 拒绝；allow-once、deny 后 Server 调用数为零、signaled 仍 pending；幂等 delivery 恢复、并发追问只接受一个请求、seq 去重；SQLite 重启恢复 pending approval；receipt 过期；格式错误/无 evidence 的模型输出；目录失败后的旧 receipt 不能产生新推荐；approvals 501；public URL 与 mandatory confirmation declaration。

还需要实际部署验证：

- Platform 到已授权 public HTTPS Server 的 discovery 和 tools/call。
- 成功 tool-end 的实际 preview 格式、receipt hydration 与推荐卡一致。
- native mandatory approval 的 allow/deny，以及 private runtime audit 的调用数关联。
- unavailable endpoint 的实际 `mcp_connection_failed` 事件和恢复状态。
- SDK 0.9.0 尚未声明的 `requireConfirmation` 是否在目标部署生效。

`test:feature-staging` 脚本已准备，最多 1 Agent / 2 Sessions / 4 user turns，失败不自动重试 paid calls。它不会验证 live comparison；比较目前只有离线 HTTP / browser 证据。公开部署仍遵循 docs/HANDOFF.md 的单独授权限制。

PR #19 在本轮复核仍为 OPEN，head `cd932491bcf98eddb7e6650375b6586565c911c5`；feature PR 当前应使用 `feature/platform-demo-handoffs` 为 base。
