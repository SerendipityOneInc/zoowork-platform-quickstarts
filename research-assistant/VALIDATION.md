# Research Assistant 验证记录

日期：2026-10-01。Node 22.23.2，已发布 `@zoowork-ai/sdk@0.9.0`。

## 离线验证

- `npm ci`、`npm run check`：TypeScript、23 项 Node 测试、esbuild。
- `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`：桌面 1440×1000 和手机 390px，2 个流程通过。
- 流程覆盖：主题 → 简报与两个来源 → 刷新 → 追问 → 版本选择 → Markdown 下载 → 独立研究 → 历史切换。
- Node 测试覆盖：资源归属、创建/输入/更新幂等、丢失 receipt、只读重连、完整分页、重启恢复、
  archived、interrupt、旧 terminal、公开/内部 ID 不同、late echo、确定拒绝后的锁释放、来源降级、精确导出。
- 浏览器检查未发现 page error 或横向溢出。手机输入区随文档滚动，避免遮挡正文。
- fixture 明确标注模拟资料；它不读取 key，不请求 Platform，也不证明真实检索能力。

## Staging：真实研究首轮

授权来自本 session 的开始实施指令及 `docs/handoffs/research-assistant.md`。
仅用 staging Project key，服务地址是 `https://claw-interface.ecap.yesy.live/service/v1`。

第一次检查创建 1 个临时 Agent、1 个 Session，实际提交 1 个用户回合。
已通过真实 `web_search`、两次成功 `web_fetch`、成功 terminal、带两个来源的完整简报、
durable replay，以及应用 export route 原文一致性，共读取 16 个 durable events。
测试资料是 Node.js 官方版本说明和官方 Release repository：

- <https://nodejs.org/en/about/previous-releases>
- <https://github.com/nodejs/Release>

尝试进入第二轮时，应用返回 `research_busy`，没有提交第二个付费输入。
原因是将公开 event `id` 当成内部 `inboundMessageId`。源码核对确认两者来自不同表、独立生成 UUID。
本地 active intent 没有释放。该轮临时 Session 和 Agent 均已清理。

修复改用单写入前提：保存提交前 seq 边界，核对输入回显和内容 hash，再关联唯一的新外部 run。
可直接核对的 ID anchor 优先使用；多个候选或缺少输入回显时保留待确认。
旧 run 的 terminal 不会释放当前输入。这是应用对当前公共 API 的适配，不是 SDK 新能力。

## Staging：修复后的会话验证

为避免重复搜索，用独立 `--session-only` 检查创建 1 个临时 Agent、2 个 Sessions。
Session A 仅提交 2 个很短的文本回合，输出上限 128 tokens，工具禁用。
Session B 保持空会话，检查隔离。没有自动重试付费输入。

已通过首轮完成（7 个 durable events）、同 Session 第二轮、模型记住上一轮字符串、
重新创建应用 reader 后从历史恢复，以及独立 Session 无历史混入。
该轮两个 Sessions 和 Agent 均已清理。两个 run 分别遵守 180 秒主阶段、60 秒 cleanup。

## 证据边界

真实研究首轮和修复后的会话延续分别有 staging 证据。没有在修复后重复执行完整搜索流程，
也没有把更新简报版本或 live interrupt 再跑成付费检查；这些由离线事件/浏览器测试覆盖。
浏览器 UI 使用 fixture 验证，真实 Platform 使用同一 backend/project/export 代码验证。
未做 production、公开部署、多人权限、性能压测或复杂长时间研究。

来源的「已读取」来自成功的工具调用，不是独立事实验证。公开事件只提供 result preview，
不能把它当完整工具内容或 typed citations。Markdown 识别依赖 prompt 约定，格式不完整时降级为普通回答。

当前实现依赖每 Session 单写入及私有 `.local/` registry。公开/内部 ID 的关联缺口应在 Platform
契约或 SDK 文档中另行澄清；本次不修改其他 repository。
