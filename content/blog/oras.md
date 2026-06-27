---
title: "使用 OCI Artifacts 和 ORAS 标准化软件交付"
description: "使用 OCI Artifacts、ORAS 和 Harbor 标准化软件交付，将 Helm Charts、配置文件等非容器制品统一纳入 OCI 注册中心管理。"
summary: ""
date: 2024-04-12T10:13:01+08:00
lastmod: 2024-04-12T10:13:01+08:00
draft: false
weight: 50
categories: [DevOps, K8S]
tags: [ORAS, OCI, Harbor, Helm, skopeo, 制品管理]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "ORAS + OCI Artifacts：标准化软件交付实践"
  description: "使用 OCI Artifacts、ORAS 和 Harbor 标准化软件交付，将 Helm Charts、配置文件等非容器制品统一纳入 OCI 注册中心管理。"
  canonical: ""
  noindex: false
---

传统软件交付中，容器镜像存储在 OCI Registry（如 Harbor），而 Helm Charts、制品包、配置文件等分散在不同系统。ORAS（OCI Registry As Storage）将 OCI Registry 作为通用的制品存储方案，统一管理所有类型的软件制品。

## 核心概念

**OCI Artifacts** 是 OCI 规范的扩展，允许在 OCI Registry 中存储任意类型的制品，不限于容器镜像。每个制品由一个 Manifest 和若干 Blob（层）组成。

**ORAS** 是 OCI Artifacts 的 CLI 客户端，提供类似 `docker push/pull` 的体验来管理非容器制品。

## 安装

```bash
# macOS
brew install oras

# Linux
curl -LO https://github.com/oras-project/oras/releases/latest/download/oras_linux_amd64.tar.gz
tar xzf oras_linux_amd64.tar.gz -C /usr/local/bin oras

# 验证
oras version
```

## 基本用法

### 推送制品

```bash
# 推送单个文件
oras push harbor.example.com/artifacts/my-config:v1 config.yaml

# 推送多个文件
oras push harbor.example.com/artifacts/my-chart:v1 \
  Chart.yaml values.yaml templates/

# 推送 Helm Chart（OCI 格式）
helm package mychart/
helm push mychart-0.1.0.tgz oci://harbor.example.com/helm-charts
```

### 拉取制品

```bash
# 拉取到当前目录
oras pull harbor.example.com/artifacts/my-config:v1

# 仅下载特定文件
oras pull harbor.example.com/artifacts/my-config:v1 --output config.yaml

# 拉取 Helm Chart
helm pull oci://harbor.example.com/helm-charts/mychart --version 0.1.0
```

### 查看和删除

```bash
# 查看制品信息
oras manifest fetch harbor.example.com/artifacts/my-config:v1

# 查看仓库中的 Tags
oras repo tags harbor.example.com/artifacts/my-config

# 删除 Tag
oras manifest delete harbor.example.com/artifacts/my-config:v1
```

## 实际应用场景

### 场景 1：Helm Charts 统一管理

将 Helm Charts 以 OCI 格式推送到 Harbor，与容器镜像共用同一 Registry：

```bash
# 登录
helm registry login harbor.example.com

# 推送
helm push myapp-1.0.0.tgz oci://harbor.example.com/helm-charts

# 在 Argo CD 中引用 OCI Helm Chart
# argocd app create myapp --repo harbor.example.com --helm-chart oci://harbor.example.com/helm-charts/myapp
```

### 场景 2：配置文件版本化管理

将环境配置、证书等以 OCI Artifact 形式管理，享受 Registry 的 Tag、签名、不可变性等特性：

```bash
# 推送环境配置
oras push harbor.example.com/configs/prod:v1.2.3 \
  application.yml \
  keystore.jks \
  truststore.jks

# CI/CD 中拉取
oras pull harbor.example.com/configs/prod:v1.2.3 -o /app/config/
```

### 场景 3：通用制品分发

将编译产物（JAR、WAR、二进制）托管到 OCI Registry，简化制品分发链路：

```bash
# Maven/Gradle 构建后推送
oras push harbor.example.com/artifacts/myapp:build-123 \
  target/myapp.jar \
  target/dependency/*.jar

# 部署时拉取
oras pull harbor.example.com/artifacts/myapp:build-123 -o /opt/app/
```

## 使用 skopeo 搬运镜像

[skopeo](https://github.com/containers/skopeo) 是容器镜像搬运工具，可无缝配合 ORAS 使用。

### 镜像复制

```bash
# 从 Docker Hub 搬运到自建 Harbor
skopeo copy --multi-arch=all \
  docker://docker.io/nginx:1.25 \
  docker://harbor.example.com/library/nginx:1.25

# OCI 格式的 Helm Chart 也可搬运
skopeo copy \
  docker://harbor-a.example.com/helm/myapp:v1 \
  docker://harbor-b.example.com/helm/myapp:v1
```

### 镜像同步

```bash
# 按 YAML 配置批量同步
skopeo sync \
  --src yaml --dest docker \
  sync-config.yaml \
  harbor.example.com
```

`sync-config.yaml` 示例：

```yaml
docker.io:
  images:
    nginx: [1.25, 1.26]
    redis: [7.2]
  tls-verify: true
quay.io:
  images:
    prometheus/prometheus: [v2.51.0]
```

## Harbor 配置

Harbor 2.x 原生支持 OCI Artifacts：

1. 创建项目时选择 "Proxy Cache" 或普通项目。
2. 确保项目开启了 OCI 支持（默认开启）。
3. Harbor 的 Robot Account 可以像操作镜像一样操作 OCI Artifacts。

在 Harbor 2.8+ 中，Helm Charts 以 OCI 格式存储，旧的 Chartmuseum 方式已被废弃。

## CI/CD 集成

```yaml
# GitHub Actions 示例
- name: Push config artifact
  run: |
    oras push ${{ env.REGISTRY }}/configs/${{ env.ENV }}:${{ github.sha }} \
      k8s/deployment.yaml \
      k8s/configmap.yaml
```

## 注意事项

1. OCI Artifacts 不支持 `docker pull`——必须用 `oras` 或 `helm` CLI 操作。
2. Harbor 的垃圾回收（GC）同样适用于 OCI Artifacts，删除 Tag 后需等待 GC 周期才能释放存储。
3. 大文件（>500MB）推送时注意 Registry 的请求体大小限制——Harbor 默认 `client_max_body_size` 为 0（无限制），但前置 Nginx/Ingress 可能有自己的限制。

## 参考资料

- [ORAS 官方文档](https://oras.land/)
- [OCI Artifacts 规范](https://github.com/opencontainers/artifacts)
- [使用 skopeo 搬运镜像](/blog/docker-best-practices/)
