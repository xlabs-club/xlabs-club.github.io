---
title: "GraalVM 入门与实践：Native Image 编译和性能对比"
description: "介绍 GraalVM 的核心特性、Native Image 编译实践、与 OpenJDK 的 GC 性能对比，以及 Spring Boot 集成方案。"
summary: "介绍 GraalVM 的核心特性、Native Image 编译实践、与 OpenJDK 的 GC 性能对比，以及 Spring Boot 集成方案"
date: 2024-03-08T16:46:12+08:00
lastmod: 2024-03-08T16:46:12+08:00
draft: false
weight: 50
categories: [Java]
tags: [Java, GraalVM, Native Image, 性能优化, Spring Boot]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "GraalVM 入门与实践：Native Image 编译和性能对比"
  description: "介绍 GraalVM 的核心特性、Native Image 编译实践、与 OpenJDK 的 GC 性能对比，以及 Spring Boot 集成方案。"
  canonical: ""
  noindex: false
---

GraalVM 是 Oracle 开发的高性能 JDK 发行版，除了替代标准 JDK 外，其核心亮点是 **Native Image**——将 Java 应用提前编译（AOT）为独立的原生可执行文件，实现毫秒级启动和极低内存占用。

## GraalVM 核心特性

1. **Native Image (AOT 编译)**：将 Java 字节码编译为原生二进制，启动时间从秒级降至毫秒级。
2. **JIT 编译器 (Graal JIT)**：可作为 HotSpot 的替代 JIT 编译器，在某些场景下性能优于 C2。
3. **多语言支持 (Truffle Framework)**：在同一运行时中运行 JavaScript、Python、Ruby、R 等语言。
4. **GC 性能**：GraalVM CE 使用 Serial GC / G1 GC；GraalVM EE 提供更优的 GC 算法。

## Native Image 快速入门

### 安装 GraalVM

```bash
# SDKMAN 安装（推荐）
sdk install java 23-graal

# 安装 native-image 工具
gu install native-image
```

### 编译一个简单应用

```java
// HelloWorld.java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, GraalVM Native Image!");
    }
}
```

```bash
javac HelloWorld.java
native-image HelloWorld
./helloworld
# 输出: Hello, GraalVM Native Image!
```

### Spring Boot 集成

Spring Boot 3.x 原生支持 GraalVM Native Image：

```xml
<plugin>
    <groupId>org.graalvm.buildtools</groupId>
    <artifactId>native-maven-plugin</artifactId>
</plugin>
```

```bash
# 使用 Spring Boot Maven Plugin 编译 Native Image
mvn -Pnative spring-boot:build-image
# 或
mvn -Pnative native:compile
```

生成的二进制文件无需 JVM 即可运行，启动时间可缩短至 0.1s 以内。

## 性能对比

### 启动时间

| 运行时 | 启动时间 |
|---|---|
| JVM (HotSpot) | ~2-3s |
| JVM (CRaC/Spring Native 预加载) | ~0.5s |
| **GraalVM Native Image** | **~0.05-0.1s** |

### 内存占用

| 运行时 | 基准内存占用 |
|---|---|
| JVM + Spring Boot | ~150-250MB |
| **GraalVM Native Image** | **~30-60MB** |

### 吞吐量（稳定状态后）

在长时间运行的稳定状态下，JVM JIT 编译后的代码通常吞吐量更高。Native Image 适合短生命周期、频繁启动的场景（Serverless、CI Job、CLI 工具）。

## GraalVM GC vs OpenJDK GC

参考资料：[GraalVM and OpenJDK GC Performance Comparison](https://blog.gceasy.io/graalvm-vs-openjdk-gc-performance-comparison/)

简要结论：

- GraalVM CE 的 GC 性能与 OpenJDK 基本持平。
- GraalVM EE 的 GC 在某些场景下有 10-20% 性能优势。
- 对于 Native Image，默认使用 Serial GC；社区版不支持 G1 GC（Enterprise 版支持）。

## Native Image 的限制

Native Image 并非万能，以下场景需要特别注意：

1. **反射**：需要提前配置 `reflect-config.json`，或使用 `-H:+AddAllCharsets` 等参数。Spring Boot 的 AOT 引擎可自动生成大部分配置。
2. **动态代理**：需要在编译时声明代理接口。
3. **JNI**：需要额外配置。
4. **资源文件**：需要通过 `-H:IncludeResources` 声明。
5. **序列化**：部分序列化框架可能不兼容（Jackson 已适配）。
6. **Java Agent**：Native Image 不支持运行时 attach Agent。

GraalVM 提供了 [Tracing Agent](https://www.graalvm.org/latest/reference-manual/native-image/metadata/#tracing-agent) 可以在 JVM 模式下运行并自动生成所需的配置：

```bash
java -agentlib:native-image-agent=config-output-dir=src/main/resources/META-INF/native-image -jar app.jar
```

## 适用场景

- **Serverless / FaaS**：冷启动从秒级降至毫秒级。
- **CLI 工具**：无需安装 JRE，单文件分发。
- **微服务（短生命周期）**：Kubernetes 中快速扩缩容。
- **CI/CD Pipeline 中的短任务**：减少 JVM 启动开销。

对于长期运行的、需要峰值吞吐量的后台服务，传统 JVM 仍然是更好的选择。

## 使用 Graal JIT 编译

GraalVM 也提供了替代 HotSpot C2 编译器的 Graal JIT 编译器。在标准 JDK 上启用：

```bash
java -XX:+UnlockExperimentalVMOptions -XX:+UseGraalJIT -Djdk.graal.ShowConfiguration=info -jar app.jar
```

Graal JIT 在某些计算密集型场景中能比 C2 产生更优的机器代码，但在大多数常规业务应用中差异不明显。
