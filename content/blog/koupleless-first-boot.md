---
title: "Koupleless 试用报告总结，踩坑记录分享"
description: "Koupleless 试用报告总结，踩坑记录分享"
summary: ""
date: 2024-05-27T14:20:24+08:00
lastmod: 2024-05-27T14:20:24+08:00
draft: false
weight: 50
categories: []
tags: [Java]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: ""
  description: ""
  canonical: ""
  noindex: false
---

我们公司的主要应用都是以 Java 作为开发语言，这几年随着业务的高速增长，应用数目越来越多，CPU 内存资源占用越来越多，项目组之间开发合作效率也越来越低。

顺应这个时代降本增效的目的，我们希望寻找一个能解决当前几个核心问题的框架：

- 模块化开发、部署、资源共享的能力，减少 Cache、Class 等资源占用，有效降低内存占用。
- 更快更轻的依赖，应用能够更快的启动。
- 能够让各个项目组不改代码或少改代码即可接入，控制开发迁移的成本，毕竟很多历史老应用不是那么容易迁移。

基于以上背景，我们在 2022 年基于 SOFAArk 运行了一个版本，效果不太理想暂时搁置。今年 Koupleless 重新开源后做了一些增强和变更，开源社区活跃度有所提升，看宣传效果很好，我们决定重新评估是否可在公司内推广。

## 什么是 Koupleless

[Koupleless](https://koupleless.io/home/) 是一种模块化 Serverless 技术解决方案，它能让普通应用低成本演进为 Serverless 研发模式，让代码与资源解耦，轻松独立维护， 与此同时支持秒级构建部署、合并部署、动态伸缩等能力为用户提供极致的研发运维体验，最终帮助企业实现降本增效。

Koupleless 是蚂蚁集团内部经过 5 年打磨成熟的研发框架和运维调度平台能力，相较于传统镜像化的应用模式研发、运维、运行阶段都有 10 倍左右的提升，总结起来 5 大特点：快、省、灵活部署、平滑演进、生产规模化验证。

以上都是官网的宣传，更多介绍请链接到官网查看。

在整个 Koupleless 平台里，需要四个组件：

- 研发工具 Arkctl, 提供模块创建、快速联调测试等能力。
- 运行组件 SOFAArk, Arklet，提供模块运维、模块生命周期管理，多模块运行环境。（这算两个组件？）
- 控制面组件 ModuleController，本质上是一个 K8S Operator，提供模块发布与运维能力。

我们公司有自己的发布系统、应用管理平台，很少允许运行额外的控制面组件，那么除去 ModuleController，我个人认为，Koupleless 约等于 SOFAArk。

Koupleless 增强了 SOFAArk 运维部署相关的功能，解决了 SOFAArk 在企业内无法开箱即用的问题。

## 应用接入遇见问题

基于官方文档我们改造接入了几个应用，分享几个我们遇见的问题。

1. 对 Java 17 或 21 的支持不好。
    虽然官方已经声称支持 Java 17，但是若用了 Java 17 的语法或新特性，无法编译通过。最后只好自编译 SOFAArk plugin 修改相关依赖解决。

2. 不支持 Arm 架构。
    本地使用最新 MacBook 启动失败，健康检测组件不支持 Arm，奇怪的是官方有相关的 issue 且已经关闭，却并未升级相关依赖。

3. 以下错误导致启动失败，根据原因是 classloader 依赖失败，没排除干净，Spring 必须全部由基座加载。

    ```console
    Caused by: java.lang.IllegalArgumentException: class org.springframework.cloud.bootstrap.RefreshBootstrapRegistryInitializer is not assignable to interface org.springframework.boot.BootstrapRegistryInitializer
      at org.springframework.util.Assert.assignableCheckFailed(Assert.java:720)
      at org.springframework.util.Assert.isAssignable(Assert.java:651)
      at org.springframework.util.Assert.isAssignable(Assert.java:682)
      at org.springframework.boot.SpringApplication.createSpringFactoriesInstances(SpringApplication.java:444)
      ... 22 more
    ```

4. Dubbo service 实例化失败，根据原因是 classloader 依赖失败，dubbo 由基座加载，相应的 api interface、model 也必须由基座加载。Bean 的实例化和调用可以是 biz 模块。

    ```console
    Caused by: java.lang.IllegalArgumentException: interface com.api.service.EditionService is not visible from class loader
      at com.alibaba.dubbo.common.bytecode.Proxy.getProxy(Proxy.java:98)
      at com.alibaba.dubbo.common.bytecode.Proxy.getProxy(Proxy.java:67)
      at com.alibaba.dubbo.rpc.proxy.javassist.JavassistProxyFactory.getProxy(JavassistProxyFactory.java:35)
      at com.alibaba.dubbo.rpc.proxy.AbstractProxyFactory.getProxy(AbstractProxyFactory.java:49)
      at com.alibaba.dubbo.rpc.proxy.wrapper.StubProxyFactoryWrapper.getProxy(StubProxyFactoryWrapper.java:60)
      at com.alibaba.dubbo.rpc.ProxyFactory$Adpative.getProxy(ProxyFactory$Adpative.java)
    ```

5. Biz 模块某些 ClassNotFoundException，排除的太多了，excludeGroupIds=org.apache 把 apache 全部交给基座了，但是基座并没有 http-client。依赖包管理是一个严格的事情，多了也不行，少了也不行，有些是启动报错，有些是运行期报错。

    ```console
    Caused by: java.lang.IllegalStateException: Failed to introspect Class [org.springframework.boot.autoconfigure.elasticsearch.ElasticsearchRestClientConfigurations$RestClientBuilderConfiguration]
      Caused by: java.lang.ClassNotFoundException: org.apache.http.impl.nio.client.HttpAsyncClientBuilder
        at java.base/java.net.URLClassLoader.findClass(URLClassLoader.java:445)
        at java.base/java.lang.ClassLoader.loadClass(ClassLoader.java:593)
        at org.springframework.boot.loader.LaunchedURLClassLoader.loadClass(LaunchedURLClassLoader.java:151)
        at java.base/java.lang.ClassLoader.loadClass(ClassLoader.java:526)
        ... 52 more
    ```

6. Spring Boot AutoConfiguration 问题，可能有以下几种场景，但是排除 AutoConfiguration 后，本地 IDEA 启动联调必须依赖基座。
   - 基座只是加载 jar class，模块负责实例化 Bean，基座需要排除 AutoConfiguration。
   - 基座即加载 jar 又实例化 Bean，模块复用 Bean，模块需要排除 AutoConfiguration。
   - 基座加载 jar，模块不需要实例化 Bean，误触发实例化，常见于@ConditionalOnClass。

7. 不支持 spring-boot-devtools，他有独立的 RestartClassLoader，同理如果其他开源组件有独立 ClassLoader 也可能有问题，需要仔细评估。
8. 不支持 spring-boot-actuator 使用独立端口。

## 总结

收益：

1. 内存占用有明显降低，如果再结合 static、service 共享，把 i18n、xxxCache、xxxUtils、xxxService 沉淀到底座，能大幅降低资源占用。
2. 通用 Bean，甚至 redis、kafka 等连接，也可由基座实例化，只实例化一次，降低资源，同时启动速度加倍。
3. 通用功能基座开发，基座能力越强，上层 biz 开发效率越高，可提高研发效率。

挑战：

1. 文档不友好，功能还处于 Beta 版本，不管是 Koupleless 还是 SOFAArk。如果想真正跑起来，需要仔细去看源码和源码解析的博客，而博客很多已经过时了会把你带进坑去。当然如何能获得官方团队支持，就另说了。
2. 关于基座和 Biz 模块 static 变量的问题，你想共享的时候，是好东西，你不想共享的时候，就需要搞明白这个变量共享了吗，谁加载的，影响范围是哪些，如何做到不共享。目前没想到如何评估 static 的影响范围，只能 case by  case 翻源码。
3. 基座和 Biz 模块磨合，哪些 jar 交给基座，哪些 Bean 交给基座，都需要有严格的限制，既不能多也不能少，否则可能启动失败，可能运行期失败。花费大量的时候维护 pom.xml，需要有人很熟悉 pom 依赖。
4. classloader 模型变更，任何有自定义 classloader 的地方都需要重新评估，可能需要变更代码。

关于 2、3、4，理解了 Koupleless 原理就能理解这几个问题了，每一个都可能让你的应用迁移产生意想不到的效果，需要仔细评估。

如果你是新项目且迫切需要 Koupleless 的功能，不妨一试。最后祝 Koupleless 发展越来越好，如有兴趣可以去开源社区建设。
