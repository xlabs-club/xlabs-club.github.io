---
title: "云原生工作流引擎技术选型"
description: "对比和评估开源云原生工作流引擎（Argo Workflows、Temporal、Apache Airflow、Prefect 等），给出选型建议与最佳实践。"
summary: ""
date: 2024-01-24T18:28:13+08:00
lastmod: 2024-01-24T18:28:13+08:00
draft: false
menu:
  docs:
    parent: ""
    identifier: "workflows-ef3a7205c044b59403c30fb463415ef2"
weight: 999
toc: true
seo:
  title: "云原生工作流引擎技术选型：Argo Workflows、Temporal、Airflow 对比"
  description: "对比和评估开源云原生工作流引擎（Argo Workflows、Temporal、Apache Airflow、Prefect 等），给出选型建议与最佳实践。"
  canonical: ""
  noindex: false
---

工作流引擎是平台工程的核心组件之一，负责编排 CI/CD Pipeline、数据处理任务、基础设施变更等复杂流程。本文对比几款主流云原生工作流引擎，给出选型建议。

## 候选引擎

| 引擎 | 定位 | 语言 | 架构 | 社区 |
|---|---|---|---|---|
| [Argo Workflows](https://argoproj.github.io/workflows/) | K8S 原生工作流引擎 | Go | CRD + Controller，每个步骤一个 Pod | CNCF 孵化项目 |
| [Temporal](https://temporal.io/) | 通用工作流引擎 | Go/Java/Python/TS SDK | Client-Server，独立部署 | 企业级开源 |
| [Apache Airflow](https://airflow.apache.org/) | 数据管道调度 | Python | Scheduler + Worker + Web | Apache 顶级项目 |
| [Prefect](https://www.prefect.io/) | 现代数据工作流 | Python | Server + Agent | 开源 + 商业版 |
| [Tekton](https://tekton.dev/) | K8S CI/CD Pipeline | Go | CRD + Controller | CDF (CD Foundation) |
| [Temporal (Cadence 分支)](https://temporal.io/) | 长时间运行工作流 | 多语言 SDK | Client-Server | Uber → Temporal Inc |

## 核心对比

### 1. 部署与运维

| 引擎 | 部署复杂度 | 依赖 |
|---|---|---|
| Argo Workflows | 低（K8S 内一条 `kubectl apply`） | 仅 Kubernetes |
| Temporal | 中（需数据库 + Temporal Server） | MySQL/PostgreSQL + Elasticsearch |
| Airflow | 中-高（Scheduler、Worker、Web、DB、Redis/Celery） | PostgreSQL + Redis |
| Prefect | 低（Prefect Server 或 Prefect Cloud） | PostgreSQL（Server 模式） |
| Tekton | 低（同 Argo） | 仅 Kubernetes |

如果团队已全面运行在 Kubernetes 上，Argo Workflows 和 Tekton 的部署成本最低——无需额外维护数据库和独立服务。

### 2. 编程模型

| 引擎 | 工作流定义方式 | SDK / DSL |
|---|---|---|
| Argo Workflows | YAML（或 Python/Java SDK 生成 YAML） | 声明式 YAML |
| Temporal | 编程语言 SDK（编写代码） | Go/Java/Python/TypeScript/.NET |
| Airflow | Python DAG 定义 | Python |
| Prefect | Python 函数 + 装饰器 | Python |
| Tekton | YAML（类似 Argo） | 声明式 YAML |

Temporal 的编程模型最灵活——工作流就是代码，支持 `if`、`for`、`sleep`、`await` 等编程语言原生结构。

### 3. 核心能力

| 能力 | Argo | Temporal | Airflow | Tekton |
|---|---|---|---|---|
| DAG 编排 | ✅ | ✅ | ✅ | ✅ |
| 条件分支 | ✅ | ✅ | ✅ | ✅ |
| 循环 | ✅ | ✅（原生） | ✅ | ✅ |
| 重试/超时 | ✅ | ✅ | ✅ | ✅ |
| Artifact 传递 | ✅ S3/GCS | ✅ Payload | ✅ XCom | ✅ PipelineResource |
| Cron 调度 | ✅ | ✅ Schedule | ✅ | ❌（需外部触发） |
| 长时间运行（天/周） | ⚠️ Pod 存活限制 | ✅ 原生支持 | ⚠️ | ❌ |
| 并行任务 | ✅ | ✅ | ✅ | ✅ | 
| UI Dashboard | ✅ | ✅ | ✅ | ✅ |
| SSO 集成 | ✅（oauth2-proxy） | ✅（企业版） | ✅ | ❌ |

Temporal 的一大优势是**真正支持长时间运行的工作流**——工作流状态持久化在数据库中，Worker 可以随时重启而不影响正在进行的工作流。

### 4. 适用场景

| 引擎 | 最佳场景 |
|---|---|
| Argo Workflows | CI/CD Pipeline、数据处理 Job、基础设施变更编排——K8S 原生场景 |
| Temporal | 微服务编排、长时间运行的事务性工作流（订单、支付、审批）、需要补偿（Saga）的流程 |
| Airflow | 数据工程 Pipeline、ETL、BI 报表调度 |
| Prefect | Python 生态的现代化数据工作流（Airflow 的爱尔兰对手） |
| Tekton | K8S 内 CI/CD——如果您需要比 Jenkins X 更灵活的 CI 框架 |

## 我们的选型：Argo Workflows

经过评估，我们选择了 Argo Workflows，核心考量：

1. **全 K8S 基础设施**：团队所有服务都在 K8S 中，不需要引入额外的数据库和服务器。
2. **Platform Engineering 友好**：通过 CRD 管理，团队已熟悉 K8S YAML 模型。
3. **Argo CD 生态协同**：Argo CD + Argo Workflows + Argo Events + Argo Rollouts 构成完整的 GitOps 工作流平台。
4. **模板复用**：通过 WorkflowTemplate 将通用流程抽象为可复用的模板，各团队按需组合使用。

### Argo Workflows 实践要点

```yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: deploy-and-test
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: deploy
            templateRef:
              name: deploy-to-k8s
              template: deploy
        - - name: smoke-test
            templateRef:
              name: run-smoke-tests
              template: test
        - - name: notify
            template: slack-notify

    - name: slack-notify
      script:
        image: curlimages/curl:latest
        command: [sh]
        source: |
          curl -X POST -H 'Content-type: application/json' \
            --data '{"text":"Deployment completed"}' \
            $SLACK_WEBHOOK
```

关键实践：
- 用 WorkflowTemplate 封装通用流程供团队复用，类似编程语言中的"函数"。
- 配合 Argo Events 实现事件驱动的工作流触发（Git Push、S3 事件、消息队列）。
- 为 Workflow 设置合理的 `activeDeadlineSeconds` 和 `ttlStrategy` 避免僵尸 Pod。

## 总结

- K8S 原生、CI/CD 和基础设施变更编排 → **Argo Workflows**
- 微服务编排、长时间运行事务、复杂补偿逻辑 → **Temporal**
- 数据管道、ETL、BI 调度 → **Airflow** 或 **Prefect**
