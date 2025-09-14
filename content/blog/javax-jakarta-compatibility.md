---
title: "Javax 和 Jakarta 过渡期兼容方案"
description: "详细介绍从 Javax 到 Jakarta EE 的迁移兼容方案，包括背景、工具选择和实施策略"
summary: ""
date: 2025-09-14T14:33:23+08:00
lastmod: 2025-09-14T14:33:23+08:00
draft: false
weight: 50
categories: ["Java", "Spring Boot"]
tags: ["Java", "Spring Boot"]
contributors: ["l10178"]
pinned: false
homepage: false
seo:
  title: "Javax 和 Jakarta 过渡期兼容方案 - 企业级迁移指南"
  description: "详细介绍从 Javax 到 Jakarta EE 的迁移兼容方案，包括背景、工具选择和实施策略"
  canonical: ""
  noindex: false
---

## 什么是 Jakarta EE，为什么要切换

Jakarta EE 就是 Java EE 的新名词。这里的 EE 全称是 Enterprise Edition，它是专门为企业级 Java 应用定义的一套规范，与 Java SE (Java Platform, Standard Edition) 相对应。

Java EE 是从 Java 1.2 版本开始推出的 Java 企业级开发平台，最初的名称是 J2EE (Java 2 Platform, Enterprise Edition)。随着 Java 的发展，它的名称于 Java 1.5 版本时更改为 Java EE (Java Platform, Enterprise Edition)。2009 年 Oracle 收购了 Sun，Java EE 开始由 Oracle 通过 JCP (Java Community Process) 开发和维护。

直到 2017 年，Oracle 将 Java EE 提交给了 Eclipse 基金会，并命名为 Eclipse Enterprise for Java。然而，**由于"Java"这个名字的商标归 Oracle 所有，Eclipse 基金会无法继续使用 `javax.*` 和 `java.*`，因此，项目名称改为 Jakarta EE**。

Jakarta EE 包含了许多技术规范和 API，涵盖了 Web 应用、数据库访问、消息传递、事务处理、安全性等方面的功能，其中包括但不限于下列规范：

- **Jakarta Servlet**：前身是 J2EE Servlet，定义了如何管理 HTTP 请求的规范。这应该是大部分 Java Web 开发者最熟悉的，同时也是许多其它规范的基础。

- **Jakarta Server Page (JSP)**：服务端动态生成网页的技术，可以看作 Java 版本的 PHP 和 ASP。

- **Jakarta Websocket**：定义了一套 WebSocket 连接相关的 API，用于实现全双工通信。

- **Jakarta RESTful Web Services**：开发符合 REST 原则的 Web 服务的一套规范。

- **Jakarta JSON Binding**：Java 类和 JSON 字符串互相转换的规范。

- **Jakarta XML Binding**：Java 类和 XML 的映射规范。

- **Jakarta Enterprise Beans (EJB)**：这个规范比较复杂，包括 EJB 容器，RMI（远程过程调用），并发控制，依赖注入等。

- **Jakarta Persistent (JPA)**：ORM 规范，定义了 Java 类和数据库表直接的映射规范。

- **Jakarta Transactions (JTA)**：包含了事务相关的接口和注解类，也用于管理分布式事务。

- **Jakarta Messaging (JMS)**：消息系统的规范，用于实现异步消息传递，比如 Apache 的 ActiveMQ 就实现了这套规范。

### 对研发的影响

#### 依赖包坐标和版本号变更

比如常见的 servlet-api：

```xml
<!-- 老版本 -->
<dependency>
    <groupId>javax.servlet</groupId>
    <artifactId>javax.servlet-api</artifactId>
    <version>3.1.0</version>
</dependency>

<!-- 新版本 -->
<dependency>
    <groupId>jakarta.servlet</groupId>
    <artifactId>jakarta.servlet-api</artifactId>
    <version>6.1.0</version>
</dependency>
```

#### package namespace 变更

比如：

```java
// 老版本
import javax.servlet.Filter;

// 新版本
import jakarta.servlet.Filter;
```

### 兼容性问题

如果不兼容会发生什么，比如：

#### Servlet 运行期错误

```text
javax.servlet.ServletRequest can not cast to jakarta.servlet.ServletRequest
```

#### 数据库扫描失败映射错误

比如下面定义是 `javax.persistence.Table`，开源或者自定义的数据库中间件件一般习惯按注解 `jakarta.persistence.Table` 进行扫描：

```java
import javax.persistence.Id;
import javax.persistence.Table;

@Table(name = "mt_field_extra")
public class FieldExtra {
    @Id
    String id;
}
```

```java
private static void scanTableName(Class<?> clazz, PersistMeta meta, boolean mapCamelCaseToUnderscore) {
    jakarta.persistence.Table table = clazz.getAnnotation(jakarta.persistence.Table.class);
    String tableName;
    if (null != table) {
        tableName = table.name();
    } else {
        tableName = nameConvert(clazz.getSimpleName(), mapCamelCaseToUnderscore);
    }
}
```

如果项目能直接升级到最新版本当然更好，但是作为中间件团队提供的组件，往往需要在过渡期间提供一种兼容两种模式的方案，既能让原有老服务正常使用，又兼容 Spring Boot 3+ Jakarta EE 9+新服务。

Jakarta EE 兼容是一个复杂的课题，当前只记录 `package namespace` 差异解决方法。

## Maven 本身特性说明

### 父子 POM 依赖继承

假设父 POM 使用 dependencyManagement 定义如下：

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.tester</groupId>
            <artifactId>rocketmq-support</artifactId>
            <version>1.0.0</version>
        </dependency>
        <dependency>
            <groupId>com.tester</groupId>
            <artifactId>rocketmq-support</artifactId>
            <version>2.0.0</version>
        </dependency>
        <dependency>
            <groupId>com.tester</groupId>
            <artifactId>rocketmq-support</artifactId>
            <version>3.0.0</version>
            <classifier>jakarta</classifier>
        </dependency>
        <dependency>
            <groupId>com.tester</groupId>
            <artifactId>rocketmq-support</artifactId>
            <version>3.0.0</version>
            <classifier>jakarta-java21</classifier>
        </dependency>
        <dependency>
            <groupId>com.tester</groupId>
            <artifactId>rocketmq-support</artifactId>
            <version>3.0.0</version>
            <classifier>jakarta-java23</classifier>
        </dependency>
    </dependencies>
</dependencyManagement>
```

Maven 官方文档说明：

> **NOTE:** In two of these dependency references, we had to specify the `<type/>` element. This is because the minimal set of information for matching a dependency reference against a dependencyManagement section is actually **{groupId, artifactId, type, classifier}**. In many cases, these dependencies will refer to jar artifacts with no classifier. This allows us to shorthand the identity set to **{groupId, artifactId}**, since the default for the type field is jar, and the default classifier is null.

基于以上说明，假设子模块，依次按以下方式填写 dependency，实际生效的是哪个：

```xml
<dependencies>
    <!-- 方式 1 -->
    <dependency>
        <groupId>com.tester</groupId>
        <artifactId>rocketmq-support</artifactId>
    </dependency>

    <!-- 方式 2 -->
    <dependency>
        <groupId>com.tester</groupId>
        <artifactId>rocketmq-support</artifactId>
        <version>5.0.0</version>
    </dependency>

    <!-- 方式 3 -->
    <dependency>
        <groupId>com.tester</groupId>
        <artifactId>rocketmq-support</artifactId>
        <classifier>jakarta</classifier>
    </dependency>

    <!-- 方式 4，同时引入 2 个 -->
    <dependency>
        <groupId>com.tester</groupId>
        <artifactId>rocketmq-support</artifactId>
    </dependency>
    <dependency>
        <groupId>com.tester</groupId>
        <artifactId>rocketmq-support</artifactId>
        <classifier>jakarta-java23</classifier>
    </dependency>
</dependencies>
```

### Profile 继承和传递

假设有个第三方组件，比如 rocketmq-support，他定义了一个 profile 叫 jakarta，独立加了 dependencies，deploy 到中央仓库。

```xml
<profile>
    <id>jakarta</id>
    <dependencies>
        <dependency>
            <groupId>jakarta.servlet</groupId>
            <artifactId>jakarta.servlet-api</artifactId>
            <version>5.0.0</version>
        </dependency>
    </dependencies>
</profile>
```

有另外一个组件 B 依赖了 rocketmq-support，并且也定义了一个 jakarta profile 激活。那么这个组件 B 会自动依赖 jakarta.servlet-api 吗？

**不会**。profile 为自身编译期服务，deploy 后失效。

如果 deploy 后还能依赖传递的话，那某些人定义写一些恶意代码和插件然后定义一堆通用的 profile，比如大家喜欢叫 dev，然后 deploy 就能变相投毒了。

如果父 pom 定义了 profile，子模块直接引用，是会继承生效的。

## 主流的辅助工具

### Tomcat Migration Tool

[Tomcat Migration Tool](https://github.com/apache/tomcat-jakartaee-migration) 是 Apache Tomcat 提供的迁移工具。

```bash
java -jar jakartaee-migration-*-shaded.jar <source> <destination>
```

The source should be a path to a compressed archive, a folder or an individual file. The destination will be created at the specified path as a resource of the same type as the source.

**用途：**

- 字节码转换
- 已有项目，甚至无源码项目，直接转换。只负责转换制品，要想给别人用需自己手动 deploy
- 一个 javax war 转换后放到 Tomcat 10，理论上可运行

**缺陷：**

- 解决不了本地开发 Debug 期间编译、运行的问题，如果不兼容本地启动、Test 失败

另外 Tomcat 10 提供了一种自动转换的方法，参考文档：<https://tomcat.apache.org/migration-10.html> 将 war 放到 webapps-javaee 目录下，就会自动转换后放到 webapp 下运行。然而这种方案最大的问题在于：

1. 必须是基于外置 Tomcat，不支持 Spring Boot Jar 形式运行。
2. 转换需要时间，这是时间基本上都是 1~10 分钟之间，对应用重启、快速扩缩容都有很大的副作用。

### maven-shade-plugin

**用途：**

- 字节码转换
- 需要配置详细的转换规则

**缺陷：**

- 解决不了本地开发 Debug 期间编译、运行的问题，本地启动、Test 失败

### maven-assembly-plugin

上面我们都是假设只有 javax 和 jakarta namespace 差异，只需要转换字节码。但是，

- 如果有某个 Java 方法不兼容需要重写一个版本怎么办
- 配置文件比如 xml 有差异怎么办

assembly-plugin 就可以帮助我们通过 include、exclude 不同的源码、resource、依赖项，重组编译发布不同的包。

这是适合复杂不兼容的代码，但是对于多模块项目，需要某个模块开发指定 assembly xml，会非常痛苦。

目前其他几种工具只处理 javax 和 jakarta package 差异，后续肯定会遇到除了 package 不同，接口或使用方式也不兼容的情况，等遇到了再单独处理。

### OpenRewrite

OpenRewrite 迁移菜谱 [Migrate to Jakarta EE 9](https://docs.openrewrite.org/recipes/java/migrate/jakarta/javaxmigrationtojakarta)。

```bash
# 命令行运行
mvn -U org.openrewrite.maven:rewrite-maven-plugin:run \
  -Drewrite.recipeArtifactCoordinates=org.openrewrite.recipe:rewrite-migrate-java:RELEASE \
  -Drewrite.activeRecipes=org.openrewrite.java.migrate.jakarta.JavaxMigrationToJakarta \
  -Drewrite.exportDatatables=false
```

**用途：**

- 源码级别转换，直接自动改代码
- 除了代码，还能自动改写 pom 依赖

**缺陷：**

- 多模块目前适配还不完善，对于多模块，需要每个模块处理一次
- 复杂代码可能转换失败，失败后可能导致编译失败，无法一键编译，需要人工介入
- 改 pom 时，他会自己强制指定版本号，实际上我们希望用父 pom 管理版本号
- 速度稍慢，遍历并修改文件源码，然后编译

### transformer-maven-plugin

[transformer-maven-plugin](https://github.com/eclipse-transformer/transformer) 是 eclipse 出的字节码和配置文件转换工具，默认内置了一些 jakarta 的替换规则。

它能帮我们实现：

- 同时打包（或发布）出 javax 和 jakarta 两个包，通过 classifier 区分，比如设置 javax 默认 classifier 为 null，转换后的版本设置 classifier 为 jakarta。
- 只打包（或发布）javax 和 jakarta 任意一个版本。
- web.xml 或 web-fragment.xml 等相关 xml 定义转换。

```xml
<plugin>
    <!-- 这个插件自动把 javax 转为 jakarta，打包出 javax 和 jakarta 两个包，通过 classifier 区分 -->
    <groupId>org.eclipse.transformer</groupId>
    <artifactId>transformer-maven-plugin</artifactId>
    <version>1.0.0</version>
    <extensions>true</extensions>
    <executions>
        <execution>
            <!-- javax 替换成 jakarta -->
            <id>jakarta-jar</id>
            <phase>package</phase>
            <goals>
                <goal>jar</goal>
            </goals>
            <configuration>
                <rules>
                    <jakartaDefaults>true</jakartaDefaults>
                </rules>
                <artifact>
                    <groupId>${project.groupId}</groupId>
                    <artifactId>${project.artifactId}</artifactId>
                </artifact>
            </configuration>
        </execution>
    </executions>
</plugin>
```

**用途：**

- 字节码转换
- 支持 web 相关 xml 定义自动替换，比如 web-fragment.xml `xmlns="http://xmlns.jcp.org/xml/ns/javaee"`
- 转换和 deploy 可以一步到位，速度快很方便
- 如果是多模块，可以在根父模块声明一次，一键全部编译

**缺陷：**

- 不处理 pom 依赖关系，发布出的 Jakarta 版本依赖项都遵循原 pom 声明

此插件运行需要 Java 21 版本，发布业务包的时候，必须使用 Java 21 编译，编译目标 release 版本可以是 Java 8，在 pom 中增加以下设置：

```xml
<properties>
    <java.version>21</java.version>
    <maven.compiler.release>8</maven.compiler.release>
</properties>
```

#### web-fragment.xml 适配

一般咱们典型的 web-fragment 定义有如下两个版本，3.0 和 3.1：

**3.0 版本：**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<web-fragment xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns="http://java.sun.com/xml/ns/javaee"
    xsi:schemaLocation="http://java.sun.com/xml/ns/javaee
        http://java.sun.com/xml/ns/javaee/web-fragment_3_0.xsd"
    version="3.0" metadata-complete="true">
</web-fragment>
```

**3.1 版本：**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<web-fragment xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns="http://xmlns.jcp.org/xml/ns/javaee"
    xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee
        http://xmlns.jcp.org/xml/ns/javaee/web-fragment_3_1.xsd"
    version="3.1" metadata-complete="true">
</web-fragment>
```

其中涉及 jakarta 修改的替换的是其中的 xmlns、xsi、version 字段。

Tomcat 8 以后支持 3.1 版本并兼容 3.0 版本，Tomcat 7 对应 3.0 版本。

transformer-maven-plugin 已经不支持 3.0 版本的替换，所以如果还在用 3.0 的需要咱们手动改成以上 3.1 版本的定义，transformer-maven-plugin 在转换的过程中才能自动升级到 jakarta，自动升级后，升级到 5.0 后的结果如下：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<web-fragment xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns="https://jakarta.ee/xml/ns/jakartaee"
    xsi:schemaLocation="https://jakarta.ee/xml/ns/jakartaee
        https://jakarta.ee/xml/ns/jakartaee/web-fragment_5_0.xsd"
    version="5.0" metadata-complete="true">
</web-fragment>
```

#### 跳过转换

我们的 maven 项目大部分都是多模块，对于打包成 war 自运行不需要发布给别人用的项目，一般都不需要转换，可以设置 properties `transform.skip=true` 跳过。

```xml
<properties>
    <!-- 不发布 -->
    <maven.deploy.skip>true</maven.deploy.skip>
    <!-- 不转换 -->
    <transform.skip>true</transform.skip>
</properties>
```

## 实施方案

### Classifier vs Version

业界主流方案就是用版本号区分或者用 classifier 区分这两种方案。

classifier 最主要的问题是无法通过父 pom 继承，这样将导致各个业务方需要大量改 pom.xml 文件。

假设一个项目依赖了 app-a，而 app-a 又依赖 b、c、d.

首先因为父 pom 定义 classifier 并不会继承。那么，我是不是指定 app-a 的 classifier 就行了。

不是，除非 app-a 的特定 classifier 自身 pom 里已经为给个模块指定了 classifier，否则 app-a 依赖的各个都要重新指定一遍，这就使用 pom 文件长得又长又臭。如果哪天 app-a 又新增依赖 e, 但是使用者漏掉了 e classifier 声明的，就可能带来问题，这是很危险的动作。

所以我们最终选择用版本号来区分。

### 使用特定版本

版本号规则，在原版本基础上增加固定前缀：`9999.${project.version}`，如原 `9.6.0` 对应的 jakarta 版本号是 `9999.9.6.0`。

父 pom 区分版本号，Spring Boot 3.x 版本依赖，重申版本号。

这样各个使用者，只需要选择不同的父 pom，遵循父 pom 版本定义，dependency 可以原样不变。

#### 如何打包发布

目前暂定选择 transformer-maven-plugin，他不完美，但是足够快，相对稳定。

发布目标：两次发布，第一次发布常规版本，第二次发布自动转换后的版本，版本号增加前缀。

**发布步骤：**

在公司级父 pom 增加如下 profile：

```xml
<profiles>
    <profile>
        <id>jakarta-transformer</id>
        <build>
            <plugins>
                <plugin>
                    <groupId>org.eclipse.transformer</groupId>
                    <artifactId>transformer-maven-plugin</artifactId>
                    <version>1.0.0</version>
                    <extensions>true</extensions>
                    <executions>
                        <execution>
                            <!-- 此处配置 javax 替换成 jakarta，artifactId 不变，无 classifier -->
                            <id>jakarta-jar</id>
                            <phase>package</phase>
                            <goals>
                                <goal>jar</goal>
                            </goals>
                            <configuration>
                                <rules>
                                    <jakartaDefaults>true</jakartaDefaults>
                                </rules>
                                <artifact>
                                    <groupId>${project.groupId}</groupId>
                                    <artifactId>${project.artifactId}</artifactId>
                                </artifact>
                            </configuration>
                        </execution>
                    </executions>
                </plugin>
            </plugins>
        </build>
    </profile>
</profiles>
```

发布 jakarta 版本时，先改版本号增加前缀，再指定 profile 发布：

```bash
# 获取当前版本号
mvn help:evaluate -Dexpression=project.version -q -DforceStdout

# 如果项目都是自己写版本号的，使用 version 插件设置新版本号，增加前缀
mvn versions:set -DnewVersion=9999.9.6.0 -DgenerateBackupPoms=false

# 重新发布，指定 -Pjakarta profile，父 pom 里的插件自动转换 javax
mvn deploy -Pjakarta-transformer

# 如果使用 flatten-maven-plugin 插件管理版本号的，设置 revision
mvn deploy -Drevision=9999.9.6.0 -Pjakarta-transformer
```
