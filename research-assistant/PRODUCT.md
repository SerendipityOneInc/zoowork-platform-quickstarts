# Research Assistant 产品范围

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

首版是本地单用户 starter。Finn 于 2026-10-01 在当前 session 明确确认此范围。
使用者输入研究主题，阅读简报、检查来源，再通过追问继续研究。

## Product Purpose

完成「提出问题 → 检索资料 → 查看实际进度 → 获得带来源的简报 → 保存历史 →
继续研究 → 导出 Markdown」的完整流程。简报是主要成果，对话承载输入和追问，
tool trace 用于解释研究过程。

本项目同时用于展示 SDK 的实际能力。页面顶部的 SDK Debug 展示真实的方法调用、
状态、耗时和安全参数摘要；Platform 事件区展示运行及工具事件，并区分历史读取与
实时 stream。研究结果和 SDK 接入过程都可以直接查看。

## Operating Context

- 本机运行，一个 Node 服务同时提供浏览器界面和后端 API。
- 使用 Vercel Chat SDK 的官方 Web adapter，后端连接 ZooWork Platform Session。
- 通过 Project key 和已发布的 SDK 创建本应用 Agent；key 留在服务端。
- Platform 保存对话和事件，本地保存应用归属映射、请求身份和恢复记录。
- 服务重启和页面刷新后可以恢复，依赖保留 `.local/` 数据及同一 Agent。

## Capabilities and Constraints

- 使用 `web_search` 和 `web_fetch`；已在 staging 完成一次搜索、两次网页读取及带来源简报。
- 当前发布 SDK 提供完整 assistant 消息和 durable events，不提供 token preview。
- Session metadata 只能创建时写入；标题在首次提交主题时确定。
- 继续研究复用原 Session，不重发历史、不默认创建新 Session。
- 首版不包含公开部署、多人登录、IM adapters、定时研究、文件上传或独立 RAG。
- Finn 已在当前 session 以「搞。」批准开始实现。staging 验证遵守交接文档的小规模授权。

## Evidence on Hand

研究界面、会话恢复、来源区、版本和导出已经实现。离线测试覆盖输入幂等、归属、停止、
事件恢复和来源判定；桌面和手机浏览器验证了完整用户流程。
staging 已分别验证研究首轮及修复后的会话延续，具体证据和未覆盖项见 [VALIDATION.md](VALIDATION.md)。
Claude 官方示例的实际改写路径和 MIT notice 见 [REFERENCES.md](REFERENCES.md)。
离线 fixture 明确标注为模拟资料；截图不能作为 staging 证据。

## Product Principles

- 用户能看到事实的来源及研究限制。
- 进度来自实际事件，不用百分比暗示不存在的完成程度。
- 连接丢失与研究失败分别处理，不通过自动重发问题恢复连接。
- 简报主视图、历史版本和导出使用同一份持久消息正文。

## 已确定的实施范围

按 [PLAN.md](PLAN.md) 实施本地单用户 starter，保留官方示例的历史侧栏和阅读布局基础。
没有独立视觉稿；当前界面由代码和桌面、手机实测截图提供证据。
