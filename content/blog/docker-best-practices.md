---
title: "容器镜像制作最佳实践，研发 DevOps 平台建设实践经验和踩坑记录"
description: "容器镜像制作最佳实践，研发 DevOps 平台建设实践经验和踩坑记录"
summary: ""
date: 2024-05-24T20:56:08+08:00
lastmod: 2024-05-24T20:56:08+08:00
draft: true
weight: 50
categories: []
tags: []
contributors: []
pinned: false
homepage: false
seo:
  title: "" # custom title (optional)
  description: "" # custom description (recommended)
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

分享我们在容器镜像制作过程中的一些经验，以及踩过的坑。

## 容器镜像制作最佳实践

整理的一些网上流传已久的一些最佳实践，当然有些可能已经过时，有些可能并不适用于你，请注意分辨。

使用官方镜像，不要自己安装 xxx。
Small Size
Tag
优化 cacheing layers， all flowing layers will re-created
dockerignore
多阶段构建
no root use：独立的 group AND use
镜像安全扫描。
use buildkit

## 我们的镜像策略

基础镜像和镜像分层策略：distroless

Agent、数据文件
工具包：可自由使用的，比如 arthas，策略管控（时间点）； 不可自由使用的
kubectl debug 1.18

## kubectl debug

我们需要一个包含 tcpdump 工具的调试容器镜像。例如，我们可以使用 nicolaka/netshoot 镜像，这是一个常用的网络调试工具镜像，包含 tcpdump 和其他网络诊断工具。

为 Kubernetes 工作负载使用重型容器镜像效率低下（我们都经历过这些需要永远完成的 CI/CD 管道）并且不安全（你拥有的东西越多，遇到严重漏洞的机会就越大）。因此，让调试工具即时进入行为不端的 Pod 是一项非常需要的能力，而 Kubernetes 临时容器在将它引入我们的集群方面做得很好。

我非常喜欢使用改进后的 kubectl debug 功能。然而，它显然需要大量的低级容器（和 Kubernetes）知识才能有效使用。否则，会出现各种令人惊讶的行为，从丢失的进程开始，到 Pod 的意外大规模重启结束。

我并不是说你在创建 Java Docker 时不应使用这些工具。但是，如果你打算发布这些镜像，则应研究 Java 镜像所有方面的安全。镜像扫描将是一个好的开始。从安全性的角度来看，我的观点是，以完全控制和正确的方式创建 Dockerfile，是创建镜像更好，更安全的方式。

## Tools

镜像搬运工具：<https://github.com/containers/skopeo>

多阶段构建是最灵活和强大的方法，推荐在可能的情况下优先使用。对于需要额外合并的场景，可以选择 docker-squash 工具或者 BuildKit 的 --squash 选项。

```bash

# Enable Docker BuildKit
export DOCKER_BUILDKIT=1

# Build and squash the image
docker build --tag myapp:latest --squash .
```

## 参考资料

构建 Java 镜像的 10 个最佳实践：<https://zhuanlan.zhihu.com/p/469820791>
K8S 1.18 版本之前使用 kubectl-debug 插件：<https://github.com/aylei/kubectl-debug/blob/master/docs/zh-cn.md>
