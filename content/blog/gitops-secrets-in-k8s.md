---
title: "GitOps 中的 Kubernetes Secret 管理：方案对比与最佳实践"
description: "GitOps 场景下如何管理 Kubernetes Secret，对比 Sealed Secrets、External Secrets Operator、SOPS、Vault 等方案。"
summary: "GitOps 场景下如何管理 Kubernetes Secret，对比 Sealed Secrets、External Secrets Operator、SOPS、Vault 等方案"
date: 2024-05-17T21:41:08+08:00
lastmod: 2024-05-17T21:41:08+08:00
draft: false
weight: 50
categories: [K8S]
tags: [k8s, GitOps, Secret, 安全]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "GitOps 中 Kubernetes Secret 管理方案全面对比"
  description: "GitOps 场景下如何管理 Kubernetes Secret，对比 Sealed Secrets、External Secrets Operator、SOPS、Vault 等方案。"
  canonical: ""
  noindex: false
---

GitOps 的核心原则是将所有配置以声明式方式存储在 Git 仓库中。但 Kubernetes Secret 包含敏感数据（密码、Token、证书），不能直接以明文存入 Git。本文对比几种主流方案，帮助团队选择适合的 Secret 管理策略。

## 方案对比总览

| 方案 | 原理 | 加密位置 | Git 存储内容 | 学习成本 | 适用场景 |
|---|---|---|---|---|---|
| **Sealed Secrets** | 非对称加密 | 集群侧 | 加密后的密文 | 低 | 中小规模、简单直接 |
| **External Secrets Operator** | 同步外部 Secret Store | 外部 | 仅存 SecretStore 引用 | 中 | 已有 AWS/GCP/Azure 基础设施 |
| **SOPS** | 文件级加解密 | 客户端 | Age/PGP 加密文件 | 中 | 多环境、CI 友好 |
| **HashiCorp Vault** | 集中式 Secret 管理 | Vault 服务器 | 仅存 Vault 路径引用 | 高 | 企业级统一 Secret 管理 |
| **CSI Secret Store** | 挂载外部 Secret 到 Pod | 外部 Provider | 仅存 SecretProviderClass | 中 | 云平台深度集成 |

## Sealed Secrets

由 Bitnami 开源，将 Secret 加密后存于 Git，只有集群内的 Controller 能解密。

### 安装

```bash
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets \
  --namespace kube-system
```

### 使用方式

```bash
# 安装 kubeseal CLI
brew install kubeseal

# 创建原始 Secret
kubectl create secret generic my-secret \
  --from-literal=password=MyP@ssw0rd \
  --dry-run=client -o yaml > my-secret.yaml

# 加密为 SealedSecret
kubeseal -f my-secret.yaml -w my-sealed-secret.yaml

# 安全提交到 Git，在集群中 apply 即可
kubectl apply -f my-sealed-secret.yaml
```

SealedSecret 被 apply 后，Controller 自动解密并在指定 namespace 创建对应的普通 Secret。

**优点**：部署简单，仅依赖集群内 Controller，Kubernetes 原生体验。

**缺点**：密钥绑定到集群，跨集群需要导出私钥；Secret 更新需要重新加密；不适用于多集群共享。

## External Secrets Operator (ESO)

ESO 从外部 Secret Provider（AWS Secrets Manager、GCP Secret Manager、Azure Key Vault、HashiCorp Vault 等）同步 Secret 到 Kubernetes。

### 安装

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace
```

### 配置示例（以 AWS Secrets Manager 为例）

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secret-store
  namespace: default
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: eso-sa
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
  namespace: default
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secret-store
    kind: SecretStore
  target:
    name: db-credentials
  data:
    - secretKey: username
      remoteRef:
        key: prod/db/credentials
        property: username
    - secretKey: password
      remoteRef:
        key: prod/db/credentials
        property: password
```

Git 中只需提交 `SecretStore` 和 `ExternalSecret` 资源——不包含任何敏感数据。

**优点**：Secret 不在 Git 中，自动轮转，支持几乎所有主流 Secret Provider。

**缺点**：需要额外的 Secret 存储服务，架构复杂度增加。

## SOPS（Secrets OPerationS）

SOPS 使用 Age 或 PGP 密钥对文件进行加解密，与 Argo CD、Flux 等 GitOps 工具深度集成。

### 使用方式

```bash
# 使用 Age 密钥加密
age-keygen -o key.txt
export SOPS_AGE_KEY_FILE=key.txt

# 编辑加密文件
sops my-secret.enc.yaml

# 解密查看
sops -d my-secret.enc.yaml
```

加密后的文件：

```yaml
apiVersion: v1
kind: Secret
metadata:
    name: my-secret
data:
    password: ENC[AES256_GCM,data:xxxx,iv:xxxx,tag:xxxx,type:str]
sops:
    kms: []
    age:
        - recipient: age1xxxx
          enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
            ...
    lastmodified: "2024-01-01T00:00:00Z"
```

配合 Argo CD，在 `argocd-cm` 中配置 SOPS 解密：

```yaml
data:
  configManagementPlugins: |
    - name: sops
      generate:
        command: ["sh", "-c"]
        args: ["sops -d $ARGOCD_ENV_MY_SECRET.enc.yaml"]
```

**优点**：可提交加密后的文件到 Git，CI/CD 集成好，支持多种加密后端。

**缺点**：需管理加密密钥的分发和轮转。

## HashiCorp Vault

企业级 Secret 管理方案，提供动态 Secret、审计日志、Access Control 等高级功能。

配合 Vault Sidecar Injector 或 Vault Secrets Operator，可在 Pod 启动时自动注入 Secret。

### 基本流程

1. 应用通过 Kubernetes ServiceAccount 认证到 Vault。
2. Vault 根据 Policy 返回对应的 Secret。
3. Secret 以文件或环境变量形式注入 Pod。

Git 中只需在 Pod Annotation 声明需要的 Secret 路径：

```yaml
spec:
  template:
    metadata:
      annotations:
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: "myapp"
        vault.hashicorp.com/agent-inject-secret-db-creds: "database/creds/myapp"
```

**优点**：功能最全面，动态 Secret、审计、细粒度权限控制。

**缺点**：部署和运维成本高，适合已经有 Vault 基础设施的团队。

## 方案选择建议

```
是否需要 Secret 自动轮转？
├── 是 → External Secrets Operator / Vault
└── 否 → 是否需要跨集群共享？
    ├── 是 → External Secrets Operator / Vault
    └── 否 → 使用云平台吗？
        ├── 是 → External Secrets Operator（直接读取云 Secret Manager）
        └── 否 → Sealed Secrets / SOPS
            ├── 团队规模 < 10 → Sealed Secrets（最简单）
            └── 团队规模 >= 10 → SOPS（CI 集成更好）
```

## 总结

- **Sealed Secrets** 适合简单场景，开箱即用。
- **External Secrets Operator** 是云原生时代的最佳平衡——Git 中无敏感数据，自动同步，学习成本适中。
- **SOPS** 适合需要多环境管理、与 GitOps 工具深度集成的团队。
- **Vault** 是企业级方案，功能和复杂度都最高。

无论选择哪种方案，核心原则是：**敏感数据不直接以明文进入 Git 仓库**。
