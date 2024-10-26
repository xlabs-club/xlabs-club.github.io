---
title: "从 Spring 到 Spring Boot，迁移升级快速入门以及各种踩坑记录"
description: "从 Spring 到 Spring Boot，迁移升级快速入门以及各种踩坑记录"
summary: ""
date: 2023-01-07T10:54:37+08:00
lastmod: 2024-04-16T23:05:07+08:00
draft: false
weight: 100
images: []
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

从 Spring 到 Spring Boot，迁移升级快速入门以及各种踩坑记录。

## 概述

从 Spring 到 Spring Boot，整体开发、运行方式主要变化。

| -           | 当前（老）模式       | 新模式（本地开发）          | 新模式（线上运行）     |
| ----------- | -------------------- | --------------------------- | ---------------------- |
| 开发习惯    | Spring + 外置 Tomcat | Spring Boot（embed tomcat） | Spring Boot War or Jar |
| Java 版本   | 8、11、16、17        | 11、17、21（推荐）          | 11、17、21（推荐）     |
| Tomcat 版本 | 8.x、9.x             | 9.x                         | 9.x（推荐）、10.x      |

说明：

1. 理论上完全兼容 Java11，但是要求业务方尽量使用 Java17 或 21。其他版本都是实验性质尽量兼容。
2. 线上运行支持 Spring Boot jar 直接运行，但主要业务仍推荐以 war + tomcat 为主。如果希望以 `java -jar` 方式运行，参考下面的章节“jar 方式运行”描述。
3. 目前 Spring Boot 主要推行版本是 2.7.x。 3.x 版本逐渐适配中，注意 3.x 要求 Java 最低版本是 17。

## 快速开始

1. 线下支撑系统导航，点击 `脚手架` 进入 spring start 页面，按自己需求选择模块，生成自己业务模式初始化代码。
2. 写（Copy）业务代码到项目里，修改 pom.xml 根据需要添加新的依赖。
3. 查看本文档中 `遇见问题及解决方案` 章节，注意如果是老项目迁移，这一步很重要。
4. 本地开发工具启动 main 方法。
5. 上线发布系统，选择 `tomcat9:openjdk17` 镜像，并勾选 `镜像 JDK 版本编译代码`。

以上生成的一个最简略的代码结构，更多复杂使用方式参考下方主要 starter 使用说明。

## 主要 starter 使用说明

文档会延后，代码不会骗人，更多说明参考各个项目源码的 README，README 会实时更新。

### fxiaoke-spring-cloud-parent

目前有两个公司级父 pom：

1. 旧：com.fxiaoke.common.fxiaoke-parent-pom 用于原 Spring + Tomcat 方式开发。
2. 新：com.fxiaoke.cloud.fxiaoke-spring-cloud-parent 用于 Spring Boot/Cloud 方式开发。

注意：

1. fxiaoke-spring-cloud-parent 导入了 fxiaoke-parent-pom，所以纷享包版本都是一致的，但是三方包比如 spring/netty/okhttp 会随 Spring Boot 版本。

Maven 项目 parent 统一使用公司新 parent pom，这里定义了 Spring Boot、Spring Cloud 以及内部定制的各种 support 和 starter 版本号。

```xml
<parent>
  <groupId>com.fxiaoke.cloud</groupId>
  <artifactId>fxiaoke-spring-cloud-parent</artifactId>
  <!-- 注意使用最新版本，可以从脚手架里获取最新版本 -->
  <version>2.7.0-SNAPSHOT</version>
 <relativePath/>
</parent>
```

主要升级项需关注：

- 老项目切换到 Spring Boot 先分析实际生效的 maven dependency，关注下核心包版本是否有大的升级，是否可能对业务造成影响。
- Spock and Groovy：Spock 由原来的 1.x 升级到 2.x 版本，同时 Groovy 升级到 4.x 版本，Junit4 升级到 Junit5。

### spring-boot-starter-actuator

目前强制依赖 `spring-boot-starter-actuator`，容器镜像里使用它实现健康检查。
另外强制依赖 `spring-boot-starter-web`，因为有些基础组件依赖了 `ServletContext`。

注意：
actuator 的引入会带来一些额外收益，之前我们健康检测只检查服务端口是否有响应，而 actuator 默认还额外检查各个中间件的状态，业务方可根据需要自行增加或删除某些中间件的状态到健康检测服务，具体方式和更多高级应用参考 spring-boot-starter-actuator 官方文档。

### cms-spring-cloud-starter

配置中心 starter，类似 spring-cloud-consul/nacos/config，对接配置中心，实现配置文件动态加载、刷新，代替原 ReloadablePropertySourcesPlaceholderConfigurer。

使用步骤：

1. 引入 starter。

   ```xml
        <dependency>
        <groupId>com.fxiaoke.cloud</groupId>
        <artifactId>cms-spring-cloud-starter</artifactId>
        <!-- 版本号建议不写，使用 parent 定义好的版本 -->
        </dependency>
   ```

2. 增加 src/main/resources/application.properties 文件，内容如下。

   ```properties
   # 当前模块名，必填，必须全局唯一，一般和 maven 子模块保持一致
   spring.application.name=cms-starter-sample
   # 配置导入，这一行必须写。但是配置文件本身是否必须是通过 optional 控制的
   spring.config.import=optional:cms:${spring.application.name}
   ```

   我们使用 `spring.config.import` 固定格式为 `optional:cms:file-name`。
   optional 表示这个文件可选，配置中心不存在的时候也允许启动，`cms` 是固定字符代表对接 fs 配置中心。

3. 在 CMS 配置中心创建需要的配置文件，文件名为 `spring-cloud-${spring.application.name}`，其中${spring.application.name}替换成真正的文件名，注意当前版本自动追加了前缀`spring-cloud-`且不允许修改。
4. 代码中使用几种方式参考 sample 代码，文档查看 spring 官方`ConfigurationProperties`和 `@Value` 说明。
5. 配置变更后，如果想响应变更事件，实现自己逻辑，自定义类中`implements ApplicationListener<RefreshScopeRefreshedEvent>`
6. 配置加解密，在配置中心中有个加密功能框（如果看不到可能是没有权限），先使用本 starter 的秘钥加密，使用固定格式 `ENC（加密后的内容）`配置到文件里，在 java 里 get value 就是已经解密后的了。例如：

   ```properties
   sample.sensitive=ENC(xxx)
   ```

响应配置更新：

1. 对于使用使用 ConfigurationProperties 映射的对象类，从对象中每次 get 的值都是刷新后的。推荐这种方式。

   ```java
    @Data
    @Configuration
    @ConfigurationProperties(prefix = "sample")
    public class SampleProperties {
        private String name;
    }
   ```

2. `@RefreshScope +  @Value` 获取 Value 注解的新值。

   ```java
   @Service
   @RefreshScope
   public class ValueService {
    @Value("${sample.over.value}")
    @Getter
    private String watchValue;
   }
   ```

3. 监听 RefreshScopeRefreshedEvent 事件。

   ```java
   @EventListener(RefreshScopeRefreshedEvent.class)
   public void handlerPropertiesChangeEvent(RefreshScopeRefreshedEvent event) {
    //此时配置 Bean 已刷新完成，处理自己的业务逻辑
   }

   ```

## jar 方式运行

如果不使用外置 Tomcat，使用 `java -jar` 方式直接运行，首先打包模式为 jar 并在发布时增加环境变量 `SPRING_BOOT_JAR_APP=true`。

与外置 Tomcat 模式差别：

1. jar 模式一个 pod 内只能部署一个模块，不支持多模块合并部署。
2. jar 模式不会自动把 jar 解压成文件夹（war 模式会），所以关于文件资源的读写要特别注意，参考下面的问题描述章节。

## 老项目迁移升级步骤

1. 改 pom.xml：修改 parent，引入必须的 starter，删除所有关于 Spring/logback/junit 的依赖项（由 Spring Boot Starter 自动引入），插件切换到 spring-boot-maven-plugin。
2. 原有的 xml 配置，可以改为注解形式，也可以不改直接 `@ImportResource` 使用。
3. 注意配置扫描范围，原来 xml 中可能是配置是某几个包，Spring Boot 默认扫描 Application.java 所在包，范围可能扩大。
4. 删除原来 web.xml 相关配置，如果有额外的 filter、servlet，需要额外定义 Bean 注入。
5. Unit Test 更换注解，目前默认 junit 版本是 junit5，原 junit4 注解有较大变更，详细请参考下面的参考资料。

### 迁移辅助工具

- [OpenRewrite](https://docs.openrewrite.org/)

  OpenRewrite 快速入门请参考：[使用 OpenRewrite 进行代码重构](https://www.xlabs.club/docs/platform/smart-code/)。

- [EMT4J](https://github.com/adoptium/emt4j)

  通过静态扫描指导从 Java 8 升级到 Java 17 需要注意的变更项。

- [tomcat-jakartaee-migration](https://github.com/apache/tomcat-jakartaee-migration)

  Tomcat 9 到 10 迁移辅助工具。

- [spring-boot-migrator](https://github.com/spring-projects-experimental/spring-boot-migrator)

  Spring Boot 迁移工具，通过扫描输出 从 Spring 到 Spring Boot，以及 Spring Boot 3 迁移指导意见。

### War 配置转移

If you try to migrate a Java legacy application to Spring Boot you will find out that [Spring Boot ignores
the web.xml file](https://github.com/spring-projects/spring-boot/issues/2175) when it is run as embedded container.

webapp web.xml 配置如何转移到 spring boot war 形式。
参考：<https://www.baeldung.com/spring-boot-dispatcherservlet-web-xml>

## 遇见问题及解决方案

下面记录一些比较常见的问题，更多问题请参考下面章节中的参考资料，里面的问题很有参考价值。

- com.google.common.io.Resources#getResource 无法获取到 jar 包内资源

  如果是 `java -jar` 模式运行， `Thread.currentThread().getContextClassLoader().getResource(resourceName)` 形式的调用都无法获取 jar 包内资源，可考虑使用 `InputStream resourceFile = getClass().getResourceAsStream(resourceName);` 方式代替。

- PostConstruct 和 PreDestroy 注解不生效

  参考链接 <https://stackoverflow.com/questions/18161682/why-is-postconstruct-not-called> 先逐个排除。
   我所遇到的原因：PostConstruct、PreDestroy 等注解可能存在多个实现或者过个版本，比如以下 jar 包都可能包含：

  ```console
        javax.annotation-api-1.3.2.jar
        jakarta.annotation-api-1.3.5.jar
        jboss-annotations-api_1.3_spec-2.0.1.Final.jar
  ```

  解决方法：排除依赖，只保留 jakarta.annotation-api 一种，且只能有一个版本。

- kafka 使用报错，日志类似如下：

  ```log
  ERROR c.f.s.SenderManager cannot send, org.apache.kafka.common.KafkaException: org.apache.kafka.clients.producer.internals.DefaultPartitioner is not an instance of org.apache.kafka.clients.producer.Partitioner
  ```

  原因：因为 classpath 下包含多个不同版本的 kafka-client.jar，检查依赖项，确保只引用一个版本。

- 告警：SLF4J: Class path contains multiple SLF4J bindings.

  多个 jar 包含 SLF4J 实现，或引入了多个 logback 版本，请根据提示排除不需要的 jar 包。

- XML 中使用 AOP 注解，运行期报错如下（建议用到 AOP 的提前检查，因为运行期才会报错）：JoinPointMatch ClassNotFoundException

  ```log
  Caused by: java.lang.ClassNotFoundException: org.aspectj.weaver.tools.JoinPointMatch
  at org.apache.catalina.loader.WebappClassLoaderBase.loadClass(WebappClassLoaderBase.java:1412)
  at org.apache.catalina.loader.WebappClassLoaderBase.loadClass(WebappClassLoaderBase.java:1220)
  ... 58 more
  ```

  依赖 spring aop，请确认是否引入 `spring-boot-starter-aop`。

- 本地使用 Java 17 启动，类似如下报错。

  ```log
  ERROR o.s.b.SpringApplication Application run failed java.lang.reflect.InaccessibleObjectException: Unable to make protected final java.lang.Class java.lang.ClassLoader.defineClass(java.lang.String,byte[],int,int,java.security.ProtectionDomain) throws java.lang.ClassFormatError accessible: module java.base does not "opens java.lang" to unnamed module @443118b0
        at java.base/java.lang.reflect.AccessibleObject.checkCanSetAccessible(AccessibleObject.java:354)
        at java.base/java.lang.reflect.AccessibleObject.checkCanSetAccessible(AccessibleObject.java:297)
        at java.base/java.lang.reflect.Method.checkCanSetAccessible(Method.java:199)
        at java.base/java.lang.reflect.Method.setAccessible(Method.java:193)
        at com.alibaba.dubbo.common.compiler.support.JavassistCompiler.doCompile(JavassistCompiler.java:123) [6 skipped]
        at com.alibaba.dubbo.common.compiler.support.AbstractCompiler.compile(AbstractCompiler.java:59)
        at com.alibaba.dubbo.common.compiler.support.AdaptiveCompiler.compile(AdaptiveCompiler.java:46)
  ```

  本地命令行中启动参数里主动追加以下参数（这些参数在发布系统的镜像里默认已经加了），IDEA 启动时设置到`VM options`里：

  ```bash
  --add-opens=java.base/java.lang.reflect=ALL-UNNAMED --add-opens=java.base/java.math=ALL-UNNAMED --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.util.concurrent=ALL-UNNAMED --add-opens=java.rmi/sun.rmi.transport=ALL-UNNAMED
  ```

- Bean 重复定义错误，报错信息类似如下。

  ```log
  The bean 'eieaConverterImpl', defined in class path resource [spring/ei-ea-converter.xml], could not be registered. A bean with that name has already been defined in class path resource [spring/ei-ea-converter.xml] and overriding is disabled.
  Action:
  Consider renaming one of the beans or enabling overriding by setting spring.main.allow-bean-definition-overriding=true
  ```

  可能因为注解扫描范围增广或者有同样包多版本引入，导致扫描到多个。确认多处定义是否一致，如果不一致查看原项目哪个生效，以生效为准。如果一致，找到定义的地方查看是否能整个文件排除掉，实在不能在 application.properties 中设置 spring.main.allow-bean-definition-overriding=true 可解决。

- 如下报错 `class xxx is not visible from class loader`，常见于 dubbo 服务。

  解决办法：不要用 spring-boot-devtools。 参考链接：<https://blog.csdn.net/zhailuxu/article/details/79305661>

- dubbo 服务 `java.io.IOException: invalid constant type: 18`，日志类似如下：

  ```console
  Wrapped by: java.lang.IllegalStateException: Can not create adaptive extenstion interface com.alibaba.dubbo.rpc.Protocol, cause: java.io.IOExc
  eption: invalid constant type: 18
     at com.alibaba.dubbo.common.extension.ExtensionLoader.createAdaptiveExtension(ExtensionLoader.java:723)
     at com.alibaba.dubbo.common.extension.ExtensionLoader.getAdaptiveExtension(ExtensionLoader.java:455)
     ... 29 common frames omitted
  Wrapped by: java.lang.IllegalStateException: fail to create adaptive instance: java.lang.IllegalStateException: Can not create adaptive extens
  tion interface com.alibaba.dubbo.rpc.Protocol, cause: java.io.IOException: invalid constant type: 18
     at com.alibaba.dubbo.common.extension.ExtensionLoader.getAdaptiveExtension(ExtensionLoader.java:459)
     at com.alibaba.dubbo.config.ServiceConfig.<clinit>(ServiceConfig.java:51)
     ... 28 common frames omitted
  ```

  原因：缺少 javassist 或 javassist 版本太低。目前可用的版本是 `javassist:javassist:3.27.0-GA`。

- Spring Auto Configuration 常见排除：

  ```console
     An attempt was made to call a method that does not exist. The attempt was made from the following location:
     org.springframework.boot.autoconfigure.mongo.MongoPropertiesClientSettingsBuilderCustomizer.applyUuidRepresentation(MongoPropertiesClientSettingsBuilderCustomizer.java:58)
     The following method did not exist:
        'com.mongodb.MongoClientSettings$Builder com.mongodb.MongoClientSettings$Builder.uuidRepresentation(org.bson.UuidRepresentation)'
     The calling method's class, org.springframework.boot.autoconfigure.mongo.MongoPropertiesClientSettingsBuilderCustomizer, was loaded from the following location:
  ```

  Spring 默认增加很多 Auto Configuration，使用 support 时可能触发 Auto Configuration 但又缺少配置，或者依赖版本与 Spring Boot 不匹配，可主动排除掉。

  ```java
  @SpringBootApplication(exclude = {DataSourceAutoConfiguration.class, MongoDataAutoConfiguration.class})
  ```

- 关注 Spring Boot 默认 Path 解析器变更，Spring Boot 2.6 版本以后默认由 ANT_PATH_MATCHER 变为 PATH_PATTERN_PARSER。

  双斜线 `//` 以前是可以匹配成功，目前版本会返回 404，比如 <http://localhost:8080//actuator/health>。

  默认禁用了后缀匹配，比如 `GET /projects/spring-boot.json` 将不能匹配到 `@GetMapping("/projects/spring-boot")`。

  据说，中文不主动进行 URLEncode 也会受影响，比如原来 `http://localhost/卫星实验室` 是能成功，目前也会 404。

  PATH_PATTERN_PARSER 只支持末尾 `**` 匹配，不支持中间路径 `**` 正则匹配，比如：`/api/**/query` 不支持。

  功能说明和切换方式请参考官方文档：<https://docs.spring.io/spring-boot/docs/current/reference/html/web.html#web.servlet.spring-mvc.content-negotiation>.

## 参考资料

- 从 SpringMVC 迁移到 SpringBoot 的经验总结

  <https://juejin.cn/post/6844903640361074696>

  <https://juejin.cn/post/6844903573453537294>

  <https://juejin.cn/post/7129751916002672654>

- 从 Java8 升级到 jdk17 的全过程记录

  <https://juejin.cn/post/7258170075198259257>

- 从 JUnit 4 迁移到 JUnit 5

  <https://zhuanlan.zhihu.com/p/144763642>

- 我服了！SpringBoot 升级后这服务我一个星期都没跑起来

  <https://www.toutiao.com/article/7163602391366074916>

  <https://www.toutiao.com/article/7168780833636106760>

- Spring Boot 2 到 Spring Boot 3 官方迁移指南

  <https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide>

  <https://www.baeldung.com/spring-boot-3-migration>

- Spring Boot 2.7.6 升级 3.1.0 爬坑指北

  <https://juejin.cn/post/7237029359135408165>

- Spring Boot 3.1 的新特性、升级说明以及核心功能的改进

  <https://juejin.cn/post/7280787657013002301>

  <https://juejin.cn/post/7170907270631718920>

- Why is PostConstruct not called

  <https://stackoverflow.com/questions/18161682/why-is-postconstruct-not-called>

- 关于 dubbo 占位符无法解析的问题分析

  <https://blog.51cto.com/u_15742657/5546703>
