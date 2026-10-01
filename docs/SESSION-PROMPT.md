# Reusable session prompt

Replace only `<应用名>` with `customer-support`, `product-advisor`, `knowledge-assistant`
or `research-assistant`. Startup behavior is already assigned below. Ready-to-copy versions
are in [handoffs](HANDOFF.md).

```text
本 session 负责：<应用名>。

我们正在做 ZooWork Platform 的四个完整应用 starter。仓库是
https://github.com/SerendipityOneInc/zoowork-platform-quickstarts，基础 PR #18 已合并。
本机现有 checkout 是 /Users/wangfulong/src/zoo/zoowork-quickstarts。

先读 workspace 的 AGENTS.md，再 fetch 并核对目录更名和交接更新分支
feature/platform-demo-handoffs 对应 PR 的实际状态和 head。该更新已合并就从
最新 main 起步；未合并就从该分支实际 head 起步，feature PR base 用该分支。
创建本 session 的独立 worktree 和 branch。在新 worktree 完整读取仓库 AGENTS.md、
docs/HANDOFF.md、docs/OUTLINE.md、docs/PLATFORM.md，以及本应用的 README.md、
PLAN.md 和子目录规则。不在共享基础 worktree 开发，不改其他 session 的文件或分支，
不自动 reset、stash、rebase。

目标是可独立运行、能完成一件事的应用。按 PLAN.md 的用户流程和完成标准交付，
包含界面、业务数据或真实外部工具、会话历史、错误处理、README 和必要测试。
技术日志是辅助信息，不能把一次工具调用或接口连通当作完整 demo。
完全使用 Platform Project key 和已发布 @zoowork-ai/sdk，由应用代码创建 Agent。
不保留旧 starter 兼容，不接 ZooWork Work 的现有 Agent、登录流程或 channels API。
只修改本应用目录和必要的对应文档；通用 SDK 缺口单独报告。

参考官方完整示例，适合的结构和代码可以复用；先检查 license，记录 source commit
和复制路径。以 docs/PLATFORM.md 为平台边界，不能假定 Claude/OpenAI 的接口都可用。

启动安排：customer-support 现在开始实现，直到完成验证并提交 feature PR；
product-advisor 和 research-assistant 先读上下文、整理具体方案，等我说开始再实现；
knowledge-assistant 先在本应用目录继续 RAG 讨论，读 docs/RAG-RESEARCH.md，
提出 provider、语料、引用、权限和 ingestion 范围建议，讨论确定后再实现。

本次允许使用 ~/.config/zoo-debug/staging/service-api.json 做必要的小规模 staging
验证，仅限已开始实现的应用。每次最多 1 个临时 Agent、2 个 Session、4 个用户回合，
优先做更小的检查，不自动重试付费调用。key 留在服务端，不打印、不提交。
只清理本 session 记录的资源，失败保留恢复状态；不使用 production，不做公开部署。

实现完成后运行本目录 npm ci、npm run check 和功能所需的检查。
按 Finn 身份提交并提一个 feature PR，附到当前任务。报告用户能完成什么、
运行方式、离线检查、实际 staging 结果和剩余限制。准备阶段先报告理解和方案。
```
