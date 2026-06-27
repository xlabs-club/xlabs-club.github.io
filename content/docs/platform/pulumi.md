---
title: "Pulumi：用编程语言管理云基础设施"
description: "使用 Pulumi 以 TypeScript、Python、Go 等编程语言管理云基础设施，对比 Terraform 并分享实践经验。"
summary: ""
date: 2024-04-13T18:01:15+08:00
lastmod: 2024-04-13T18:01:15+08:00
draft: false
weight: 999
toc: true
seo:
  title: "Pulumi 基础设施即代码实践指南"
  description: "使用 Pulumi 以 TypeScript、Python、Go 等编程语言管理云基础设施，对比 Terraform 并分享实践经验。"
  canonical: ""
  noindex: false
---

[Pulumi](https://www.pulumi.com/) 是 Infrastructure as Code（IaC）领域的新一代工具，允许开发者使用通用编程语言（TypeScript、Python、Go、C#、Java）而不是 DSL（如 HCL）来管理云基础设施。

## Pulumi vs Terraform

| 维度 | Terraform | Pulumi |
|---|---|---|
| 配置语言 | HCL（专用 DSL） | TypeScript/Python/Go 等通用语言 |
| 状态管理 | 本地文件 / Terraform Cloud / S3 | Pulumi Cloud / S3 / Azure Blob / GCS |
| 抽象能力 | Modules | 函数、类、循环、条件等编程语言原生能力 |
| 测试 | 需 `terraform test` 或第三方 | 标准测试框架（Jest、pytest 等） |
| 多云支持 | 通过 Provider | 通过 Provider |
| 开发生态 | HCL 专用 IDE 插件 | VS Code/IntelliJ 的标准语言支持 |
| CLI 体验 | `terraform plan/apply` | `pulumi preview/up` |

核心差异：Pulumi 用你已熟悉的编程语言来定义基础设施。循环、条件、函数复用都是语言原生能力，不需要学 DSL 的语法糖。

## 安装

```bash
# macOS
brew install pulumi

# Linux
curl -fsSL https://get.pulumi.com | sh

# 验证
pulumi version
```

## 快速示例（TypeScript）

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

// 部署 Nginx
const appLabels = { app: "nginx" };
const deployment = new kubernetes.apps.v1.Deployment("nginx", {
    spec: {
        selector: { matchLabels: appLabels },
        replicas: 3,
        template: {
            metadata: { labels: appLabels },
            spec: {
                containers: [{
                    name: "nginx",
                    image: "nginx:1.25",
                    ports: [{ containerPort: 80 }],
                }],
            },
        },
    },
});

const service = new kubernetes.core.v1.Service("nginx", {
    spec: {
        type: "ClusterIP",
        selector: appLabels,
        ports: [{ port: 80, targetPort: 80 }],
    },
});

export const serviceName = service.metadata.name;
```

执行：

```bash
pulumi up
```

以上比等效的 Terraform YAML/JSON 或 Helm template 更直观——IDE 能提供完整的类型提示和自动补全。

## 核心概念

- **Project**：一个 Pulumi 项目，对应 `Pulumi.yaml` 文件。
- **Stack**：一个独立的环境实例（如 `dev`、`staging`、`prod`），每个 Stack 有独立的状态。
- **Resource**：一个云资源（如 K8S Deployment、AWS S3 Bucket）。
- **Output**：资源的输出属性，类似 Terraform 的 outputs。

## 状态管理

Pulumi 支持多种状态后端：

```bash
# 默认使用 Pulumi Cloud（免费，个人使用）
pulumi login

# 自托管：使用 AWS S3 作为状态存储
pulumi login s3://my-pulumi-state-bucket

# 本地文件（不推荐生产使用）
pulumi login --local
```

## 使用编程语言的优势

### 1. 条件创建

```typescript
const replicas = pulumi.getStack() === "prod" ? 5 : 1;
```

vs Terraform 中的 `count = var.env == "prod" ? 5 : 1`——同样简单。

### 2. 循环创建资源

```typescript
const namespaces = ["dev", "staging", "prod"];
namespaces.forEach(ns => {
    new kubernetes.core.v1.Namespace(ns, {
        metadata: { name: ns },
    });
});
```

vs Terraform 中的 `for_each` 和 `count`——编程语言的循环更直观。

### 3. 复杂逻辑

```typescript
const dbConfig = getDatabaseConfig(); // 从 API 或文件读取
if (dbConfig.type === "postgres") {
    // 创建 Postgres 相关资源...
} else if (dbConfig.type === "mysql") {
    // 创建 MySQL 相关资源...
}
```

这种逻辑在 HCL 中需要多层 `dynamic` 块或外部脚本辅助。

## 测试 Infrastructure as Code

Pulumi 的一个关键优势：使用标准测试框架测试基础设施代码：

```typescript
import * as pulumi from "@pulumi/pulumi";

describe("Nginx deployment", () => {
    it("should have 3 replicas in prod", async () => {
        const result = await pulumi.runtime.mocks.test(async () => {
            // 模拟 prod stack 下的部署...
        });
        // 断言检查...
    });
});
```

## 注意事项

1. **Provider API 稳定性**：Pulumi Provider 基于 Terraform Provider Bridge 桥接，部分 Provider 可能有延迟或功能差异。
2. **学习曲线**：如果团队全员熟悉 TypeScript/Python，Pulumi 门槛低；如果团队只熟悉 HCL，迁移成本高于收益。
3. **Pulumi Cloud 依赖**：如果使用 Pulumi Cloud 管理状态，需要考虑外部服务可用性。可使用自托管后端（S3、Azure Blob、GCS）避免此依赖。

## 选型建议

- 如果团队主力语言是 TypeScript 或 Python，且需要复杂逻辑（条件、循环、API 调用）处理基础设施——**选 Pulumi**。
- 如果团队已深度使用 Terraform，有大量 HCL modules，迁移不划算——**继续用 Terraform**。
- 如果做平台工程，希望给开发者提供编程语言接口来申请资源——**Pulumi** 的 Automation API 非常适合。

## 参考资料

- [Pulumi 官方文档](https://www.pulumi.com/docs/)
- [Pulumi vs Terraform 官方对比](https://www.pulumi.com/docs/intro/vs/terraform/)
- [我们的 cert-manager 部署实践](/blog/trust-cert-manager-selfsigned-tls/)
