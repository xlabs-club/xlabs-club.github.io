---
title: "Spring Security 集成 Keycloak 实现用户 RBAC、ABAC 授权"
description: "Spring Security 集成 Keycloak 实现用户 RBAC、ABAC 授权"
summary: ""
date: 2024-11-24T16:44:35+08:00
lastmod: 2024-11-24T16:44:35+08:00
draft: false
weight: 50
categories: [spring, idaas]
tags: [spring, idaas, oauth2, keycloak]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "Spring Security 集成 Keycloak 实现用户 RBAC、ABAC 授权"
  description: "Spring Security 集成 Keycloak 实现用户 RBAC、ABAC 授权"
  canonical: ""
  noindex: false
---

使用 Spring Security Resource Server 和 Keycloak，实现用户 RBAC、ABAC 授权，主要介绍：

1. Spring Security Resource Server 如何与标准 OAuth2 协议集成。
2. Spring Security Resource Server 如何与 Keycloak Authorization Server 集成。
3. 如何校验和解析 JWT Token，获取用户详细信息。
4. 如何使用 keycloak admin client 获取更多信息，执行更高级动作。
5. Spring Security JWT Token 模式下如何方便本地 Debug，如何通过 keycloak admin client 模拟用户登录。

在开始之前我们先解释几点：

1. Keycloak 官方的 Spring Boot Starter 后续将逐渐停止维护，所以我们只用 keycloak 的 client，自己实现一部分代码，有 client sdk 实现起来很容易。
2. Spring Security [OAuth 2.0 Resource Server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html) 也有多种集成方式，这里我们只实现 `JWT` 这一种，并且是 sessionless 的，也就是只负责授权不负责 `登录认证`， 登录由网关通过 oauth2-proxy 实现，详情可参考另一篇博客介绍 [traefik-oauth2-proxy-keycloak](https://www.xlabs.club/blog/traefik-oauth2-proxy-keycloak/)。
