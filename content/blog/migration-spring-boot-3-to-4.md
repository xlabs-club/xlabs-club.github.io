---
title: "Spring Boot 3 到 4 迁移完全指南：新特性、废弃功能与实战踩坑经验"
description: "深度解析 Spring Boot 4.0 新特性，包含 Spring Framework 7、Tomcat 11、虚拟线程支持、模块化改造等核心变更，提供完整的迁移步骤、常见问题解决方案和自动化迁移工具使用指南"
date: 2025-11-25T23:20:22+08:00
lastmod: 2025-12-18T22:30:00+08:00
draft: false
weight: 50
categories: [Spring Boot, Java]
tags: [Spring Boot, Spring Boot 4, Spring Framework 7, Jakarta EE, Tomcat 11, Virtual Threads, 迁移指南，OpenRewrite]
contributors: [l10178]
pinned: true
homepage: true
type: docs
seo:
  title: "Spring Boot 4 迁移指南：从 3.x 升级到 4.0 完整教程与踩坑实战"
  description: "Spring Boot 4.0 迁移实战指南，涵盖新特性解析、废弃 API 处理、Spring Framework 7/Tomcat 11 变更、虚拟线程配置、常见问题与 OpenRewrite 自动化迁移工具"
  canonical: ""
  noindex: false
---

2025 年 11 月，Spring Boot 4.0 正式发布，这次升级被业界称为**爆炸性升级**。同时对于云原生应用而言，这是一次**不可错过的性能与效率跃迁**：

- 🐳 **容器化友好**：模块化架构减少 30-50% 运行时占用，镜像更小、启动更快
- ⚡ **启动速度提升 30-50%**：多线程异步启动机制，容器冷启动时间显著缩短，更适合 Kubernetes 快速扩缩容
- 🚀 **2-3 倍吞吐量提升**：虚拟线程原生支持，I/O 密集型微服务资源利用率大幅提升，单实例可承载更高并发
- 🎯 **云原生特性增强**：内置弹性功能（重试、限流）、HTTP 接口客户端自动配置，简化微服务间通信

但这次升级也带来了 36 个废弃 API 移除、模块化架构重构、Tomcat 11 变更等挑战。本文基于 Spring Boot 官方文档和生产环境迁移经验，从原理到踩坑，提供**完整、实用的迁移指南**，助你平稳完成云原生应用的升级。

## Spring Boot 4.0 核心新特性

作为 Spring Boot 3.x 之后的首个大版本更新，Spring Boot 4.0 基于 Spring Framework 7.0、Jakarta EE 11 和 Java 17+（推荐 Java 21 或 25），带来了模块化架构重构、虚拟线程原生支持、HTTP 服务客户端自动配置等重大变化。

Spring Boot 4.0 配套使用 **Spring Cloud 2025.1.x**。虽然版本号看起来只是中号版本变更，但实际上这是一次**大版本变更**，包含了大量破坏性变更和重要更新。

### 模块化架构

Spring Boot 4 将 `spring-boot-autoconfigure` 拆分为多个专注的模块，每个技术都有独立的 starter 和对应的测试 starter。

**主要变化：**

- 模块命名：`spring-boot-<technology>`，包路径：`org.springframework.boot.<technology>`
- Starter 命名：`spring-boot-starter-<technology>` 和 `spring-boot-starter-<technology>-test`
- 之前没有 starter 的技术（如 Flyway、Liquibase）现在需要显式添加对应的 starter

**模块化的优势：**

- **减少 IDE 干扰**：IDE 自动完成只显示你实际使用的技术相关的类和配置属性，不再出现无关的代码提示。例如，如果你不使用 GraphQL，IDE 不会提示 GraphQL 相关的配置属性
- **更小的运行时占用**：只引入实际使用的模块，减少类路径开销和启动扫描成本。Spring Boot 3.5 的 `spring-boot-autoconfigure` 是 2 MiB，模块化后只引入需要的模块，显著减少占用
- **避免意外自动配置**：模块化后，Spring Boot 能更准确地判断你的意图。例如，如果只使用 `WebClient`（通过 `spring-boot-starter-webclient`），不会意外启用 Web 服务器自动配置，不再需要调用 `SpringApplication.setWebApplicationType(WebApplicationType.NONE)`
- **启用新用例**：例如，现在可以独立使用 Micrometer 指标（`spring-boot-starter-micrometer-metrics`），而不需要完整的 Actuator 依赖链
- **更好的维护性**：模块边界成为明确的契约，而不是软约定，便于团队协作和代码维护

**测试支持的模块化：**

`spring-boot-test-autoconfigure` 也被模块化了。测试相关的注解现在位于对应的测试模块中。例如，`@AutoConfigureDataJdbc` 注解现在位于 `spring-boot-starter-data-jdbc-test` 模块中，与 `spring-boot-starter-data-jdbc` 对齐。

**测试 Starter 的传递性：**

所有 test starter 都会传递性地引入 `spring-boot-starter-test`，因此不需要再单独声明 `spring-boot-starter-test`。只需要列出被测试技术对应的 test starter 即可。

**主要废弃 Starter 和替代方案：**

| 废弃 Starter                                      | 替代                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `spring-boot-starter-web`                         | `spring-boot-starter-webmvc`                               |
| `spring-boot-starter-aop`                         | `spring-boot-starter-aspectj`                              |
| `spring-boot-starter-oauth2-authorization-server` | `spring-boot-starter-security-oauth2-authorization-server` |
| `spring-boot-starter-oauth2-client`               | `spring-boot-starter-security-oauth2-client`               |
| `spring-boot-starter-oauth2-resource-server`      | `spring-boot-starter-security-oauth2-resource-server`      |
| `spring-boot-starter-web-services`                | `spring-boot-starter-webservices`                          |

**其他迁移要点：**

- 测试依赖需要添加对应的 `-test` starter，如 `spring-boot-starter-security-test`
- 之前没有 starter 的技术（如 Flyway、Liquibase）现在需要显式添加对应的 starter

**完整的 Starter 列表：**

Spring Boot 4.0 统一了 starter 的使用方式：大多数技术都有专门的 starter，每个 starter 都有对应的 test starter。以下是完整的列表（参考 [官方迁移指南](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide#starters)）：

| Technology                                          | Main Dependency                                                                       | Test Dependency                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Core Starters**                                   |                                                                                       |                                                                                                 |
| AspectJ                                             | `spring-boot-starter-aspectj`                                                         | `spring-boot-starter-aspectj-test`                                                              |
| Cloud Foundry Support                               | `spring-boot-starter-cloudfoundry`                                                    | `spring-boot-starter-cloudfoundry-test`                                                         |
| Jakarta Validation                                  | `spring-boot-starter-validation`                                                      | `spring-boot-starter-validation-test`                                                           |
| Kotlin Serialization                                | `spring-boot-starter-kotlin-serialization`                                            | `spring-boot-starter-kotlin-serialization-test`                                                 |
| Reactor                                             | `spring-boot-starter-reactor`                                                         | `spring-boot-starter-reactor-test`                                                              |
| **Web Server Starters**                             |                                                                                       |                                                                                                 |
| Jetty                                               | `spring-boot-starter-jetty`                                                           | _none_                                                                                          |
| Reactor Netty                                       | `spring-boot-starter-reactor-netty`                                                   | _none_                                                                                          |
| Tomcat                                              | `spring-boot-starter-tomcat`                                                          | _none_                                                                                          |
| **Web Client Starters**                             |                                                                                       |                                                                                                 |
| Spring's Imperative `RestClient` and `RestTemplate` | `spring-boot-starter-restclient`                                                      | `spring-boot-starter-restclient-test`                                                           |
| Spring's Reactive `WebClient`                       | `spring-boot-starter-webclient`                                                       | `spring-boot-starter-webclient-test`                                                            |
| **Web Starters**                                    |                                                                                       |                                                                                                 |
| Jersey                                              | `spring-boot-starter-jersey`                                                          | `spring-boot-starter-jersey-test`                                                               |
| Spring GraphQL                                      | `spring-boot-starter-graphql`                                                         | `spring-boot-starter-graphql-test`                                                              |
| Spring HATEOAS                                      | `spring-boot-starter-hateoas`                                                         | `spring-boot-starter-hateoas-test`                                                              |
| Spring Session Data Redis                           | `spring-boot-starter-session-data-redis`                                              | `spring-boot-starter-session-data-redis-test`                                                   |
| Spring Session JDBC                                 | `spring-boot-starter-session-jdbc`                                                    | `spring-boot-starter-session-jdbc-test`                                                         |
| Spring Web MVC                                      | `spring-boot-starter-webmvc`                                                          | `spring-boot-starter-webmvc-test`                                                               |
| Spring WebFlux                                      | `spring-boot-starter-webflux`                                                         | `spring-boot-starter-webflux-test`                                                              |
| Spring Webservices                                  | `spring-boot-starter-webservices`                                                     | `spring-boot-starter-webservices-test`                                                          |
| **Database Starters**                               |                                                                                       |                                                                                                 |
| Cassandra                                           | `spring-boot-starter-cassandra`                                                       | `spring-boot-starter-cassandra-test`                                                            |
| Couchbase                                           | `spring-boot-starter-couchbase`                                                       | `spring-boot-starter-couchbase-test`                                                            |
| Elasticsearch                                       | `spring-boot-starter-elasticsearch`                                                   | `spring-boot-starter-elasticsearch-test`                                                        |
| Flyway                                              | `spring-boot-starter-flyway`                                                          | `spring-boot-starter-flyway-test`                                                               |
| JDBC                                                | `spring-boot-starter-jdbc`                                                            | `spring-boot-starter-jdbc-test`                                                                 |
| jOOQ                                                | `spring-boot-starter-jooq`                                                            | `spring-boot-starter-jooq-test`                                                                 |
| Liquibase                                           | `spring-boot-starter-liquibase`                                                       | `spring-boot-starter-liquibase-test`                                                            |
| LDAP                                                | `spring-boot-starter-ldap`                                                            | `spring-boot-starter-ldap-test`                                                                 |
| MongoDB                                             | `spring-boot-starter-mongodb`                                                         | `spring-boot-starter-mongodb-test`                                                              |
| Neo4J                                               | `spring-boot-starter-neo4j`                                                           | `spring-boot-starter-neo4j-test`                                                                |
| R2DBC                                               | `spring-boot-starter-r2dbc`                                                           | `spring-boot-starter-r2dbc-test`                                                                |
| **Spring Data Starters**                            |                                                                                       |                                                                                                 |
| Spring Data Cassandra                               | `spring-boot-starter-data-cassandra` 或 `spring-boot-starter-data-cassandra-reactive` | `spring-boot-starter-data-cassandra-test` 或 `spring-boot-starter-data-cassandra-reactive-test` |
| Spring Data Couchbase                               | `spring-boot-starter-data-couchbase` 或 `spring-boot-starter-data-couchbase-reactive` | `spring-boot-starter-data-couchbase-test` 或 `spring-boot-starter-data-couchbase-reactive-test` |
| Spring Data Elasticsearch                           | `spring-boot-starter-data-elasticsearch`                                              | `spring-boot-starter-data-elasticsearch-test`                                                   |
| Spring Data JDBC                                    | `spring-boot-starter-data-jdbc`                                                       | `spring-boot-starter-data-jdbc-test`                                                            |
| Spring Data JPA (using Hibernate)                   | `spring-boot-starter-data-jpa`                                                        | `spring-boot-starter-data-jpa-test`                                                             |
| Spring Data LDAP                                    | `spring-boot-starter-data-ldap`                                                       | `spring-boot-starter-data-ldap-test`                                                            |
| Spring Data MongoDB                                 | `spring-boot-starter-data-mongodb` 或 `spring-boot-starter-data-mongodb-reactive`     | `spring-boot-starter-data-mongodb-test` 或 `spring-boot-starter-data-mongodb-reactive-test`     |
| Spring Data Neo4J                                   | `spring-boot-starter-data-neo4j`                                                      | `spring-boot-starter-data-neo4j-test`                                                           |
| Spring Data R2DBC                                   | `spring-boot-starter-data-r2dbc`                                                      | `spring-boot-starter-data-r2dbc-test`                                                           |
| Spring Data Redis                                   | `spring-boot-starter-data-redis` 或 `spring-boot-starter-data-redis-reactive`         | `spring-boot-starter-data-redis-test` 或 `spring-boot-starter-data-redis-reactive-test`         |
| Spring Data REST                                    | `spring-boot-starter-data-rest`                                                       | `spring-boot-starter-data-rest-test`                                                            |
| **IO Starters**                                     |                                                                                       |                                                                                                 |
| Hazelcast                                           | `spring-boot-starter-hazelcast`                                                       | `spring-boot-starter-hazelcast-test`                                                            |
| Mail                                                | `spring-boot-starter-mail`                                                            | `spring-boot-starter-mail-test`                                                                 |
| Quartz                                              | `spring-boot-starter-quartz`                                                          | `spring-boot-starter-quartz-test`                                                               |
| SendGrid                                            | `spring-boot-starter-sendgrid`                                                        | `spring-boot-starter-sendgrid-test`                                                             |
| Spring Caching Support                              | `spring-boot-starter-cache`                                                           | `spring-boot-starter-cache-test`                                                                |
| Spring Batch (with JDBC)                            | `spring-boot-starter-batch-jdbc`                                                      | `spring-boot-starter-batch-jdbc-test`                                                           |
| Spring Batch (without JDBC)                         | `spring-boot-starter-batch`                                                           | `spring-boot-starter-batch-test`                                                                |
| **JSON Starters**                                   |                                                                                       |                                                                                                 |
| GSON                                                | `spring-boot-starter-gson`                                                            | `spring-boot-starter-gson-test`                                                                 |
| Jackson                                             | `spring-boot-starter-jackson`                                                         | `spring-boot-starter-jackson-test`                                                              |
| JSONB                                               | `spring-boot-starter-jsonb`                                                           | `spring-boot-starter-jsonb-test`                                                                |
| **Messaging Starters**                              |                                                                                       |                                                                                                 |
| ActiveMQ                                            | `spring-boot-starter-activemq`                                                        | `spring-boot-starter-activemq-test`                                                             |
| Artemis                                             | `spring-boot-starter-artemis`                                                         | `spring-boot-starter-artemis-test`                                                              |
| JMS                                                 | `spring-boot-starter-jms`                                                             | `spring-boot-starter-jms-test`                                                                  |
| RSocket                                             | `spring-boot-starter-rsocket`                                                         | `spring-boot-starter-rsocket-test`                                                              |
| Spring AMQP                                         | `spring-boot-starter-amqp`                                                            | `spring-boot-starter-amqp-test`                                                                 |
| Spring Integration                                  | `spring-boot-starter-integration`                                                     | `spring-boot-starter-integration-test`                                                          |
| Spring for Apache Kafka                             | `spring-boot-starter-kafka`                                                           | `spring-boot-starter-kafka-test`                                                                |
| Spring for Apache Pulsar                            | `spring-boot-starter-pulsar`                                                          | `spring-boot-starter-pulsar-test`                                                               |
| Websockets                                          | `spring-boot-starter-websocket`                                                       | `spring-boot-starter-websocket-test`                                                            |
| **Security Starters**                               |                                                                                       |                                                                                                 |
| Spring Security                                     | `spring-boot-starter-security`                                                        | `spring-boot-starter-security-test`                                                             |
| Spring Security OAuth Authorization Server          | `spring-boot-starter-security-oauth2-authorization-server`                            | `spring-boot-starter-security-oauth2-authorization-server-test`                                 |
| Spring Security OAuth Client                        | `spring-boot-starter-security-oauth2-client`                                          | `spring-boot-starter-security-oauth2-client-test`                                               |
| Spring Security OAuth Resource Server               | `spring-boot-starter-security-oauth2-resource-server`                                 | `spring-boot-starter-security-oauth2-resource-server-test`                                      |
| Spring Security SAML                                | `spring-boot-starter-security-saml2`                                                  | `spring-boot-starter-security-saml2-test`                                                       |
| **Templating Starters**                             |                                                                                       |                                                                                                 |
| Freemarker                                          | `spring-boot-starter-freemarker`                                                      | `spring-boot-starter-freemarker-test`                                                           |
| Groovy Templates                                    | `spring-boot-starter-groovy-templates`                                                | `spring-boot-starter-groovy-templates-test`                                                     |
| Mustache                                            | `spring-boot-starter-mustache`                                                        | `spring-boot-starter-mustache-test`                                                             |
| Thymeleaf                                           | `spring-boot-starter-thymeleaf`                                                       | `spring-boot-starter-thymeleaf-test`                                                            |
| **Production-Ready Starters**                       |                                                                                       |                                                                                                 |
| Actuator                                            | `spring-boot-starter-actuator`                                                        | `spring-boot-starter-actuator-test`                                                             |
| Micrometer Metrics                                  | `spring-boot-starter-micrometer-metrics`                                              | `spring-boot-starter-micrometer-metrics-test`                                                   |
| OpenTelemetry                                       | `spring-boot-starter-opentelemetry`                                                   | `spring-boot-starter-opentelemetry-test`                                                        |
| Zipkin                                              | `spring-boot-starter-zipkin`                                                          | `spring-boot-starter-zipkin-test`                                                               |

> **提示：** 所有 test starter 都会传递性地引入 `spring-boot-starter-test`，因此不需要再单独声明 `spring-boot-starter-test`。只需要列出被测试技术对应的 test starter 即可。

**Classic Starters（快速迁移方案）：**

如果需要快速迁移，可以使用 Classic Starters，它们提供了类似 Spring Boot 3.x 的 classpath，让你可以快速恢复所有基础设施的可用性：

```xml
<!-- 替代 spring-boot-starter -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-classic</artifactId>
</dependency>

<!-- 替代 spring-boot-starter-test -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test-classic</artifactId>
    <scope>test</scope>
</dependency>
```

**使用 Classic Starters 的好处：**

- 快速恢复应用功能，无需立即处理所有 starter 替换
- 修复导入错误，验证应用能正常工作
- 作为过渡方案，降低迁移风险

**迁移建议（官方推荐的两步法）：**

1. **第一步**：使用 Classic Starters 快速迁移，修复编译错误，确保应用运行正常
2. **第二步**：逐步移除 Classic Starters，根据更新后的导入语句识别缺失的 starter，添加对应的模块化 starter

> **注意：** 官方建议最终还是要迁移到模块化的 starter，Classic Starters 只是过渡方案。完整的 starter 列表和对应关系请参考 [官方迁移指南](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide#starters)。

### 增强的配置属性元数据

Spring Boot 4 引入了新的注解 **@ConfigurationPropertiesSource**，允许 Spring Boot 读取外部模块中定义的 `@ConfigurationProperties` 类型，这在之前是不可能的。

**使用场景：**

```java
@ConfigurationPropertiesSource("com.example.config")
@ConfigurationProperties(prefix = "app")
public class AppProperties {
    private String name;
    // getters and setters
}
```

**优势：**

- 更清晰的模块化设计
- 改进工具支持（IDE 自动完成、配置提示等）
- 支持跨模块的配置属性定义

### 任务调度增强

Spring Boot 4 现在支持配置多个 `TaskDecorator` Bean，允许你组合多个装饰器来增强任务执行行为。

**使用示例：**

```java
@Configuration
public class TaskConfig {

    @Bean
    public TaskDecorator loggingTaskDecorator() {
        return runnable -> {
            return () -> {
                System.out.println("Task started: " + Thread.currentThread().getName());
                try {
                    runnable.run();
                } finally {
                    System.out.println("Task completed");
                }
            };
        };
    }

    @Bean
    public TaskDecorator mdcTaskDecorator() {
        return runnable -> {
            String traceId = MDC.get("traceId");
            return () -> {
                MDC.put("traceId", traceId);
                try {
                    runnable.run();
                } finally {
                    MDC.clear();
                }
            };
        };
    }
}
```

多个 `TaskDecorator` 会按顺序应用，提供更灵活的任务执行增强能力。

### 包结构变化

模块化架构对包结构也有影响。每个模块现在都有独立的 `org.springframework.boot.<module>` 包路径。根据模块的职责范围，可能包含 API、自动配置、Actuator 相关支持等。

**示例：**

```java
// Spring Boot 3.x
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;

// Spring Boot 4.0
import org.springframework.boot.webmvc.autoconfigure.WebMvcAutoConfiguration;
```

**主要变化：**

- 每个技术模块都有独立的包路径：`org.springframework.boot.<technology>`
- 测试模块包路径：`org.springframework.boot.<technology>.test`
- 自动配置类、Actuator 支持等都位于对应的模块包下
- **如果你有自定义 starter，大概率都需要适配新的包路径**，尤其是使用 class 字符名字，而不是 class 类的。

## Spring Framework 7.0 带来的增强

Spring Boot 4 基于 Spring Framework 7.0 构建，继承了以下特性。

### API 版本控制

Spring Framework 7 原生支持 API 版本管理，这是**首次在 Spring 框架中提供官方支持**。之前虽然可以通过 `@RequestMapping` 实现，但需要大量手动工作。

**配置方式：**

**Java 配置：**

```java
@Configuration
public class WebConfiguration implements WebMvcConfigurer {
    @Override
    public void configureApiVersioning(ApiVersionConfigurer configurer) {
        configurer.useRequestHeader("API-Version");
        // 或使用其他策略：
        // configurer.useQueryParameter("version");
        // configurer.usePathPattern("/api/{version}");
        // configurer.useMediaType("application/vnd.api.v1+json");
    }
}
```

**Spring Boot 配置属性：**

```yaml
spring:
  mvc:
    apiversion:
      use:
        header: API-Version
        # 或使用：
        # query-parameter: version
        # path-pattern: /api/{version}
```

**使用示例：**

```java
@RestController
@RequestMapping("/api")
public class UserController {

    @GetMapping(value = "/users", version = "1")
    public List<UserV1> getUsersV1() {
        return userService.getUsersV1();
    }

    @GetMapping(value = "/users", version = "2")
    public List<UserV2> getUsersV2() {
        return userService.getUsersV2();
    }
}
```

**功能式端点支持：**

```java
RouterFunction<ServerResponse> route = RouterFunctions.route()
    .GET("/hello-world", version("1.2"),
        request -> ServerResponse.ok().body("Hello World"))
    .build();
```

**支持的版本控制策略：**

- **路径版本控制**：`/v1/users`、`/v2/users`（需要在路径中声明 URI 变量）
- **请求头版本控制**：`X-API-Version: 1` 或自定义 header 名称
- **查询参数版本控制**：`/users?version=1`
- **媒体类型版本控制**：`Accept: application/vnd.api.v1+json`

**版本格式：**

默认使用语义化版本（Semantic Versioning），支持 major.minor.patch 格式。如果未指定 minor 和 patch，默认为 0。版本解析器可以自定义，支持日期格式或其他格式。

**废弃处理：**

API 版本控制支持 RFC 9745 标准的废弃处理，可以在响应中发送废弃提示。

### JSpecify 空安全注解

Spring Framework 7 迁移到 JSpecify 注解，这是 Spring 生态系统中**空安全支持的重大里程碑**。JSpecify 是一个由 OpenJDK、Broadcom、Google、JetBrains、Sonar 等组织共同参与的标准项目。

**已支持 JSpecify 的 Spring 项目：**

- Spring Boot 4.0
- Spring Framework 7.0
- Spring Data 4.0
- Spring Security 7.0
- Spring Batch 6.0
- Spring Kafka 4.0
- Spring Integration 7.0
- Spring GraphQL 2.0
- Spring Web Services 5.0
- Spring AMQP 4.0
- Spring Shell 4.0
- Spring Plugin 4.0
- Spring HATEOAS 3.0
- Spring Modulith 2.0
- Spring Vault 4.0
- Spring Cloud Commons 5.0
- Spring Cloud Gateway 5.0
- Micrometer 1.16
- Micrometer Tracing 1.6
- Context Propagation 1.2
- Reactor 2025.0

**使用示例：**

```java
import org.jspecify.annotations.Nullable;
import org.jspecify.annotations.NonNull;

public class UserService {

    public @NonNull User getUser(@NonNull String userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException(userId));
    }

    public @Nullable User findUser(@NonNull String email) {
        return userRepository.findByEmail(email).orElse(null);
    }
}
```

**IDE 支持：**

- **IntelliJ IDEA 2025.3+**：提供完整的 JSpecify 支持，包括复杂的数据流分析
- **Kotlin 2.2**：自动将 JSpecify 注解转换为 Kotlin 空安全类型，告别平台类型（platform types）
- **NullAway**：构建时检查工具，需要 JDK 21+（JDK 17 支持可能在后续版本提供）

**Kotlin 项目注意事项：**

JSpecify 注解会明确标记可空性，Kotlin 编译器会自动识别并转换。如果 Java 接口使用 `@Nullable` 注解，Kotlin 实现必须返回可空类型；如果使用 `@NonNull`，则必须返回非空类型。IntelliJ IDEA 会提供相应的编译错误提示和修复建议。

### 多线程异步启动

Spring Framework 7.0 引入了多线程异步启动机制，可以并行初始化 ApplicationContext，显著加快应用启动速度。

**工作原理：**

- ApplicationContext 启动时，可以并行初始化多个 Bean
- 利用多核 CPU 资源，将串行的 Bean 初始化改为并行执行
- 自动处理 Bean 之间的依赖关系，确保初始化顺序正确

**配置方式：**

```java
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(Application.class);
        // 启用异步启动
        app.setApplicationStartup(new BufferingApplicationStartup(1000));
        app.run(args);
    }
}
```

或者通过配置属性：

```yaml
spring:
  application:
    startup:
      enabled: true
```

**性能提升：**

- 大型应用启动时间可减少 30-50%
- 特别适合 Bean 数量多、初始化耗时的应用
- 充分利用多核 CPU，提升资源利用率

**注意事项：**

- 需要确保 Bean 初始化是线程安全的
- 某些单例 Bean 可能仍需要串行初始化
- 建议在测试环境先验证，确保无并发问题

### HTTP 接口客户端

Spring Framework 7 和 Spring Boot 4 大幅简化了 HTTP 接口客户端的配置。之前需要手动创建 `HttpServiceProxyFactory` 和配置每个客户端，现在可以通过声明式方式自动注册。

**建议：** 虽然 `RestTemplate` 仍可使用，但推荐使用 `RestClient` 或 HTTP 接口客户端（`@HttpExchange`）作为替代方案。

**旧方式（Spring Framework 6 / Spring Boot 3）：**

```java
@HttpExchange(url = "/api/users")
public interface UserClient {
    @GetExchange("/{id}")
    User getUser(@PathVariable String id);

    @PostExchange
    User createUser(@RequestBody UserRequest request);
}

// 需要手动配置每个客户端
@Configuration
public class HttpClientConfig {
    @Bean
    public UserClient userClient(RestClient.Builder builder) {
        RestClient restClient = builder.baseUrl("https://api.example.com").build();
        HttpServiceProxyFactory factory = HttpServiceProxyFactory
            .builderFor(RestClientAdapter.create(restClient)).build();
        return factory.createClient(UserClient.class);
    }

    // 如果有多个客户端，需要重复配置。..
}
```

**新方式（Spring Framework 7 / Spring Boot 4）：**

使用 `@ImportHttpServices` 注解：

```java
@HttpExchange(url = "/api/users")
public interface UserClient {
    @GetExchange("/{id}")
    User getUser(@PathVariable String id);

    @PostExchange
    User createUser(@RequestBody UserRequest request);
}

@Configuration
@ImportHttpServices(group = "api", types = {UserClient.class})
public class HttpClientConfig {
}
```

配置 `application.yml`：

```yaml
spring:
  http:
    client:
      service:
        read-timeout: 2s
        group:
          api:
            base-url: https://api.example.com
```

或使用包扫描自动发现：

```java
@Configuration
@ImportHttpServices(group = "api", basePackages = "com.example.client")
public class HttpClientConfig {
}
```

**多组配置示例：**

如果应用需要集成多个 REST API，可以为每个 API 配置不同的组：

```java
@Configuration
@ImportHttpServices(group = "github", basePackages = "com.example.client.github")
@ImportHttpServices(group = "stackoverflow", basePackages = "com.example.client.stackoverflow")
public class HttpClientConfig {
}
```

对应的配置：

```yaml
spring:
  http:
    client:
      service:
        group:
          github:
            base-url: https://api.github.com
            read-timeout: 5s
          stackoverflow:
            base-url: https://api.stackexchange.com
            read-timeout: 10s
```

**使用 WebClient（响应式）：**

默认使用 `RestClient`，如需使用 `WebClient`，可通过配置切换：

```java
@Configuration
@ImportHttpServices(
    group = "api",
    basePackages = "com.example.client",
    clientType = ClientType.WEB_CLIENT
)
public class HttpClientConfig {
}
```

**优势：**

- **配置简化**：不再需要为每个客户端手动创建 `HttpServiceProxyFactory` 和 Bean
- **自动注册**：所有 HTTP 接口自动注册为 Spring Bean，可直接注入使用
- **统一管理**：通过组（group）概念统一管理同一 API 的所有客户端
- **灵活配置**：支持为不同组配置不同的超时、重试等策略

这样 `com.example.client` 包下所有带 `@HttpExchange` 的接口都会自动注册为 Spring Bean，可以直接注入使用：

```java
@Service
public class UserService {
    private final UserClient userClient;  // 直接注入，无需手动配置

    public UserService(UserClient userClient) {
        this.userClient = userClient;
    }

    public User getUser(String id) {
        return userClient.getUser(id);  // 直接使用
    }
}
```

### 内置弹性功能（Resilience）

Spring Framework 7 引入了强大的弹性工具，直接集成到核心框架中：

- **@Retryable**：自动重试失败的方法调用，支持配置最大尝试次数、延迟、抖动和退避策略，也支持响应式返回类型
- **@ConcurrencyLimit**：限制并发方法调用数量，保护服务和资源（例如限制为单线程访问）

**配置方式：**

```java
@Configuration
@EnableResilientMethods
public class ApplicationConfig {
}

@Service
public class PaymentService {

    @Retryable(
        maxAttempts = 3,
        backoff = @Retryable.Backoff(delay = 2000, multiplier = 2.0)
    )
    @ConcurrencyLimit(value = 2)  // 只允许 2 个并发调用
    public void processPayment(String paymentId) {
        // 处理支付逻辑
    }
}
```

**优势：**

- 无需引入第三方库（如 Resilience4j）
- 与 Spring 生态深度集成
- 支持响应式编程模型
- 配置简单，开箱即用

### 流式 JMS 客户端 API（JmsClient）

Spring Framework 7 引入了 **JmsClient**，类似于 `JdbcClient` 和 `RestClient`，提供流畅的构建器风格 API。这是对传统 JMS 模板的更优雅和可读的替代方案。

**使用示例：**

```java
@Service
public class MessageService {

    private final JmsClient jmsClient;

    public MessageService(JmsClient jmsClient) {
        this.jmsClient = jmsClient;
    }

    public void sendMessage(String destination, String message) {
        jmsClient.create()
            .queue(destination)
            .body(message)
            .send();
    }

    public String receiveMessage(String destination) {
        return jmsClient.create()
            .queue(destination)
            .receive(String.class);
    }
}
```

**优势：**

- 流畅的 API 设计，代码更易读
- 与 `JdbcClient`、`RestClient` 保持一致的风格
- Spring Boot 4 提供自动配置支持

### 统一消息转换（Unified Message Conversion）

Spring Framework 7 简化了消息转换，引入了新的 `HttpMessageConverters` 配置类。这种统一方法借鉴了响应式编解码器的设计，简化了 HTTP 消息的序列化和反序列化。

### Jakarta EE 11 升级

Spring Framework 7 采用 Jakarta EE 11 规范：

- **Servlet 6.1**
- **JPA 3.2**
- **Bean Validation 3.1**
- **WebSocket 2.2**

**JPA 3.2 重要变化：**

之前，`EntityManager` 只能通过 `@PersistenceContext` 注解注入。现在，`EntityManagerFactory` 和共享的 `EntityManager` 都可以使用 `@Inject` 或 `@Autowired` 注入，并支持使用限定符来选择特定的持久化单元（当配置了多个持久化单元时）。

```java
// 旧方式（仍然支持）
@PersistenceContext
private EntityManager entityManager;

// 新方式（Spring Framework 7 / JPA 3.2）
@Autowired
private EntityManager entityManager;

// 多个持久化单元时使用限定符
@Autowired
@Qualifier("primaryEntityManager")
private EntityManager primaryEntityManager;
```

这里要提醒一下：`javax.*` 到 `jakarta.*` 的迁移应该在 Spring Boot 3.0 的时候就已经完成了。如果你还在用 Spring Boot 2.x，那得先升级到 3.x，然后再考虑 4.0。

### JUnit 4 和 Jackson 2.x 弃用

- **JUnit 4**：官方推荐迁移到 JUnit 5
- **Jackson 2.x**：Spring Boot 4 使用 Jackson 3.x

Jackson 3.x 的破坏性变更：

- 部分注解被移除
- 更严格的类型处理
- 模块整合
- `ObjectMapper` 行为变更

迁移示例：

```java
// Jackson 2.x
@JsonInclude(JsonInclude.Include.NON_NULL)
public class User {
    private String name;
    // ...
}

// Jackson 3.x （同样的语法，但内部行为可能不同）
@JsonInclude(JsonInclude.Include.NON_NULL)
public class User {
    private String name;
    // ...
}
```

### 测试上下文暂停机制

Spring Framework 7 引入了一个挺有意思的测试上下文管理机制：

- 测试上下文在不使用的时候会自动暂停（stopped）
- 下次用的时候会自动重启
- 这样能显著降低测试套件的内存占用

该机制可显著降低测试套件的内存占用。

### SpEL 增强

支持 `Optional` 类型和 Elvis 操作符：

```java
@Value("#{userService.findUser('123')?.name ?: 'Unknown'}")
private String userName;
```

### 程序化 Bean 注册（BeanRegistrar）

Spring Framework 7 引入了 `BeanRegistrar` 接口，允许在 `@ConditionalOn...` 注解族不够用时进行动态 Bean 注册。

**Java 实现：**

```java
import org.springframework.context.bean.BeanRegistrar;
import org.springframework.context.bean.BeanRegistry;

public class QuoteProviderRegistrar implements BeanRegistrar {
    @Override
    public void register(BeanRegistry registry, Environment env) {
        registry.registerBean("quoteProviderDb", QuoteProviderDb.class);
        registry.registerBean("quoteProviderFallback",
                QuoteProviderFallback.class,
                spec -> {
                    spec.fallback();
                    spec.order(1);
                });
    }
}
```

**Kotlin DSL 实现（更优雅）：**

Kotlin 2.2 提供了 `BeanRegistrarDsl`，让 Bean 注册更加简洁：

```kotlin
import org.springframework.context.bean.BeanRegistrarDsl

class QuoteProviderRegistrar : BeanRegistrarDsl({
    registerBean<QuoteProviderDb>("quoteProviderDb")
    registerBean<QuoteProviderFallback>(
        name = "quoteProviderFallback",
        fallback = true,
        order = 1
    )
})
```

**使用场景：**

- 根据环境变量或配置动态注册 Bean
- 实现复杂的条件逻辑，超出 `@ConditionalOn...` 注解的能力范围
- 需要根据运行时信息决定注册哪些 Bean

## Tomcat 11 核心变更

Tomcat 11 是 Apache Tomcat 项目第九个主要版本，标志着从传统 Java EE 向现代 Jakarta EE 框架的重要转变。本次升级支持 Jakarta EE 11，实现了：

- **Servlet 6.1** - 改进异步请求处理，提升长运行任务的性能
- **JSP 4.0**
- **EL 6.0**
- **WebSocket 2.2** - 性能和可扩展性显著提升，特别适合实时双向通信场景（如聊天应用、协作工具）
- **Authentication 3.1**

### 虚拟线程支持（Java 21+）

**重要特性：** Tomcat 11 原生支持 Java 21 的 Project Loom 虚拟线程，这是本次升级的**核心亮点之一**。

**性能数据（基于实际测试）：**

根据 Fast Thread 和 Java Code Geeks 的性能基准测试：

| 场景                                        | 平台线程 | 虚拟线程          | 性能提升  |
| ------------------------------------------- | -------- | ----------------- | --------- |
| **I/O 密集型应用**（数据库查询、HTTP 调用） | 基准     | 2-3x 吞吐量       | +100-200% |
| **高并发 Web 请求**（1000+ 并发）           | 基准     | 2-3x 吞吐量       | +100-200% |
| **CPU 密集型应用**                          | 基准     | 无明显提升        | 0%        |
| **内存占用**                                | 基准     | -30-50%（线程栈） | -30-50%   |
| **响应时间（P99）**                         | 基准     | -20-40%           | -20-40%   |

**适用场景：**

- ✅ **推荐使用**：REST API、数据库查询、HTTP 客户端调用、文件 I/O、消息队列消费
- ❌ **不推荐使用**：CPU 密集型计算、图像处理、加密解密、复杂算法

**实际案例：**

一个典型的 Spring Boot Web 应用（处理 REST 请求，调用数据库和外部 API）：

- **使用平台线程**：1000 并发请求，吞吐量约 500 req/s，P99 延迟 200ms
- **使用虚拟线程**：1000 并发请求，吞吐量约 1200-1500 req/s，P99 延迟 120ms
- **性能提升**：吞吐量提升 2-3 倍，延迟降低 40%

**优势：**

- 轻量级并发模型，简化线程管理
- 相比传统线程模型，提供更好的可扩展性
- 特别适合 I/O 密集型应用，可以处理大量并发连接

**配置方式：**

在 Spring Boot 4 中，虚拟线程支持通过配置属性启用：

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

**适用场景：**

- Web 请求处理
- WebSocket 连接管理
- 高并发 I/O 操作

### WebSocket 2.2 性能提升

**重要变化：** Tomcat 11 升级到 Jakarta WebSocket 2.2，带来显著的性能和可扩展性提升。

**主要改进：**

- 更高效的实时双向通信处理
- 改进的流式数据传输能力
- 更好的并发连接管理
- 特别适合需要实时更新的应用（如聊天、协作工具、实时数据流）

**与 HTTP/2 和异步处理的协同：**

Tomcat 11 的 WebSocket 改进与 HTTP/2 支持和异步处理能力协同工作，确保更响应式和可扩展的 Web 应用。

### Servlet 6.1 异步处理改进

**重要变化：** Jakarta Servlet 6.1 改进了 Web 应用处理 HTTP 请求的方式，特别是异步请求处理。

**主要改进：**

- 更高效的异步请求处理机制
- 提升长运行任务的性能
- 更好的资源利用率

### 安全增强

**重要变化：** Tomcat 11 引入了多项安全增强。

**主要改进：**

- **更好的 TLS/SSL 默认配置** - 使管理员更容易建立安全的 HTTPS 连接，开箱即用
- 改进的安全实践和默认设置

### 最低 Java 版本要求

Tomcat 11 要求至少 **Java SE 17**，这个和 Spring Boot 4 的要求一致。

**影响：**

- 确保 Tomcat 能够利用最新的 Java 语言特性和性能改进
- 包括增强的内存管理、Records、更高效的 switch 表达式等
- 需要从旧版本 Java 升级的应用需要特别注意

### OpenSSL 支持（Java 22+）

如果你用的是 Java 22+，Tomcat 11 支持通过 FFM（Foreign Function & Memory API）使用 OpenSSL，性能会更好。

### javax. _到 jakarta._ 命名空间迁移

**重要提醒：** 迁移到 Tomcat 11 的一个挑战性方面是需要重构应用以适应从 `javax.*` 到 `jakarta.*` 命名空间的切换。

**影响：**

- 这是从早期 Tomcat 版本迁移的基础性变更
- 特别是使用 Java EE 的应用需要特别注意
- Tomcat 11 提供了 [迁移工具](https://github.com/apache/tomcat-jakartaee-migration/blob/main/README.md) 来支持这一转换
- 需要仔细测试以确保应用在新命名空间下继续正常工作

**注意：** 如果你还在使用 Spring Boot 2.x，需要先升级到 Spring Boot 3.x（已完成 `javax.*` 到 `jakarta.*` 迁移），然后再考虑升级到 Spring Boot 4.0。

### HTTP Header 大小写处理变化

Tomcat 11 使用 **header name 的原始大小写**来存储 HTTP/1.1 request headers，而不是强制将其转换为小写。**以前 Tomcat 会自动转小写，现在不会了**。

**主要影响：**

- 取 Header 时一定要关注大小写
- 建议按照 RFC 7230 建议，全链路都统一使用小写
- 如果代码中直接比较 header 名称字符串，可能因为大小写不匹配而失败
- Spring Framework 7.0 的 `HttpHeaders` API 也有相应变化

## 废弃功能与破坏性变更

### 移除的废弃 API

Spring Boot 4.0 这次移除了 36 个废弃类，大概占了所有废弃 API 的 88%。迁移的时候这些地方需要特别注意：

#### MockBean 和 SpyBean 移除

**影响：** 测试代码中广泛使用。旧写法：

```java
// Spring Boot 3.x （已废弃，4.0 移除）
@SpringBootTest
class UserServiceTest {
    @MockBean
    private UserRepository userRepository;
}
```

新写法：

```java
// Spring Boot 4.0 （使用 Spring 官方支持）
@SpringBootTest
class UserServiceTest {
    @MockitoBean
    private UserRepository userRepository;
}
```

### MockitoTestExecutionListener 移除

Spring Boot 4.0 移除了该监听器，使用 Spring 的原生 Mockito 支持。

### WebSecurityConfigurerAdapter 移除

该改动在 Spring Boot 3.x 时已废弃，4.0 正式移除。

旧写法：

```java
// Spring Boot 2.x/3.x （已废弃）
@Configuration
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.authorizeRequests()
            .antMatchers("/public/**").permitAll()
            .anyRequest().authenticated();
    }
}
```

需要改成新的方式：

```java
// Spring Boot 4.0
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/public/**").permitAll()
                .anyRequest().authenticated()
            )
            .build();
    }
}
```

该改动在 Spring Boot 3.x 时已废弃，4.0 正式移除。

### Undertow 支持移除

Undertow 目前不兼容 Servlet 6.1，Spring Boot 4.0 移除了对它的支持：

```xml
<!-- Spring Boot 4.0 不再支持 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-undertow</artifactId>
</dependency>
```

**替代方案：**

- 切换到 Tomcat 11（推荐）
- 使用 Jetty 12.1+
- 等待 Undertow 支持 Servlet 6.1

### Spring Batch 默认行为变更

Spring Batch 现在默认在内存中存储元数据，不再使用数据库。这可能导致 Job 执行历史丢失：

```xml
<!-- 如果需要持久化元数据，显式添加 JDBC 支持 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-batch-jdbc</artifactId>
</dependency>
```

### Reactive Pulsar 支持移除

Spring Pulsar 移除了 Reactor 支持，所以 Spring Boot 4.0 也相应移除了响应式 Pulsar 客户端的自动配置。

### Embedded Executable Uber Jar Launch Scripts 移除

Spring Boot 4.0 移除了用于创建"完全可执行" jar 文件的嵌入式启动脚本支持。该功能仅适用于类 Unix 系统，且与 [高效部署建议](https://docs.spring.io/spring-boot/4.0-SNAPSHOT/reference/packaging/efficient.html) 冲突。

如果需要类似功能，可以使用 Gradle 的 application plugin 等替代方案。你仍然可以使用 Spring Boot 的构建插件创建 uber jar，并通过 `java -jar` 运行。

### Spring Session Hazelcast/MongoDB 移除

Spring Session Hazelcast 和 Spring Session MongoDB 现在分别由 Hazelcast 团队和 MongoDB 团队维护，Spring Boot 4.0 移除了对它们的直接支持。如需使用，请直接使用对应的 starter。

## 常见问题与解决方案

### HTTP Header 大小写问题

**问题**：Header 访问失败或行为不一致

升级到 Tomcat 11.0.12+ 和 Spring Framework 7.0 后，某些 header 访问可能出现问题。这是 Spring Boot 4 迁移中**必须关注的坑**。

**原因：**

- **Tomcat 11.0.12+**：HTTP 请求头名称会保留原始大小写，而不是强制转换为小写（**以前 Tomcat 会自动转小写，现在不会了**）
- Spring Framework 7.0：`HttpHeaders` API 不再继承 `MultiValueMap`
- Header 名称大小写不敏感，但某些代码可能依赖特定的大小写格式或直接比较 header 名称

**建议：** 按照 RFC 7230 建议，全链路都统一使用小写 header 名称。

**解决方案：**

- 更新 `HttpHeaders` 的使用方式：

```java
// 旧代码（Spring Framework 6.x）
HttpHeaders headers = new HttpHeaders();
headers.add("Content-Type", "application/json");
String contentType = headers.getFirst("Content-Type");

// 新代码（Spring Framework 7.0）
HttpHeaders headers = new HttpHeaders();
headers.add("Content-Type", "application/json");
String contentType = headers.getFirst("Content-Type"); // 仍然可用
// 或使用
boolean hasContentType = headers.contains("Content-Type"); // 大小写不敏感
```

- 统一使用标准格式的 header 名称：

```java
// 推荐：使用标准格式
headers.add("Content-Type", "application/json");
headers.add("Authorization", "Bearer token");
headers.add("X-Custom-Header", "value");
```

- 更新 header 名称比较的代码：

```java
// 问题代码：直接字符串比较可能失败
Enumeration<String> headerNames = request.getHeaderNames();
while (headerNames.hasMoreElements()) {
    String name = headerNames.nextElement();
    if (name.equals("content-type")) { // 可能失败，name 可能是 "Content-Type"
        // ...
    }
}

// 推荐：使用大小写不敏感比较
if (name.equalsIgnoreCase("content-type")) {
    // ...
}
```

- 更新测试代码：

```java
// MockHttpServletRequest 的行为已更新
MockHttpServletRequest request = new MockHttpServletRequest();
request.addHeader("Content-Type", "application/json");

// 以下都能正常工作（大小写不敏感）
assertThat(request.getHeader("Content-Type")).isNotNull();
assertThat(request.getHeader("content-type")).isNotNull();
assertThat(request.getHeader("CONTENT-TYPE")).isNotNull();

// 但遍历时需要注意原始大小写
Enumeration<String> names = request.getHeaderNames();
while (names.hasMoreElements()) {
    String name = names.nextElement();
    // name 可能是 "Content-Type" 而不是 "content-type"
    assertThat(name).isEqualTo("Content-Type"); // 使用原始大小写
}
```

### 编译时 Nullability 错误

**问题**：JSpecify 注解导致 Kotlin 或空值检查工具报错

Kotlin 项目可能遇到以下错误：

```text
error: [nullness] incompatible types in return.
  required: @NonNull String
  found:    @Nullable String
```

**解决方案**：

```kotlin
// Kotlin 中处理可空类型
val user: User? = userService.findUser("123")
val name: String = user?.name ?: "Unknown"
```

或者临时禁用严格空值检查：

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
        <compilerArgs>
            <arg>-Xlint:-nullness</arg>
        </compilerArgs>
    </configuration>
</plugin>
```

### Jackson 3.x 序列化问题

**问题**：JSON 序列化/反序列化行为变更

Jackson 3.x 的行为和 2.x 有些不一样，可能会导致一些序列化问题。

**解决方案**：

```java
@Configuration
public class JacksonConfig {

    @Bean
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        // 恢复 Jackson 2.x 的兼容性行为
        mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        mapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);
        mapper.registerModule(new JavaTimeModule());
        return mapper;
    }
}
```

### 第三方库不兼容

**问题**：某些库依赖旧版本的 Spring 或 Jakarta API

部分第三方库可能尚未适配 Spring Boot 4.0。

**解决方案**：

1. 检查库的最新版本
2. 使用依赖排除和强制版本：

```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>legacy-library</artifactId>
    <version>1.0.0</version>
    <exclusions>
        <exclusion>
            <groupId>org.springframework</groupId>
            <artifactId>*</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```

- 考虑替换为兼容的库

### Spring Batch 元数据丢失

**问题**：升级后找不到 Job 执行历史

升级后 Job 执行历史丢失，原因是 Spring Batch 默认行为变更。

**解决方案**：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-batch-jdbc</artifactId>
</dependency>
```

```yaml
spring:
  batch:
    jdbc:
      initialize-schema: always
```

### Undertow 无法使用

**问题**：`spring-boot-starter-undertow` 不再可用

**解决方案**：切换到 Tomcat：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <!-- 默认使用 Tomcat，无需额外配置 -->
</dependency>
```

如果需要 Jetty：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <exclusion>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-tomcat</artifactId>
        </exclusion>
    </exclusions>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jetty</artifactId>
</dependency>
```

### 虚拟线程性能未达预期

**问题**：启用虚拟线程后性能无明显提升

**可能原因：**

- 应用是 CPU 密集型的（虚拟线程对这种情况没用）
- 数据库连接池配置不当
- 用了同步的阻塞代码（比如 `synchronized`）

**解决方案**：

```yaml
# 优化数据库连接池
spring:
  datasource:
    hikari:
      maximum-pool-size: 50  # 虚拟线程环境可适当增加
      minimum-idle: 10

# 确保启用虚拟线程
spring:
  threads:
    virtual:
      enabled: true
```

使用 JFR (Java Flight Recorder) 分析：

```bash
java -XX:StartFlightRecording=filename=recording.jfr -jar app.jar
```

### 测试上下文缓存问题

**问题**：测试上下文自动暂停导致测试变慢

Spring Framework 7 的测试上下文暂停机制可能导致测试变慢。

**解决方案**：

调整测试上下文缓存配置：

```java
@SpringBootTest
@TestPropertySource(properties = {
    "spring.test.context.cache.maxSize=10"
})
class MyTest {
    // ...
}
```

## 自动化迁移工具

### OpenRewrite

OpenRewrite 是开源的自动化代码重构工具，支持 Spring Boot 迁移。

**Maven 集成：**

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.openrewrite.maven</groupId>
            <artifactId>rewrite-maven-plugin</artifactId>
            <version>5.40.0</version>
            <configuration>
                <activeRecipes>
                    <recipe>org.openrewrite.java.spring.boot4.UpgradeSpringBoot_4_0</recipe>
                </activeRecipes>
            </configuration>
            <dependencies>
                <dependency>
                    <groupId>org.openrewrite.recipe</groupId>
                    <artifactId>rewrite-spring</artifactId>
                    <version>5.22.0</version>
                </dependency>
            </dependencies>
        </plugin>
    </plugins>
</build>
```

**Gradle 集成：**

```groovy
plugins {
    id 'org.openrewrite.rewrite' version '6.25.0'
}

rewrite {
    activeRecipe('org.openrewrite.java.spring.boot4.UpgradeSpringBoot_4_0')
}

dependencies {
    rewrite 'org.openrewrite.recipe:rewrite-spring:5.22.0'
}
```

**运行迁移：**

```bash
# Maven: 预览变更
mvn rewrite:dryRun

# Maven: 应用变更
mvn rewrite:run

# Gradle: 预览变更
./gradlew rewriteDryRun

# Gradle: 应用变更
./gradlew rewriteRun
```

**主要功能：**

- 自动升级 Spring Boot 版本号
- 替换废弃的 API（如 `@MockBean` → `@MockitoBean`）
- 更新 import 语句
- 修复依赖冲突
- 调整配置文件格式
- 重构安全配置（移除 `WebSecurityConfigurerAdapter`）

#### 示例：迁移安全配置

OpenRewrite 会自动将：

```java
@Configuration
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.authorizeRequests().anyRequest().authenticated();
    }
}
```

重构为：

```java
@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http.authorizeHttpRequests(auth ->
            auth.anyRequest().authenticated()
        ).build();
    }
}
```

### Spring Boot Migrator

[Spring Boot Migrator](https://github.com/spring-projects-experimental/spring-boot-migrator) 是 Spring 官方的实验性工具，基于 OpenRewrite，专门用于将传统 Spring 应用迁移到 Spring Boot，同时提供 Spring Boot 版本升级。

**主要功能：**

- 将传统 Spring 项目初始化为 Spring Boot 应用
- 将 Spring XML 配置转换为 Java 配置
- Spring Boot 版本升级

```bash
# 安装
git clone https://github.com/spring-projects-experimental/spring-boot-migrator.git
cd spring-boot-migrator
./mvnw clean install

# 扫描项目
java -jar applications/cli/target/spring-boot-migrator.jar scan /path/to/project

# 应用迁移
java -jar applications/cli/target/spring-boot-migrator.jar migrate /path/to/project
```

### Windup (Red Hat)

[Windup](https://github.com/windup/windup) 是 Red Hat 提供的 Java 应用现代化和迁移工具，支持大规模 Java 应用迁移。

**主要功能：**

- 代码分析和迁移评估
- 支持多种迁移场景（Java 版本升级、框架迁移、云迁移等）
- 生成迁移报告和评估工作量

**适用场景：**

- 大型企业级应用迁移
- 多项目批量迁移
- 云原生应用迁移

### IntelliJ IDEA 迁移助手

IntelliJ IDEA 2025.3+ 内置了 Spring Boot 4 迁移支持：

1. 打开项目
2. 右键点击 `pom.xml` 或 `build.gradle`
3. 选择 Refactor → Migrate to Spring Boot 4.0
4. 按照向导完成迁移

### Eclipse Transformer

从 Spring Boot 2.x 迁移时，可使用 Eclipse Transformer 批量转换 `javax.*` 到 `jakarta.*`：

```bash
java -jar transformer.jar /path/to/project /path/to/output
```

## 参考资料

### 官方文档

- [Spring Boot 4.0.0 Official Release](https://spring.io/blog/2025/11/20/spring-boot-4-0-0-available-now/)
- [Spring Boot 4.0 Release Notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Release-Notes) - GitHub Wiki
- [Spring Boot 4.0 Migration Guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide) - GitHub Wiki，**必读**
- [Spring Framework 7.0 Release Notes](https://github.com/spring-projects/spring-framework/wiki/Spring-Framework-7.0-Release-Notes)
- [Spring Framework 7.0 General Availability](https://spring.io/blog/2025/11/13/spring-framework-7-0-general-availability/)

### 技术文章

- [Modularizing Spring Boot](https://spring.io/blog/2025/10/28/modularizing-spring-boot/) - Spring 官方对模块化改造的详细说明
- [Spring Boot 4 and Spring Framework 7: Key Features and Changes](https://loiane.com/2025/08/spring-boot-4-spring-framework-7-key-features/) - Loiane Groner 的详细解读
- [Spring Boot 4 & Spring Framework 7 – What's New | Baeldung](https://www.baeldung.com/spring-boot-4-spring-framework-7) - Baeldung 权威教程
- [Spring Boot 4: Leaner, Safer Apps and a New Kotlin Baseline](https://blog.jetbrains.com/idea/2025/11/spring-boot-4/) - JetBrains 官方对 Spring Boot 4 的分析
- [Spring Framework 7 and Spring Boot 4 Deliver API Versioning, Resilience, and Null-Safe Annotations](https://www.infoq.com/news/2025/11/spring-7-spring-boot-4/) - InfoQ 深度报道
- [Preparing for Spring Framework 7 and Spring Boot 4](https://foojay.io/today/preparing-for-spring-framework-7-and-spring-boot-4/) - Foojay.io 对 Spring Framework 7 和 Spring Boot 4 新特性的全面介绍

### 迁移经验

- [Spring Boot 4 Migration Guide: Faster, Safer, at Scale](https://www.moderne.ai/blog/spring-boot-4x-migration-guide) - Moderne.ai 的企业级迁移指南
- [The Spring Boot 4 Migration Hack Every Developer Needs to Know in 2025](https://medium.com/@kanishks772/the-spring-boot-4-migration-hack-every-developer-needs-to-know-in-2025-7c8ae3529cff) - 实战技巧分享
- [Migration to Spring Boot 4.0: A Performance Enhancements Guide](https://medium.com/@javedmj786/migration-to-spring-boot-4-0-a-performance-enhancements-guide-aee2a90c303e) - 性能优化经验
- [Migrating to Spring Boot 3+: 7 Subtle Pitfalls and How to Fix Them](https://medium.com/@vikrantdheer/migrating-to-spring-boot-3-7-subtle-pitfalls-and-how-to-fix-them-1ac457e6b098) - 常见问题解决
- [Java 25 完整升级指南：从 Java 8 到 Java 25](https://www.xlabs.club/blog/migrating-java8-to-java25/) - Java 版本升级完整指南，包含新特性、性能优化、迁移实战和工具推荐

### 虚拟线程

- [Virtual Threads Performance in Spring Boot](https://blog.fastthread.io/virtual-threads-performance-in-spring-boot/) - Fast Thread 的性能基准测试
- [Spring Boot Performance with Java Virtual Threads](https://www.javacodegeeks.com/2025/04/spring-boot-performance-with-java-virtual-threads.html) - Java Code Geeks 的性能分析
- [Working with Virtual Threads in Spring | Baeldung](https://www.baeldung.com/spring-6-virtual-threads) - Baeldung 虚拟线程教程
- [Spring Boot 4 and Virtual Threads: A Practical, High-Impact Upgrade](https://medium.com/@oleksandr.dendeberia/spring-boot-4-and-virtual-threads-a-practical-high-impact-upgrade-for-modern-java-development-10631f4f427b) - 虚拟线程实战

### 迁移工具

- [OpenRewrite: Migrate to Spring Boot 4.0](https://docs.openrewrite.org/recipes/java/spring/boot4/upgradespringboot_4_0-community-edition) - OpenRewrite 官方文档
- [Spring Boot Migrator](https://github.com/spring-projects-experimental/spring-boot-migrator) - Spring 官方迁移工具
- [Windup](https://windup.github.io/) - Red Hat 应用现代化工具
- [EMT4J](https://github.com/adoptium/emt4j) - Eclipse Java 版本迁移工具
- [Moderne.ai](https://www.moderne.ai/) - 企业级 OpenRewrite 托管服务
