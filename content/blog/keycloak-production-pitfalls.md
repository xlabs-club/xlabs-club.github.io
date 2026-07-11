---
title: "Keycloak 生产环境避坑指南——从单实例到高可用集群"
description: "Keycloak 生产环境避坑：H2 数据库、会话共享、反向代理、连接池、持久化、健康检查、优雅停机。实测配置和解决方案，从单实例到高可用集群。"
date: 2026-07-09T21:00:00+08:00
draft: false
categories: [K8S, DevOps, Security]
tags: [Keycloak, IAM, Kubernetes, High Availability, Production, Infinispan]
contributors: []
---

Keycloak 的开发环境只需 `docker run`，但生产环境远没有这么简单。本文整理了我们在多个项目中踩过的 7 个坑，每个都有可复制的配置。

> 如果你还不熟悉 Keycloak 的基本概念（Realm、Client、Identity Provider），建议先阅读 [Keycloak 完全指南](https://idaas.xlabs.club/docs/fundamentals/what-is-keycloak/)。

## 坑 1：默认 H2 数据库

Keycloak 默认使用 H2 嵌入式数据库。开发环境没问题，**生产环境绝对不能碰**。

**症状**：重启后所有 Realm 配置消失、并发写入时数据损坏、无法做数据库级别备份。

**解决方案**：

```yaml
# docker-compose.yml
keycloak:
  image: quay.io/keycloak/keycloak:26.1
  environment:
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
    KC_DB_USERNAME: keycloak
    KC_DB_PASSWORD: <secure-password>
  depends_on:
    postgres:
      condition: service_healthy
```

> **教训**：生产环境第一天就切到 PostgreSQL。H2 → PostgreSQL 的迁移比想象中痛苦（用户密码哈希格式不同、自定义 SPI 数据表结构不兼容）。

## 坑 2：会话不共享——多实例的噩梦

Keycloak 26.x 默认使用 Infinispan 做分布式缓存，但**单播发现模式（`PING`）在生产环境中不可靠**。

**症状**：登录后刷新页面回到登录页、不同 Pod 之间 Session 不共享、偶尔出现 `user session not found` 错误。

**根本原因**：Keycloak Pod 之间没有发现彼此，每个 Pod 维护独立的 Infinispan 缓存。

**解决方案——Kubernetes DNS 发现模式**：

```bash
# Keycloak 启动参数
--cache=ispn
--cache-stack=kubernetes
--spi-connections-infinispan-quarkus-site=<site-name>
```

配合 Headless Service：

```yaml
# keycloak-headless.yaml
apiVersion: v1
kind: Service
metadata:
  name: keycloak-discovery
spec:
  clusterIP: None
  selector:
    app: keycloak
  ports:
    - port: 7800
      name: jgroups-tcp
```

**验证集群是否正常**：

```bash
# 进入 Keycloak Pod
kubectl exec -it keycloak-0 -- /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin

# 检查集群节点
kubectl exec -it keycloak-0 -- /opt/keycloak/bin/kcadm.sh get \
  --server http://localhost:8080 serverinfo | jq '.clusterInfo'
```

> 深入理解 Keycloak 的 Infinispan 缓存和用户会话管理，参考 [IAM 会话管理深度解析](https://idaas.xlabs.club/docs/advanced-topics/iam-session-management/)。

## 坑 3：反向代理配置——混合端口噩梦

Keycloak 默认监听 8080（HTTP），但生产环境必须用 TLS。NGINX/Traefik 反向代理是标配，但配置不当会导致：

- **redirect_uri 不匹配**：Keycloak 以为自己是 `http://localhost:8080`，实际用户在访问 `https://auth.example.com`
- **混合内容**：HTML 通过 HTTPS，但 JS/CSS 引用的是 HTTP 地址
- **WebSocket 断开**：Keycloak Admin Console 使用 WebSocket，反向代理必须支持升级

**正确配置**：

```bash
# Keycloak 启动参数
--hostname=https://auth.example.com
--http-enabled=false
--proxy-headers=xforwarded
```

```yaml
# Traefik IngressRoute
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: keycloak
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`auth.example.com`)
      kind: Rule
      services:
        - name: keycloak
          port: 8080
  tls:
    secretName: keycloak-tls
```

> **关键点**：`--hostname` 和反向代理的 `Host` 头必须一致。任何不一致都会导致 OpenID Connect Discovery 端点（`/.well-known/openid-configuration`）返回错误的 URL，所有依赖 OIDC 的应用都会故障。

## 坑 4：数据库连接池耗尽

Keycloak 使用 HikariCP 连接池，默认最大连接数 20。当 Realm 配置的 Identity Provider 数量多、或 User Federation 查询频繁时，20 个连接很快耗尽。

**症状**：Admin Console 卡住、登录延迟飙升、`HikariPool-1 - Connection is not available` 日志。

**调优**：

```bash
# 根据实际负载调整
--db-pool-initial-size=5
--db-pool-min-size=5
--db-pool-max-size=50
--db-pool-idle-timeout=300000
```

同时确保 PostgreSQL 的 `max_connections` 远大于 Keycloak 的 pool size（建议 `max_connections = keycloak_instances × pool_max_size + 50`）。

## 坑 5：会话持久化——Pod 重启后用户不掉线

Kubernetes 默认使 Pod 变成「牲畜」，随时可以被杀死。Keycloak 如果只依赖内存缓存（`--cache=local`），Pod 重启后所有在线用户的 Session 丢失。

**解决方案——启用持久会话（Persistent User Sessions）**：

```bash
--spi-user-sessions-infinispan-offline-session-preload=true
--spi-user-sessions-infinispan-offline-preload-entry-size=10000
```

**生产验证**：执行 `kubectl delete pod keycloak-0`，观察是否有活跃用户掉线。

> 完整的 Keycloak 高可用 + 灾备方案，参考 [Keycloak 高可用与灾备部署](https://idaas.xlabs.club/docs/solution-blogs/keycloak-ha-dr/)。

## 坑 6：健康检查——存活探针不当导致脑裂

Kubernetes 的健康检查（Liveness Probe）如果配置不当，可能会在 Keycloak 启动慢或 Infinispan 集群重组时误杀 Pod。

**推荐配置**：

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 9000
  initialDelaySeconds: 60
  periodSeconds: 30
  failureThreshold: 5  # 连续 5 次失败才重启
readinessProbe:
  httpGet:
    path: /health/ready
    port: 9000
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3
startupProbe:
  httpGet:
    path: /health/started
    port: 9000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 30  # 给足 5 分钟启动时间
```

> **关键**：`/health/live` 端点依赖 Infinispan 集群状态。在集群重组时，`/health/live` 会返回 `DOWN`。如果 `failureThreshold` 太小（默认 3），3 × 30 = 90 秒内 Keycloak 集群还没重组完成，Pod 就会被杀——导致重组永远完不成。**`failureThreshold: 5` 甚至 10 都不为过**。

## 坑 7：优雅停机——拒绝新请求 + 排空存量

Keycloak 的关闭不是瞬时的。直接 `kill -9` 或 `kubectl delete pod --grace-period=0` 会导致：
- 正在处理的登录请求丢失
- 正在写入的会话数据损坏
- Infinispan 集群成员突然消失 → 整个集群短暂不稳定

**正确配置**：

```yaml
# Kubernetes
spec:
  terminationGracePeriodSeconds: 120  # 给足 2 分钟
  containers:
    lifecycle:
      preStop:
        exec:
          command:
            - /bin/sh
            - -c
            - |
              # 1. 从负载均衡摘除自己（如调用 Traefik API）
              # 2. 等待存量请求排空
              sleep 30
              # 3. Keycloak 自身关闭（SIGTERM）
```

Keycloak 收到 `SIGTERM` 后会：
1. 停止接受新连接
2. 等待活跃事务完成
3. 刷新 Infinispan 缓存到持久存储
4. 优雅退出

> `terminationGracePeriodSeconds` 必须大于 Keycloak 的实际关闭时间。建议在测试环境实测后 + 30 秒安全边界。

## 总结

| 坑 | 症状 | 关键修复 |
|----|------|---------|
| H2 数据库 | 重启数据丢失 | `KC_DB=postgres` |
| 会话不共享 | 登录状态丢失 | `--cache-stack=kubernetes` + Headless Service |
| 反向代理 | redirect_uri 不匹配 | `--hostname=https://...` + `--proxy-headers=xforwarded` |
| 连接池耗尽 | Admin Console 卡住 | `--db-pool-max-size=50` |
| 会话丢失 | Pod 重启用户掉线 | `--spi-user-sessions-infinispan-offline-session-preload=true` |
| 健康检查误杀 | 集群重组时 Pod 被杀 | `failureThreshold: 5+` + `startupProbe` |
| 强制重启 | 数据损坏 | `terminationGracePeriodSeconds: 120` |

生产环境的 Keycloak 不是一个 `docker run` 的事。但填完上述 7 个坑后，它可以稳定运行数年。

---

*更多 Keycloak 深度内容：[Keycloak 完全指南](https://idaas.xlabs.club/docs/fundamentals/what-is-keycloak/) · [Keycloak 高可用与灾备](https://idaas.xlabs.club/docs/solution-blogs/keycloak-ha-dr/) · [IDaaS Book](https://idaas.xlabs.club)*
