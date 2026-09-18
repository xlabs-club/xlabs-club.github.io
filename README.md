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

- [LLM 可观测性实测：OpenAI 兼容网关的 usage 靠不靠得住](https://www.xlabs.club/blog/llm-observability-usage-fields/) — 5 个模型实测：include_usage 空操作、MiniMax 回传全 0 usage、断连丢 token、prompt_tokens 差 6.8 倍。
- [Prompt 回归测试实测：同一份 prompt 在两个模型上错得不一样](https://www.xlabs.club/blog/prompt-regression-testing/) — 198 次调用实测，JSON 合法但契约合规 0/33、T=0 判决翻转、思维链吃光 max_tokens。
- [MCP 2026-07-28 实测：initialize 握手没了，老客户端还能连吗](https://www.xlabs.club/blog/mcp-2026-07-28-version-negotiation/) — 抓包实测 v1/v2 客户端协商行为，dual-era Server 实现与缓存字段踩坑。
- [K8S 集群平滑迁移：Service + 手工 EndpointSlice 跨集群引流](https://www.xlabs.club/blog/k8s-cross-cluster-migration/) — 跨集群引流的步骤、切流顺序与回滚预案。
- [AI Code Review 横评——CodeRabbit vs PR-Agent vs Copilot Review](https://www.xlabs.club/blog/ai-code-review-tools-comparison/) — 审查质量、误报率、配置成本与集成方式对比。

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