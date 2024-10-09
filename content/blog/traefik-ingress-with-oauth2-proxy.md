---
title: "使用 oauth2-proxy 为任意程序增加认证授权，结合 K3S、Traefik 实际部署代码解读"
description: "使用 oauth2-proxy 为任意程序增加认证授权，结合 K3S、Traefik 实际部署代码解读"
summary: ""
date: 2024-09-22T16:30:40+08:00
lastmod: 2024-09-22T16:30:40+08:00
draft: true
weight: 50
categories: [k8s]
tags: [k8s、iam]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "使用 oauth2-proxy 为任意程序增加认证授权，结合 K3S、Traefik 实际部署代码解读"
  description: "使用 oauth2-proxy 为任意程序增加认证授权，结合 K3S、Traefik 实际部署代码解读"
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

作为一个程序员，在日常开发中永远避免不了认证授权，而我们开发的某些应用，并不需要太复杂的授权，比如可能只要求必须是登录用户，或者只需要根据角色进行 RBAC 授权。有没有方法简化此流程，让应用开发者只关注业务开发，这就是本文档要解决的问题。

写在前面：

1. 本文档融合了 k3s、traefik ingress controller、oauth2-proxy、keycloak，以这几个组件为基础进行示例，完善略显复杂，但是基本原理都是一样的，都是开源软件，开箱即用。
2. 对于某些场景下可选的配置，会单独说明，请注意分别。
3. 这里提到的每个组件都是可替换的，比如 nginx 代替 traefik，Pomerium 代替 oauth2-proxy，可根据爱好选择，后面也会适当补充几种不同方式的对比和部署差异，更详细内容请参考本站另外一篇文档 [统一身份认证](https://www.xlabs.club/docs/platform/iam/)。
4. 示例中的代码都是从真实环境拷贝经过检验的，完整的安装部署源码请参考我们的部署脚本 [xlabs-club/xlabs-ops](https://github.com/xlabs-club/xlabs-ops)。
5. 涉及一些 k8s、OIDC 基础知识，此处只提供链接不展开说明。

## 组件介绍

## 基本原理和流程

## 基于 traefik ingress controller 部署代码实例

## 扩展：nginx 集合 oauth2-proxy

## Thanks

<https://www.leejohnmartin.co.uk/infrastructure/kubernetes/2022/05/31/traefik-oauth-proxy.html>

<https://joeeey.com/blog/selfhosting-sso-with-traefik-oauth2-proxy-part-2/>

<https://oauth2-proxy.github.io/oauth2-proxy/configuration/providers/keycloak_oidc>

<!-- audience mapper  -->
<!-- Group Scope -->
<!-- Configure a dedicated audience mapper for your client by navigating to Clients -> <your client's id> -> Client scopes. -->
