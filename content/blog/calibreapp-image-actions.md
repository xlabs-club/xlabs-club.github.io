---
title: "使用 Calibre Image Actions 在 CI/CD 中自动压缩图片"
description: "介绍如何使用 calibreapp/image-actions 在 GitHub Actions 中自动压缩和优化图片，减少网站加载体积。"
summary: ""
date: 2024-12-28T16:19:56+08:00
lastmod: 2024-12-28T16:19:56+08:00
draft: false
weight: 50
categories: [DevOps, Tools]
tags: [CI/CD, GitHub Actions, 图片压缩, Web性能]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "CI/CD 自动图片压缩：calibreapp/image-actions 使用指南"
  description: "介绍如何使用 calibreapp/image-actions 在 GitHub Actions 中自动压缩和优化图片，减少网站加载体积。"
  canonical: ""
  noindex: false
---

[Calibre Image Actions](https://github.com/calibreapp/image-actions) 是一个 GitHub Action，能在每次 PR 时自动压缩图片，并通过 PR Comment 展示压缩效果。无需本地手动压缩，不依赖外部服务。

## 快速配置

在仓库中创建 `.github/workflows/compress-images.yml`：

```yaml
name: Compress Images
on:
  pull_request:
    paths:
      - '**.jpg'
      - '**.jpeg'
      - '**.png'
      - '**.webp'
jobs:
  compress:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Compress Images
        uses: calibreapp/image-actions@main
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          jpegQuality: '85'
          pngQuality: '85'
          webpQuality: '85'
          ignorePaths: 'node_modules/**,dist/**'
```

### 参数说明

| 参数 | 默认值 | 说明 |
|---|---|---|
| `jpegQuality` | `80` | JPEG 压缩质量（1-100） |
| `pngQuality` | `80` | PNG 压缩质量（1-100） |
| `webpQuality` | `80` | WebP 压缩质量（1-100） |
| `ignorePaths` | `node_modules/**` | 排除的路径，glob 模式 |
| `compressOnly` | `false` | 仅压缩，不在 PR 中添加评论 |

## 工作原理

1. PR 触发时，GitHub Action 检出代码。
2. 使用 [sharp](https://sharp.pixelplumbing.com/) 库对变更图片进行压缩（有损压缩，人类感知几乎无损）。
3. 压缩后的图片自动提交回 PR 分支。
4. 在 PR 中添加表格评论，展示每张图片的压缩效果：

```
| Image | Before | After | Reduction |
|---|---|---|---|
| hero.png | 1.2 MB | 340 KB | 72% |
| logo.jpg | 450 KB | 120 KB | 73% |
```

## 进阶用法

### 结合其他优化工具

可以在同一个 Workflow 中串联多个优化步骤：

```yaml
steps:
  - uses: actions/checkout@v4
  - name: Compress Images
    uses: calibreapp/image-actions@main
    with:
      githubToken: ${{ secrets.GITHUB_TOKEN }}
  - name: Optimize SVGs
    uses: ericcornelissen/svgo-action@v4
    with:
      repo-token: ${{ secrets.GITHUB_TOKEN }}
```

### 定期全量压缩

除了 PR 触发，也可设置定时任务对整个仓库的图片做一次全量优化：

```yaml
on:
  schedule:
    - cron: '0 0 1 * *'  # 每月1号
  workflow_dispatch:       # 支持手动触发
```

### 配合博客/文档站

对于 Hugo、Hexo、Docusaurus 等静态站点，图片通常存放在 `static/` 或 `public/` 目录下。建议：

- 原始图片用 PNG/JPEG，由 image-actions 在 PR 中自动压缩。
- 压缩后的 WebP 版本可配合 `<picture>` 标签按需加载。
- 将压缩结果加入 `.gitignore`，仅保留源文件在 Git 中。

## 本地压缩备选

不适合在 CI 中压缩的场景（如极大量图片），可考虑本地方案：

| 工具 | 特点 |
|---|---|
| [ImageOptim](https://imageoptim.com/) | macOS GUI 工具，压缩率极高 |
| [pngquant](https://pngquant.org/) | 命令行 PNG 有损压缩 |
| [imagemagick](https://imagemagick.org/) | 通用图片处理，功能全面 |
| [squoosh/cli](https://github.com/GoogleChromeLabs/squoosh) | Google 出品，支持多种格式转换 |

## 注意事项

1. **不要同时使用多个压缩 Action**——可能导致重复压缩或冲突。
2. **大文件限制**：GitHub Actions Runner 磁盘空间有限（约 14GB），超大型仓库需注意。
3. **GITHUB_TOKEN 权限**：需在仓库 Settings > Actions > General 中开启 "Allow GitHub Actions to create and approve pull requests"。
4. **PNG 无损 vs 有损**：默认使用有损压缩，视觉差异极小但体积减少显著。如必须保留无损 PNG，可设置 `pngQuality: 100`（此时仅做无损优化，体积减少有限）。
