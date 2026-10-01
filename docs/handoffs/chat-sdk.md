# chat-sdk session prompt

复制以下内容到新 session：

```text
继续 Platform chat-sdk starter。完成本目录对应的可运行 demo。

先读 /Users/wangfulong/src/zoo/AGENTS.md、zoowork-quickstarts/AGENTS.md、
docs/OUTLINE.md、docs/PLATFORM.md、chat-sdk/README.md；RAG 还要读 docs/RAG-RESEARCH.md。

先 fetch 并核对 foundation PR 的状态和 head。已合并则从实际 main 创建独立
worktree/branch；未合并则从 feature/platform-starter-foundation 的实际 head 起步，
feature PR base 指向该分支。不要在其他 session 的 worktree 提交，不 reset/stash/rebase。

本 session 只修改 chat-sdk/ 和必要的对应文档。完全按 Platform Project key 接入，
由代码创建 Agent，不引入旧产品依赖。使用已发布 @zoowork-ai/sdk 和现有 lifecycle
基础。若发现 SDK 缺接口，先报告具体缺口，不在这里私自维护 SDK fork。

参考 docs/REFERENCES.md 中对应的官方示例。能复用的结构或代码可以复用，先检查
license，保留必要声明，记录准确 source commit 和复制路径。

完成后在本目录运行 npm ci、npm run check，再运行 feature 的必要测试。Live staging
测试需要我明确授权；本机 SDK staging 配置路径已在 docs/PLATFORM.md，key 不打印、
不落到仓库。只清理本 session 记录的测试资源。不要部署或使用 production key。

按根规则以 Finn 身份提交，提一个 feature PR 并附在当前任务。报告实现范围、
离线检查、实际 staging 验证和剩余限制。
```
