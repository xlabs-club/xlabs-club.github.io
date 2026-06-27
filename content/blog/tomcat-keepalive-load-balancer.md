---
title: "K8S Service 长连接导致负载不均衡问题分析和解决办法"
description: "K8S Service 长连接导致负载不均衡问题分析和解决办法，包含 Keep-Alive 连接管理和 ipvs 负载均衡策略调整"
summary: ""
date: 2024-04-11T21:05:46+08:00
lastmod: 2025-12-18T22:52:41+08:00
draft: false
weight: 50
categories: [K8S]
tags: [k8s, Service, 负载均衡, Keep-Alive]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "K8S Service 长连接负载不均衡问题：Keep-Alive 与 ipvs 策略优化"
  description: "K8S Service 长连接导致负载不均衡问题分析和解决办法，包含 Keep-Alive 连接管理和 ipvs 负载均衡策略调整"
  canonical: ""
  noindex: false
---

问题背景，我们有一个 Http 服务在 K8S 内部署了 3 个 Pod，客户端使用 Service NodePort 进行连接，发现流量几乎都集中到了一个 Pod 上，各 Pod 承载流量很不均衡。

已知的情况是：

1. K8S Service 底层是 ipvs round-robin 负载均衡策略，按道理讲应该是均衡的。
2. 客户端和服务端都启用了 Keep-Alive 长连接。

经过抓包分析，负载较高的 Pod 保持着较多 KeepAlive 长连接。将 kube-proxy 的 ipvs 转发模式设置为 Least-Connection，即倾向转发给连接数少的 Pod，可能会有所缓解，但也不一定，因为 ipvs 的负载均衡状态是分散在各个节点的，并没有收敛到一个地方，也就无法在全局层面感知哪个 Pod 上的连接数少，并不能真正做到 Least-Connection。

## 为什么 Round-Robin 对长连接失效

ipvs 的 round-robin 作用在连接（TCP Connection）层面，而非请求（Request）层面。流程如下：

1. 客户端与服务端建立 TCP 连接 1 → ipvs 调度到 Pod A。
2. 客户端保持此连接（Keep-Alive），后续所有 HTTP 请求均复用连接 1 → 全部落在 Pod A。
3. 即便有新的 Pod C 加入，只要连接 1 未断开，Pod C 收不到任何来自该客户端的请求。

所以长连接场景下，连接的分布决定了流量的分布，而非请求数。

## ipvs 调度算法对比

K8S kube-proxy ipvs 模式支持以下调度算法：

| 算法 | 参数 | 行为 | 长连接适用性 |
|---|---|---|---|
| Round Robin | `rr`（默认） | 依次轮流分发连接 | 差 — 连接创建后不再重调度 |
| Least Connection | `lc` | 分发到活跃连接最少的后端 | 略好 — 新连接优先到空闲 Pod |
| Source Hash | `sh` | 按源 IP 哈希固定绑定 | 差 — 同一客户端始终同一 Pod |
| Destination Hash | `dh` | 按目标 IP 哈希 | 不适用 |

调整算法（`lc` 可能比 `rr` 更均衡新连接，但不解决已有连接的问题）：

```yaml
# kube-proxy ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: kube-proxy
  namespace: kube-system
data:
  config.conf: |
    apiVersion: kubeproxy.config.k8s.io/v1alpha1
    kind: KubeProxyConfiguration
    mode: ipvs
    ipvs:
      scheduler: lc  # 换成 least-connection
```

修改后重启 kube-proxy Pod 生效。

## 服务端主动要求断开长连接

客户端连接我们可能无法控制，那么如何从服务端主动断开长连接。

以 Tomcat 为例，它提供了 maxKeepAliveRequests 参数，到达此参数阈值后，Tomcat 会在 Response Header 中主动加一个 `Connection: close`，正常情况下客户端接收到此响应后会主动断开长连接。

对于其他不支持此参数的服务器，可以自定义 Filter 或者自定代码，到达某阈值后在 Response Header 中主动追加 `Connection: close`。

对于 Spring Boot 可通过 properties 配置。

```properties
# Spring Boot Tomcat
server.tomcat.max-keep-alive-requests=100
# Spring Boot WebFlux
server.netty.max-keep-alive-requests=100
```

对于独立部署 Tomcat，可在 server.xml 文件 Connector 中配置 maxKeepAliveRequests，Tomcat xml 可解析启动参数，启动时增加 `-D=server.tomcat.max-keep-alive-requests=200` 来调整默认值大小，另外注意，Tomcat xml 不支持解析 ENV 环境变量，只支持解析 `-D` 启动参数。

```xml
<Connector port="80" protocol="org.apache.coyote.http11.Http11Nio2Protocol"
            maxKeepAliveRequests="${server.tomcat.max-keep-alive-requests:-100}"/>
```

以上，也解释了另外一个问题，在有些场景可能想一直保持长连接，为什么收到一个 `Connection: close` Header 断开了长连接。
因为 maxKeepAliveRequests 默认值是 100。

### 自定义 Filter 实现

对于非 Tomcat 服务器或需要更灵活控制，自定义 Filter：

```java
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.concurrent.atomic.AtomicInteger;

public class KeepAliveControlFilter implements Filter {

    private static final int MAX_REQUESTS_PER_CONNECTION = 100;

    private final AtomicInteger requestCount = new AtomicInteger(0);

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws java.io.IOException, ServletException {
        chain.doFilter(request, response);

        if (requestCount.incrementAndGet() >= MAX_REQUESTS_PER_CONNECTION) {
            HttpServletResponse httpResponse = (HttpServletResponse) response;
            httpResponse.setHeader("Connection", "close");
            requestCount.set(0);
        }
    }
}
```

## 连接优雅关闭——避免 Connection: close 影响在线请求

`Connection: close` 通知客户端关闭，但需要确保当前已发送但尚未收到响应的请求能正常完成。Tomcat 的 `maxKeepAliveRequests` 只在响应阶段追加 Header，不影响已经在处理中的请求。自定义实现时也应注意这个时序。

配合 K8S 的 `terminationGracePeriodSeconds` 可以控制 Pod 退出时允许的缓冲时间：

```yaml
spec:
  terminationGracePeriodSeconds: 30
  containers:
    - lifecycle:
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 10"]
```

`preStop` 的 sleep 给 K8S EndpointSlice 更新留出时间，避免 Pod 被标记为 Terminating 后新连接仍被路由进来。

## 客户端负载均衡和服务端负载均衡

在 Spring Cloud 和 K8S 作为服务注册发现的方案对比上，此时就可以加上一条，负载均衡模式不同。

Spring Cloud 体系是客户端负载均衡，由客户端选择负载均衡算法，此时不管是否有长连接，流量都相对均衡。原因：客户端每次发起远程调用时，从本地缓存的服务列表中按算法（如 Ribbon 的 RoundRobinRule）选一个实例，与已建立的连接无关。

K8S Service 是服务端负载均衡，由 K8S 决定如何转发，对于长连接可能出现流量不均衡的现象。

### 根本解决：使用 Service Mesh 或客户端 LB

如果长连接不均衡问题严重且不能接受 Connection: close 的额外开销，考虑：

1. **gRPC + client-side LB**：gRPC 原生支持客户端负载均衡（`grpc-go` 的 `round_robin` resolver）。
2. **Linkerd / Istio**：Sidecar 代理在连接层面做更智能的负载均衡，支持基于请求的调度而非仅连接级。
3. **Spring Cloud Kubernetes**：将 K8S Service 发现与 Ribbon/Spring Cloud LoadBalancer 结合，实现客户端 LB。

## 排查流程

1. `kubectl top pod` 观察各 Pod CPU/Memory 是否均衡。
2. 在 Pod 内用 `ss -tn state established | awk '{print $4}' | sort | uniq -c` 查看各 Pod 的 TCP 连接数。
3. 对比客户端侧连接分布：`ss -tnp | grep <service-ip>`。
4. 确认 ipvs 调度算法：`ipvsadm -Ln` 查看连接分布和调度算法。
5. 确认是否启用 Keep-Alive：检查应用日志或抓包 `curl -v` 看 Response Header 中的 `Connection: keep-alive` / `Keep-Alive: timeout=XX`。
