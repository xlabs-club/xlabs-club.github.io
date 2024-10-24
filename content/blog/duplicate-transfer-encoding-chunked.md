---
title: "重复 Transfer-Encoding Response Header 引起的 Traefik 代理服务 500 问题"
description: "重复 Transfer-Encoding Response Header 引起的 Traefik 代理服务 500 问题"
summary: ""
date: 2023-11-26T10:21:44+08:00
lastmod: 2023-11-26T10:21:44+08:00
draft: false
weight: 50
images: []
categories: []
tags: [Java]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "重复 Transfer-Encoding Response Header 引起的 Traefik 代理服务 500 问题"
  description: "重复 Transfer-Encoding Response Header 引起的 Traefik 代理服务 500 问题"
  canonical: ""
  noindex: false
---

我有一个 Spring Boot 应用服务，提供了一些简单的查询接口，本身运行很正常，通过 curl 或其他 http 客户端 localhost 请求都没有问题。

某天通过 Traefik 代理了此服务，经过代理后再访问，某个接口一直都是 `500 internal server error`，其他接口都没有问题。通过 tcpdump 抓包发现，应用服务并没有返回任何 500 错误，而且响应时间和 Body 体大小都很正常。

根据网上经验排查了 Traefik SSL 证书问题、路径问题、消息体太大问题、请求 Header 不合规问题，都一一否定。最后无意间看了一眼 Response Header，发现 Spring Boot 应用返回了两个 `Transfer-Encoding: chunked` Header。

再根据此 Header 搜索，发现果然有人遇到过类似问题，请参考这几个链接。

- <https://github.com/traefik/traefik/issues/7741>
- <https://github.com/spring-projects/spring-framework/issues/21523>
- <https://github.com/spring-projects/spring-boot/issues/37646>
- <https://stackoverflow.com/questions/77042701/nginx-upstream-sent-duplicate-header-line-transfer-encoding-chunked-previo>

从上面链接描述中可知，不仅 Traefik 会出现此问题，nginx 包含以 nginx 为基础的 ingress 也会出现同样问题，不过 nginx 返回错误信息类似 `Nginx: upstream sent duplicate header line: "Transfer-Encoding: chunked", previous value: "Transfer-Encoding: chunked”` ，返回错误码一般是 502 Bad Gateway。

我所使用的 Traefik(2.10.6) 和 Spring Boot(2.7.17) 都是当前日期最新版本，目前仍然有问题。

出现此问题的代码类似如下。

```java

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.client.RestTemplate;

@Controller
@RequestMapping("/status")
public class StatusController {

    @Autowired
    private RestTemplate restTemplate;

    @GetMapping(value = "/test")
    public ResponseEntity<String> getStatus() {
        return restTemplate.getForEntity("http://another-service/actuator/health", String.class);
    }
}

```

修改为如下方式即解决问题。

```java

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.client.RestTemplate;

@Controller
@RequestMapping("/status")
public class StatusController {

    @Autowired
    private RestTemplate restTemplate;

    @GetMapping(value = "/test")
    public ResponseEntity<String> getStatus() {
        // 不要直接用 RestTemplate 返回值，使用 ResponseEntity 重新包装一次
        return ResponseEntity.ok(restTemplate.getForEntity("http://another-service/actuator/health", String.class));
    }
}

```

另外根据 GitHub Issue 反馈，不仅 RestTemplate，使用 OpenFeign 也会触发以上问题。

同理，如果大家遇到服务经过 Nginx、Traefik 代理后出现的疑难问题，可关注下 Response Header 是否有异常。
