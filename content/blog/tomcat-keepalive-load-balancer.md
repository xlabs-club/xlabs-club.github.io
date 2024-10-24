---
title: "K8S Tomcat 服务长连接负载不均衡问题分析和解决办法"
description: "K8S Tomcat 服务长连接负载不均衡问题分析和解决办法"
summary: ""
date: 2024-04-11T21:05:46+08:00
lastmod: 2024-04-11T21:05:46+08:00
draft: false
weight: 50
categories: []
tags: [k8s]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "K8S Tomcat 服务长连接负载不均衡问题分析和解决办法"
  description: "K8S Tomcat 服务长连接负载不均衡问题分析和解决办法"
  canonical: ""
  noindex: false
---

问题背景，我们有一个 Http 服务在 K8S 内部署了 3 个 Pod，客户端使用 Service NodePort 进行连接，发现流量几乎都集中到了一个 Pod 上，很不均衡。

已知的情况是：

1. K8S Service 使用 round-robin 负载均衡策略。
2. 客户端和服务端都启用了 Keep-Alive 长连接。

经过抓包分析，负载较高的 Pod 保持着较多 KeepAlive 长连接。将 kube-proxy 的 ipvs 转发模式设置为 Least-Connection，即倾向转发给连接数少的 Pod，可能会有所缓解，但也不一定，因为 ipvs 的负载均衡状态是分散在各个节点的，并没有收敛到一个地方，也就无法在全局层面感知哪个 Pod 上的连接数少，并不能真正做到 Least-Connection。

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

对于独立部署 Tomcat，可在 server.xml 文件 Connector 中配置 maxKeepAliveRequests，Tomcat xml 可解析启动参数，启动时增加 `-D=server.tomcat.max-keep-alive-requests=200` 来调整默认值大小，另外注意，Tomcat xml 不支持解析 ENV 变量。

```xml
<Connector port="80" protocol="org.apache.coyote.http11.Http11Nio2Protocol"
            maxKeepAliveRequests="${server.tomcat.max-keep-alive-requests:-100}"/>
```

以上，也解释了另外一个问题，在有些场景可能想一直保持长连接，为什么收到一个 `Connection: close` Header 断开了长连接。
因为 maxKeepAliveRequests 默认值是 100。

## 客户端负载均衡和服务端负载均衡

在 Spring Cloud 和 K8S 作为服务注册发现的方案对比上，此时就可以加上一条，负载均衡模式不同。

Spring Cloud 体系是客户端负载均衡，由客户端选择负载均衡算法，此时不管是否有长连接，流量都相对均衡。

K8S Service 是服务端负载均衡，由 K8S 决定如何转发，对于长连接可能出现流量不均衡的现象。
