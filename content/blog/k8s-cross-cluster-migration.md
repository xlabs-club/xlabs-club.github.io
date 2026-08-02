---
title: "K8S 集群平滑迁移：Service + 手工 EndpointSlice 跨集群引流"
description: "K8S 集群迁移的平滑方案：老集群 Service 开 NodePort，新集群建无 selector 同名 Service + 手工 EndpointSlice 指向老集群，服务逐个就绪后再切回。"
date: 2026-08-02T11:00:00+08:00
draft: false
categories: [k8s]
tags: [k8s, 集群迁移, EndpointSlice, NodePort, 高可用]
contributors: [l10178]
---

## 背景

多集群迁移（机房搬迁、集群升级）的难点在于：新集群是从零搭的，Pod 不会一下子全就绪。要是直接把流量切过去，没就绪的服务会把调用全打失败。微服务之间靠 Service 做服务发现，迁移期间整条调用链不能断。

## 思路

Service 是流量入口（ClusterIP + DNS），EndpointSlice 决定流量转发到哪。流量并不要求转发目标一定在本集群——EndpointSlice 里写任何可达的 IP:Port 都行。

所以做法是：新集群的 Service 先通过手工 EndpointSlice 把流量导到老集群，等服务逐个就绪再切回来。

```
调用方 Pod (新集群)
   │  order-service.default.svc.cluster.local
   ▼
Service ClusterIP ─▶ EndpointSlice(手工) ─▶ 老集群 NodeIP:NodePort ─▶ 老集群 Service ─▶ 老集群 Pod
```

比 ExternalName（DNS CNAME，有缓存，同一个 Service 没法同时指两个集群）和改调用方配置（要发版）都省事。

## Step 1：老集群 Service 开 NodePort

ClusterIP 只在本集群内可达，跨集群要用 NodePort。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: default
spec:
  selector:
    app: order-service
  type: NodePort
  ports:
    - name: http
      port: 8080
      targetPort: 8080
      nodePort: 30080
```

两个注意点：

- 保持默认 `externalTrafficPolicy: Cluster`，请求可以转发到集群内任意 Node 上的 Pod，不用管 Pod 落在哪个节点。
- 新集群的节点要能访问老集群节点的 `内网IP:30080`（内网/专线/VPN，安全组放行），迁移期间这条链路不能断。

## Step 2：新集群建同名 Service，不带 selector

name 和 namespace 跟老集群保持一致，调用方域名不变，代码不用动。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: default
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 8080
      targetPort: 8080
  # 故意不写 selector。带 selector 的 Service 会被 kube-controller-manager
  # 自动生成并接管 EndpointSlice（带 ownerReference），手工创建的同名 EndpointSlice 会被覆盖。
```

不带 selector，controller 就不介入，EndpointSlice 完全由我们控制。

## Step 3：手工创建 EndpointSlice 指到老集群

```yaml
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: order-service-proxy-old-cluster
  namespace: default
  labels:
    kubernetes.io/service-name: order-service
addressType: IPv4
ports:
  - name: http
    protocol: TCP
    port: 30080
endpoints:
  - addresses: ["10.1.2.3", "10.1.2.4"]
    conditions:
      ready: true
```

- `kubernetes.io/service-name` 这个 label 必须和 Service 同名，Service 靠它关联 EndpointSlice。
- 没有 ownerReference，controller 不会自动删，直到我们手动删。
- Node IP 全写上，kube-proxy 会做负载均衡；只写一个也行，挂了会自动重试。

## Step 4：验证

```bash
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl -v http://order-service.default.svc.cluster.local:8080/health
```

在新集群里能跑通这个，说明引流成功，这时新集群的调用方流量全走老集群。

## Step 5：切流量

新集群 Pod 全部 ready 之后：

1. 给 Service 补上 selector，controller 生成指向新 Pod 的 EndpointSlice。新旧两套并存，流量被分流。

```bash
kubectl patch svc order-service --type=json \
  -p='[{"op":"add","path":"/spec/selector","value":{"app":"order-service"}}]'
```

2. 看新 Pod 的日志和监控，确认正常处理流量。
3. 删掉指向老集群的 EndpointSlice，流量全切过来。

```bash
kubectl delete endpointslices order-service-proxy-old-cluster
```

Step 5 全程没有断点：切之前流量全在老集群，切的时候有一段两边并存的窗口，出问题随时补回手工 EndpointSlice 就能回滚。

## Step 6：收尾

老集群把 NodePort 撤掉（改回 ClusterIP 或直接删），迁移完成。

## 灰度

EndpointSlice 本来就能同时写老集群和新集群的地址。不靠 selector，把新集群 Pod IP 按比例加进手工 EndpointSlice 也行，观察指标再全量。缺点是 Pod IP 会随重启变化，得手动维护，所以一般还是用 selector 那套。上面 Step 5 借 selector 做了一次现成的全量切换。

## 注意事项

- Service 别带 selector，最容易踩的坑。
- 迁移是逐步的，老集群的调用方不受影响，老集群服务在撤 NodePort 前一直正常。
- 这只解决流量层，数据/存储要单独迁。
- 调用方如果缓存了 Service 地址，切完要重建；正常情况 ClusterIP 和 DNS 全程不变。
