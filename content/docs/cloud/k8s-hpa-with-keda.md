---
title: "基于 KEDA 实现高效扩缩容"
description: "介绍如何基于 KEDA 为 Kubernetes 工作负载实现事件驱动弹性伸缩，并梳理部署与配置要点。"
summary: ""
date: 2024-06-26T22:59:41+08:00
lastmod: 2024-06-26T22:59:41+08:00
draft: false
weight: 200
toc: true
seo:
  title: "基于 KEDA 实现的 K8S 高效扩缩容方案"
  description: "介绍如何基于 KEDA 为 Kubernetes 工作负载实现事件驱动弹性伸缩，并梳理部署与配置要点。"
  canonical: ""
  noindex: false
---

KEDA（Kubernetes Event-driven Autoscaling）是一个基于事件驱动的 Kubernetes 自动扩缩容组件。与传统的 HPA（Horizontal Pod Autoscaler）基于 CPU/Memory 指标不同，KEDA 可以根据各种事件源（Kafka、Prometheus、RabbitMQ、Redis 等）的动态指标来驱动工作负载的扩缩容，包括将副本数缩容至零。

## 核心概念

- **ScaledObject**：定义要扩缩容的目标工作负载（Deployment、StatefulSet 或自定义资源）以及触发扩缩容的事件源和规则。
- **ScaledJob**：类似于 ScaledObject，但用于 Job 类型的工作负载，根据事件触发新的 Job 执行。
- **Scaler**：KEDA 的事件源连接器，负责从外部系统获取指标。KEDA 内置了 50+ 种 Scaler。

## 安装 KEDA

### Helm 安装（推荐）

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda \
  --namespace keda \
  --create-namespace
```

### 验证安装

```bash
kubectl get pods -n keda
# 应看到 keda-operator 和 keda-metrics-apiserver 两个 Pod 运行中
```

## 配置示例

### 基于 Prometheus 指标扩缩容

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: prometheus-scaler
  namespace: default
spec:
  scaleTargetRef:
    name: my-deployment
  minReplicaCount: 1
  maxReplicaCount: 10
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring.svc:9090
        metricName: http_requests_per_second
        threshold: "100"
        query: |
          sum(rate(http_requests_total{deployment="my-deployment"}[2m]))
```

### 基于 Kafka 消费延迟扩缩容

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: kafka-scaler
  namespace: default
spec:
  scaleTargetRef:
    name: consumer-deployment
  minReplicaCount: 0
  maxReplicaCount: 20
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: kafka-broker:9092
        consumerGroup: my-consumer-group
        topic: my-topic
        lagThreshold: "50"
        offsetResetPolicy: latest
```

### 缩容至零

KEDA 支持将工作负载缩容至零副本，适合事件驱动的消费场景：

```yaml
spec:
  minReplicaCount: 0
  maxReplicaCount: 10
```

当 `minReplicaCount` 设为 0 时，所有事件源的指标归零后，工作负载会被缩容到 0 副本。新事件到来时，KEDA 自动将副本数恢复到至少 1。

## 与 HPA 协同工作

KEDA 原生支持与标准 HPA 配合。如果同时定义了 CPU/Memory HPA 和 KEDA ScaledObject，KEDA 会将两者合并管理，最终副本数取两者中的较大值：

```yaml
spec:
  advanced:
    horizontalPodAutoscalerConfig:
      behavior:
        scaleDown:
          stabilizationWindowSeconds: 300
          policies:
            - type: Percent
              value: 50
              periodSeconds: 60
```

## 常用 Scaler 速查

| 事件源 | Scaler 类型 | 典型场景 |
|---|---|---|
| Prometheus | `prometheus` | 基于自定义指标扩缩容 |
| Kafka | `kafka` | 按消费延迟调整消费者数量 |
| RabbitMQ | `rabbitmq` | 按队列长度扩缩容消费者 |
| Redis | `redis` | 按 List 长度驱动 Worker |
| Cron | `cron` | 定时扩缩容（如白天多、夜间少） |
| CPU/Memory | `cpu`/`memory` | 标准资源指标（与 HPA 等价） |
| MySQL | `mysql` | 按查询数或连接数扩缩容 |
| NATS | `nats` | 按 streaming 延迟扩缩容 |

## 注意事项

1. KEDA 对 Deployment 的管理通过修改其副本数实现，不要在 KEDA 之外手动修改副本数（例如通过 CI/CD 脚本），否则会被 KEDA 覆盖。
2. ScaledObject 的 `minReplicaCount=0` 时，需确保应用可以处理冷启动延迟。建议为关键服务保留至少 1 个副本。
3. 多触发器场景下，KEDA 取所有触发器中计算出的最大副本数作为目标值。
4. 缩容操作受 `stabilizationWindowSeconds` 等 HPA 行为参数控制，避免频繁抖动。
