---
name: Research Assistant
description: 以简报和来源为主的本地研究阅读界面
colors:
  accent: "#36523d"
  accent-hover: "#243f2b"
  text: "#252820"
  muted: "#61675d"
  background: "#f7f6f2"
  paper: "#fffefa"
  sidebar: "#edeee7"
  line: "#dedfd5"
  control-hover: "#e9ece3"
  history-selected: "#dfe4d8"
  on-accent: "#fff"
  failure: "#943e2d"
typography:
  headline:
    fontFamily: "Georgia, 'Songti SC', serif"
    fontSize: "1.85rem"
    fontWeight: 500
    lineHeight: 1.5
  section-title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.05rem"
    fontWeight: 650
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".95rem"
    lineHeight: 1.9
  control:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".86rem"
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".77rem"
  metadata:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".7rem"
rounded:
  control: "7px"
  compact: "5px"
spacing:
  small: "8px"
  compact: "12px"
  group: "18px"
  section: "24px"
  reading-inset: "34px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: ".6rem .85rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: ".6rem .85rem"
  button-secondary-hover:
    backgroundColor: "{colors.control-hover}"
  history-selected:
    backgroundColor: "{colors.history-selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "{spacing.compact}"
---

# Design System: Research Assistant

## Overview

**Creative North Star: "研究简报阅读界面"**

界面保留 Claude 官方 Chat SDK 示例的历史侧栏和阅读布局。视觉重点是连续阅读：暖色背景、清楚的正文层级和独立的来源区域。简报标题使用 serif，操作和辅助信息使用 sans-serif。

容器保持扁平。背景色和细边框划分区域，绿色用于主要操作、链接和当前选择。本文记录 `web/app.css` 与 `web/app.tsx` 中已实现的样式；单页装饰与一次性尺寸不作为通用 token。

**Key Characteristics:**

- 暖色中性背景配低饱和绿色。
- serif 简报标题配 sans-serif 正文与控件。
- 连续阅读区域、细边框和轻量选择状态。
- 桌面并列、窄屏顺序阅读，键盘 focus 清楚可见。

## Colors

颜色以中性表面为主，绿色提供交互层级。frontmatter 保存颜色的规范值。

### Primary

- **低饱和绿色**：`accent` 用于主要按钮、链接、激活 tab、图标与工具状态；`accent-hover` 用于主要按钮 hover。
- **白色按钮文字**：`on-accent` 只用于绿色主操作的文字。

### Neutral

- **暖色背景**：`background` 用于全局阅读底色，`paper` 用于输入容器和 composer。
- **侧栏底色**：`sidebar` 用于历史侧栏和手机顶部栏。
- **正文与辅助文字**：`text` 用于正文；`muted` 用于状态、日期、域名和说明。
- **边界与选择**：`line` 用于区域和列表分隔；`control-hover`、`history-selected` 分别表示 hover 和当前历史项。
- **失败提示**：`failure` 用于失败的工具事件和停止研究操作。

**The 交互颜色 Rule.** 绿色用于操作、链接和选择状态；来源读取状态必须同时保留文字说明，不能只靠颜色表达。

## Typography

**Display Font:** Georgia，中文 fallback 为 Songti SC；用于简报标题。欢迎页另有 Noto Serif CJK SC fallback。

**Body Font:** system-ui、-apple-system、Segoe UI、sans-serif；用于正文、控件和辅助信息。

### Hierarchy

- **Headline**：简报标题使用 `headline`，手机缩小为（1.5rem）。
- **Section title**：正文二级标题使用 `section-title`，上方留出较大间距。
- **Body**：简报和对话使用 `body`，行高适合连续阅读；阅读容器限制最大宽度（850px）。
- **Control / Label / Metadata**：按钮、状态说明、日期和域名逐级减小。日期与来源编号使用 tabular numerals，保证数字对齐。

**The 阅读层级 Rule.** serif 负责简报主标题；正文、列表、导航和操作保持 sans-serif，不用不同字体区分来源可信度。

## Layout

桌面外层是历史与内容两列：历史宽度（248px），内容允许收缩。历史侧栏使用 sticky，内部列表单独滚动。研究内容内再分为阅读与来源两列，来源宽度（240px）。宽度达到（1500px）时，来源增至（280px），阅读区居中并增加内边距。

宽度不超过（1150px）时，来源移到正文后，来源列表暂为两列。宽度不超过（760px）时，历史改为（270px）drawer，来源单列，顶部显示历史入口。手机 composer 放在内容之后并随页面滚动；桌面 composer 使用底部 sticky。

间距按用途取值：小间隔用于按钮和行内图标，紧凑间距用于历史项和列表行，较大间距用于阅读段落与区域内边距。桌面阅读区主要水平内边距使用 `reading-inset`，手机统一缩小到（23px）。长标题、URL、表格和代码必须在自身区域内换行或滚动。

## Elevation & Depth

当前系统没有 box-shadow。历史、来源、输入和阅读区域通过背景差异与细边框分层。手机 drawer 使用半透明 backdrop；focus 使用轮廓，不使用阴影。

**The 扁平容器 Rule.** 常驻表面使用背景与边框区分，不为历史项、简报或来源添加浮起阴影。

## Shapes

按钮使用小圆角 `control`，版本选择使用更紧凑的 `compact`。tab 和示例问题入口保持直边，通过底部分隔线表达结构。用户对话消息使用轻微圆角容器。图标使用 inline SVG 线条，不使用字符代替图标。

## Components

### Buttons

主按钮为绿色实底，次按钮为透明背景加细边框。hover 使用已定义的表面颜色；disabled 降低透明度（.48）并显示不可操作 cursor。按钮、链接、选择框、textarea 和来源项的键盘 focus 使用轮廓（2px），与元素保持间距（3px）。

### Inputs / Fields

textarea 透明、无内边框，继承正文颜色，行高（1.7），可垂直调整。主题输入通过外层表面与边框组织；继续研究输入位于 composer 内。label 保持可见，placeholder 只提供示例。caret 使用 accent。

### Navigation

历史项按主题和状态日期两行排列。主题最多显示两行，完整标题通过 title 保留；当前项使用 `history-selected`。tab 用绿色文字和底边表示激活状态。手机复用同一历史内容，并通过顶部按钮打开 drawer。

### Cards / Containers

简报直接排在阅读区域中。对话中的用户消息使用浅色圆角容器，assistant 内容沿用连续正文。来源和活动使用列表与分隔线，保持结构清楚。

### Sources and Activity

来源按编号、标题、域名和读取状态排列，点击正文编号定位相应来源，外部来源链接可单独打开。来源 hover 增加下划线，键盘 focus 保持可见。

研究过程使用原生 details，可通过「查看研究过程」展开。chevron 随展开状态旋转，状态文字与调用计数保持可见；研究运行期间展开，结束后可折叠。工具行明确区分进行中、完成、未执行、待处理和失败。

## Do's and Don'ts

### Do:

- **Do** 沿用 frontmatter 的表面、文字和交互颜色，新增控件保持小圆角与细边框。
- **Do** 保持正文、来源和历史的清楚层级，并在窄屏按阅读顺序堆叠。
- **Do** 为操作保留文字和键盘 focus，为来源状态保留明确的文字依据。

### Don't:

- **Don't** 给常驻阅读区域增加浮起阴影或渐变背景。
- **Don't** 用装饰标签、不同字体或仅颜色表达来源已验证。
- **Don't** 在手机上固定 composer 遮住正文或来源。
