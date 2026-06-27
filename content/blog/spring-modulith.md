---
title: "Spring Modulith 模块化试验报告：构建可演进的模块化单体架构"
description: "使用 Spring Modulith 实现服务模块化，验证模块化单体架构在中小规模应用中的可行性、收益与限制。"
summary: ""
date: 2024-03-08T19:21:26+08:00
lastmod: 2024-03-08T19:21:26+08:00
draft: false
weight: 50
categories: [Java, Spring Boot]
tags: [Java, Spring Boot, Spring Modulith, 模块化, 架构设计]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "Spring Modulith 模块化试验报告：构建可演进的模块化单体"
  description: "使用 Spring Modulith 实现服务模块化，验证模块化单体架构在中小规模应用中的可行性、收益与限制。"
  canonical: ""
  noindex: false
---

Spring Modulith 是 Spring 团队推出的模块化单体（Modular Monolith）支持库，旨在帮助开发者在单体应用中实现清晰的模块边界、依赖约束和集成测试，避免单体应用随着业务增长退化为"大泥球"。

## 为什么关注模块化单体

微服务架构并非银弹。对于中小规模团队和项目，微服务的成本（运维复杂度、分布式事务、网络延迟）往往超过其收益。模块化单体是一种折中方案：

- **清晰的内部边界**：通过包结构和依赖约束强制执行模块隔离。
- **单体部署**：避免分布式系统的大多数复杂性。
- **可演进**：当某个模块确实需要独立部署时，提取为微服务的成本很低。

## 核心功能

### 1. 模块定义

模块是应用包（Application Module Package），通常是一个顶层包：

```
com.example.app
├── order/           ← 模块
│   ├── Order.java
│   ├── OrderService.java
│   └── OrderRepository.java
├── inventory/       ← 模块
│   ├── InventoryService.java
│   └── InventoryRepository.java
└── Application.java
```

### 2. 依赖验证

Spring Modulith 提供了 `ModulithicTest` 来自动验证模块间的依赖是否符合预期：

```java
@ModulithicTest
class ModularityTest {

    @Test
    void verifyModularity(ApplicationModules modules) {
        modules.verify();
    }
}
```

如果 `order` 模块直接引用了 `inventory` 的内部类（而非暴露的 API），测试会失败并给出具体原因。

### 3. 模块间通信

Spring Modulith 支持通过 Spring 事件在模块间异步通信，保持模块的松耦合：

```java
// order 模块发布事件
@ApplicationModuleListener
public class OrderEventListener {
    // 自动感知事件来源模块
    public void on(OrderCompleted event) {
        // 处理订单完成逻辑
    }
}
```

此外还支持通过 `@Externalized` 注解将事件持久化到数据库或消息队列（如 Kafka、RabbitMQ），为未来拆分为独立服务做准备。

### 4. 模块文档

自动生成模块依赖关系图：

```java
@ModulithicTest
class DocumentationTest {

    @Test
    void writeDocumentation(ApplicationModules modules) {
        new Documenter(modules)
            .writeDocumentation()
            .writeIndividualModulesAsPlantUml();
    }
}
```

运行后在 `target/spring-modulith-docs/` 下生成 PlantUML 图，展示模块间的依赖关系。

## 实践验证

在试验项目中应用 Spring Modulith 后，几点观察：

### 收益

1. **边界显式化**：在 IDE 中，跨模块引用内部类会产生编译警告，避免无意识的耦合。
2. **测试覆盖**：`ModulithicTest` 将架构约束变为可测试的、CI 可拦截的规则。
3. **低侵入性**：不需要重构现有代码结构，渐进式引入约束——从宽松到严格逐步收紧。
4. **事件机制**：`@ApplicationModuleListener` 让模块间异步通信不需要手动配置消息队列，同时为未来的外部化保留了扩展点。

### 限制

1. **仅限 Spring Boot 3.x+**：依赖 Spring Framework 6 和 Spring Boot 3。
2. **运行时未强制隔离**：与 Java Module System (JPMS) 不同，Modulith 主要在编译期和测试期验证，运行时仍可能通过反射绕过。
3. **并非替代品**：如果团队已经有成熟的微服务拆分方案，Modulith 不试图取代——它更适合仍在单体阶段、需要清晰边界的项目。

## 使用建议

- **保留 API 包**：每个模块暴露一个 `api` 子包，仅 API 包中的类型可被其他模块引用。
- **禁止循环依赖**：通过 `modules.verify()` 在 CI 中拦截，越早发现越容易解决。
- **渐进式使用**：先启用依赖验证，再逐步引入事件机制和文档生成。
- **不要过早拆分**：Modulith 帮助你在单体中保持清晰边界，当某个模块真的需要独立伸缩或由独立团队拥有时，拆分的代价很小——提取 API 包作为 RPC 接口，内部逻辑独立部署即可。

## 参考资料

- [Spring Modulith 官方文档](https://docs.spring.io/spring-modulith/reference/)
- [Modular Monolith with Spring Modulith - Baeldung](https://www.baeldung.com/spring-modulith)
