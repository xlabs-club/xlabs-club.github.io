---
title: "Spring Boot Start 脚手架定制开发和快速入门"
description: "Spring Boot Start 脚手架定制开发和快速入门"
summary: ""
date: 2024-03-09T14:29:03+08:00
lastmod: 2024-03-09T14:29:03+08:00
draft: false
weight: 50
categories: [Spring Boot, Java]
tags: [Spring Boot, Java]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: ""
  description: ""
  canonical: ""
  noindex: false
---

介绍基于 `start.spring.io` 快速定制自己的 Spring Boot 脚手架，主要应用场景：

1. 规范公司自己的 parent pom，增加特定的依赖项。
2. 根据公司规范生成统一的包结构，统一命名。
3. 根据需要增加特定代码或文件，比如根据公司要求统一 logback.xml、 application.properties 文件。
4. 提供公司自研的二方 jar 包。

## 快速开始

基本步骤：

1. 对于 [spring.initializr](https://github.com/spring-io/initializr) 我们没有定制的需求，直接引用官方的。
2. 拷贝一份 [start.spring.io](https://github.com/spring-io/start.spring.io)，直接基于这个项目开发、部署、运行。以下都是关于如何修改 `start.spring.io`。

`start.spring.io` 主要关注两个模块：

- start-client：前端页面，可以定制些自己的 logo、title 等。
- start-site：是一个标准的 spring boot 项目，实际 run 起来的服务，引用了 start-client，直接 run 这个项目的 main 方法就能看到效果。

主要配置文件：`start-site/src/main/resources/application.yml`，通过修改这个配置文件可以达到的效果如下。

- 修改 start 启动时默认 group，把 `com.example` 改为公司自己的 group。

  ```yaml
  initializr:
    group-id:
      value: com.yourgroup
  ```

- 修改父 pom，使用公司自己的 pom。

  ```yaml
  initializr:
    env:
      maven:
        # use your parent pom
        parent:
          groupId: com.yourself
          artifactId: your-parent
          version: 1.0.0
          # relativePath: ../pom.xml
          includeSpringBootBom: false
  ```

- 限定 Java 和 Spring Boot 版：修改 languages 和 bootVersions 即可。
- 增加公司自己的 starter，参考文件中例子增加即可。

## 核心扩展接口

- ProjectContributor: 用于实现文件结构变化，比如加个文件夹，增加配置文件、代码片段等。
- BuildCustomizer：动态修改 pom.xml，用于修改 maven/gradle 的 dependencies/repository/plugins 等。
- 更多自带定制接口参考：MainSourceCodeCustomizer, MainCompilationUnitCustomizer, MainApplicationTypeCustomizer, TestSourceCodeCustomizer, TestApplicationTypeCustomizer.

场景：生成默认的 logback-spring.xml。

```java
import io.spring.initializr.generator.project.contributor.SingleResourceProjectContributor;

/**
 * 定制 logback xml 文件，从当前项目的`classpath:configuration`拷贝到指定的 src/main/resources 目录下
 */
public class LogbackContributor extends SingleResourceProjectContributor {

  public LogbackContributor() {
    this("classpath:configuration/logback-spring.xml");
  }

  public LogbackContributor(String resourcePattern) {
    super("src/main/resources/logback-spring.xml", resourcePattern);
  }

}
```

场景：按照统一规范生成目录结构。

```java

/**
 * 按照规范生成默认的 java 目录结构
 */
public class DefaultPackageContributor implements ProjectContributor {

  private final ProjectDescription description;

  public DefaultPackageContributor(ProjectDescription description) {
    this.description = description;
  }

  @Override
  public void contribute(Path projectRoot) throws IOException {
    Language language = description.getLanguage();
    // "src/main/java/com.test.demo"
    Path packageRoot = projectRoot.resolve("src/main/")
        .resolve(language.id())
        .resolve(description.getPackageName().replaceAll("\\.","/"));
    Files.createDirectories(packageRoot.resolve("config"));
    Files.createDirectories(packageRoot.resolve("dao"));
    Files.createDirectories(packageRoot.resolve("service"));
    Files.createDirectories(packageRoot.resolve("web"));
  }
}

```

场景：在 xxx 条件下做 xxx。比如我们使用 spock 作为测试框架，spock 使用 groovy 语言。如果引入 spock 的时候，默认在 maven plugin 里增加 groovy 插件 `gmavenplus-plugin`。

```java

class SpockMavenBuildCustomizer implements BuildCustomizer<MavenBuild> {

  @Override
  public void customize(MavenBuild build) {
    // add groovy plugin
    build.plugins()
        .add("org.codehaus.gmavenplus", "gmavenplus-plugin");
  }
}

```

```java
@ProjectGenerationConfiguration
public class MyProjectGenerationConfiguration {

  @Bean
  @ConditionalOnRequestedDependency("spock")
  public SpockMavenBuildCustomizer spockMavenBuildCustomizer() {
    return new SpockMavenBuildCustomizer();
  }

}
```
