# xlabs-club.github.io

[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/xlabs-club/xlabs-club.github.io/.github%2Fworkflows%2Fgh-pages.yml)](https://github.com/xlabs-club/xlabs-club.github.io/actions)
[![GitHub Repo stars](https://img.shields.io/github/stars/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/graphs/contributors)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io)

中文 | [English](README.en.md)

卫星实验室，用开源探索边界，用分享传递价值。

此项目为卫星实验室主页 [xlabs.club][] 的源码，在这里分享我们的平台工程实践经验，介绍如何以技术驱动业务长期发展和高速增长。

欢迎提交 PR 进行开源共建。

_如果这些笔记对你的工作有帮助，给仓库点个 ⭐，是我们持续产出的动力。_

## 主页内容

- **平台工程** — DevOps、DataOps、FinOps、AIOps 的工程建设之路。
- **云原生** — 以云原生技术支撑不断变化的复杂业务。
- **技术博客** — 研发踩坑记录，翻一翻总有惊喜。
- **awesome-x-ops** — AIOps/DataOps/DevOps/GitOps/FinOps 的优秀软件、博客与工具精选。
- **xlabs-ops** — Argo Workflows 等 IaC 运维脚本与通用模板，官方 Examples 的组合与扩展。

## 精选阅读

- [MCP 工具返回值的两道隐藏边界：10MB 帧上限、outputSchema 校验（1.32.1 实测）](https://www.xlabs.club/blog/mcp-tool-result-limits/) — 结果帧超 10,485,760 字节直接断连、报错只有 Connection closed；校验失败被包成 isError，客户端只在调过 tools/list 后才校验，isError 时反而抛异常。
- [MCP 2026-07-28 弃用 Roots/Sampling/Logging，SDK 还在裸奔（1.32.1 实测）](https://www.xlabs.club/blog/mcp-2026-07-28-deprecation-sdk-lag/) — spec 已弃用三 feature、新增 server/discover 和 Mcp-Method 头；实测 SDK 1.32.1 零警告零 @deprecated，再不主动 audit 就要在 2027-07-28 之前返工。
- [MCP 工具挂了之后：empty_ok 比报错更危险，4 个模型实测](https://www.xlabs.club/blog/mcp-tool-failure-recovery/) — 3 种失败回灌 × 4 模型：MiniMax 在 empty_ok 下编出 4 个原因，deepseek 协议层 400，qwen/gemini 无效循环重试。
- [AI 写 Playwright 选择器，5 个模型 5 种 DOM 变异实测：i18n 团灭](https://www.xlabs.club/blog/ai-selector-mutation-testing/) — 5 模型 × 4 选择器 × 6 页面共 120 个格子：换英文文案团灭 4 家，gpt-5.6-luna #id 派反而独活；exact: true 更严谨反而更脆。
- [Playwright Test Agents 拆包：init-agents 落到磁盘的 3 个 agent 定义文件](https://www.xlabs.club/blog/playwright-test-agents-init-unpacked/) — 实测 1.63.0 四个 loop 落点差异、Healer 的「不问用户」与 fixme() 兜底条款原文、Generator 一文件一测试硬契约。

## 贡献指南

本项目使用 [Hugo][] 开发，使用 [Doks][] 作为 Hugo 主题，一切内容都是 Markdown，专心写文字即可。

本地开发时需要先安装 Node.js 和 Hugo。

```bash
# 安装 npm 依赖包，注意此过程需要连接 github 下载 hugo
npm install
# 启动 Web，然后浏览器访问 http://localhost:1313/ 即可浏览效果
npm run dev
# 创建新页面
npm run create docs/platform/backstage.md
npm run create blog/k8s.md
# 编译结果
npm run build
```

内容目录结构：

```
content/
├── blog/      # 踩坑记录、实践笔记
└── docs/
    ├── cloud/     # 云原生
    ├── platform/  # 平台工程
    ├── guides/    # 操作指南
    └── tldr/      # 简明速查
```

新文章最小 front matter 示例：

```markdown
---
title: "文章标题"
description: "一句话摘要"
date: 2024-03-31T21:29:52+08:00
draft: false
tags: [k8s]
---
```

创建文件 → `npm run dev` 预览 → 提 PR 即可。

## License

本文档采用 [CC BY-NC 4.0][] 许可协议。

[xlabs.club]: https://www.xlabs.club
[Hugo]: https://gohugo.io/
[Doks]: https://github.com/thuliteio/doks
[CC BY-NC 4.0]: https://creativecommons.org/licenses/by-nc/4.0/