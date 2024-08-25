---
title: "从 Java 8 升级到 Java 21，踩坑记录、变更评估和工具介绍"
description: ""
summary: ""
date: 2024-05-23T21:03:11+08:00
lastmod: 2024-05-23T21:03:11+08:00
draft: false
weight: 50
categories: []
tags: []
contributors: []
pinned: false
homepage: false
seo:
  title: "" # custom title (optional)
  description: "" # custom description (recommended)
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

## 破坏性变更评估

在升级之前，可通过 jdeps 和 jdeprscan 先评估下是否有使用内部类和废弃 API，有一个总的概览。

jdeps 是 Java 自带的命令行工具，可以用来分析依赖关系和生成模块信息文件，这里我们只借用他的其中一项功能。

通过 `jdeps --jdk-internals` 检查是否有使用内部 API，以下例子显示使用了 `sun.net.util.IPAddressUtil` 这个 Java 内部工具类，会显示详细的源码类和 jar 包位置。

可以继续使用 Java 中的内部 API，OpenJDK Wiki 页面 [Java Dependency Analysis Tool](https://wiki.openjdk.org/display/JDK8/Java+Dependency+Analysis+Tool) 推荐了某些常用 JDK 内部 API 的替换项。

```console

$ jdeps -dotoutput <dot-file-dir> -jdkinternals <one-or-more-jar-files....>

$ jdeps --jdk-internals --multi-release 21 --class-path . target/*.jar
. -> java.base
   com.my.package.function.SecurityChecker -> sun.net.util.IPAddressUtil                         JDK internal API (java.base)

Warning: JDK internal APIs are unsupported and private to JDK implementation that are
subject to be removed or changed incompatibly and could break your application.
Please modify your code to eliminate dependence on any JDK internal APIs.
For the most recent update on JDK internal API replacements, please check:
https://wiki.openjdk.org/display/JDK8/Java+Dependency+Analysis+Tool

```

jdeprscan 也是 Java 自带分析工具，可查看是否使用了已弃用或已删除的 API。使用已弃用的 API 不是阻塞性问题，还能接着跑，但是建议替换掉。使用已删除的 API，那就彻底跑不起来了。

```console

# 了解自 Java 8 后弃用的具体 API
$ jdeprscan --release 21 --list

# 加上 --for-removal ，列出已删除的 API
$ jdeprscan --release 21 --list --for-removal

@Deprecated(since="9", forRemoval=true) class javax.security.cert.Certificate
@Deprecated(since="9", forRemoval=true) class javax.security.cert.CertificateEncodingException

……

@Deprecated(since="18", forRemoval=true) void java.lang.Enum.finalize()

@Deprecated(since="17", forRemoval=true) void java.lang.System.setSecurityManager(java.lang.SecurityManager)
@Deprecated(since="17", forRemoval=true) java.lang.SecurityManager java.lang.System.getSecurityManager()

@Deprecated(since="21", forRemoval=true) javax.management.MBeanServerConnection javax.management.remote.JMXConnector.getMBeanServerConnection(javax.security.auth.Subject)

```

扫描自己的代码中是否有使用废弃 API：

```console

# 注意通过 --class-path 增加依赖的 jar 包

$ jdeprscan --release 21 --class-path log4j-api-2.13.0.jar my-application.jar

error: cannot find class sun/misc/BASE64Encoder
class com/company/Util uses deprecated method java/lang/Double::<init>(D)V

```

以上例子，com.company.Util 类在调用 java.lang.Double 类的已弃用构造函数。 javadoc 会建议用来代替已弃用 API 的 API。 但是无法解决“error: cannot find class sun/misc/BASE64Encoder”问题，因为它是已删除的 API， 自 Java 8 发布以来，应使用 java.util.Base64。

注意使用 jdeprscan 需要通过 --class-path 指定依赖项，可先执行 `mvn dependency:copy-dependencies` 命令，此时会 copy 依赖项到 `target/dependency` 目录。

另外，可在你项目的 maven pom 文件中引入 `maven-jdeps-plugin`，如下示例，引入后如果有使用废弃 API，将在 `mvn package` 的时候直接失败报错，避免有人无意引入废弃 API。

```xml
<project>
  ...
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-jdeps-plugin</artifactId>
        <version>3.1.2</version>
        <executions>
          <execution>
            <goals>
              <goal>jdkinternals</goal> <!-- verify main classes -->
              <goal>test-jdkinternals</goal> <!-- verify test classes -->
            </goals>
          </execution>
        </executions>
        <configuration>
          <multiRelease>21</multiRelease>
          ...
        </configuration>
      </plugin>
    </plugins>
    ...
  </build>
  ...
</project>

```

## 易踩坑破坏性变更

## 辅助迁移工具

[Eclipse Migration Toolkit for Java (EMT4J)](https://github.com/adoptium/emt4j)

EMT4J 也是一个静态分析工具，可输出分析报告，也可直接 apply 到 git。

目前发布比较慢，只有 master 分支支持 Java 21，可以基于 master 分支自己编译构建，也可以使用已 Realease 版本只分析到 Java 17。

```console

# 以下示例自己编译构建，master 分支还不太稳定，可能出错

$ git clone git@github.com:adoptium/emt4j.git
$ cd emt4j
$ mvn clean package -Prelease
# 以上步骤生成 emt4j-${version}.zip 在 emt4j-assembly/target 目录下。
# 解压以上 zip 后，得到

emt4j tree -L 2
.
├── bin
│   ├── analysis.bat
│   └── analysis.sh
└── lib
    ├── agent
    ├── analysis
    └── maven-plugin

# 注意 emt4j 需要使用 Java 8 运行，所以先把自己的 Java 环境切换到 Java 8
$ sh bin/analysis.sh -f 8 -t 17 -o report.html my-java-project-dir

# 在 report.html 能看到分析内容和建议，如

Issues Context
Location: refclass:file:my-java-project-dir/target/classes/com/mypackage/spring/BaseAbstractDataSource.class!/com.mypackage.spring.BaseAbstractDataSource!/, Target: java.lang.Class.newInstance()Ljava/lang/Object;

```

[OpenRewrite](https://docs.openrewrite.org/): 一键升级依赖包，重构源码，入门指导可参考我的另一篇博客：[智能代码重构](https://www.xlabs.club/docs/platform/smart-code/)。 OpenRewrite 更成熟易用。

[JaCoLine](https://jacoline.dev/inspect): 检查 Java 命令行选项的问题，识别出已经过时不支持的参数。

## 遇见问题和解决办法

## 参考资料

- Microsoft transition from java 8 to java 11

    <https://learn.microsoft.com/en-us/java/openjdk/transition-from-java-8-to-java-11>

- Java Dependency Analysis Tool

   <https://wiki.openjdk.org/display/JDK8/Java+Dependency+Analysis+Tool>

- Oracle Migrating From JDK 8 to Later JDK Releases

   <https://docs.oracle.com/en/java/javase/21/migrate/migrating-jdk-8-later-jdk-releases.html#GUID-7744EF96-5899-4FB2-B34E-86D49B2E89B6>

- 什么是多版本 Jar（Multi Release Jar）

   <https://docs.oracle.com/en/java/javase/11/docs/specs/jar/jar.html#multi-release-jar-files>

- Java G1 重要参数设置参考

   <https://gceasy.io/gc-recommendations/important-g1-gc-arguments.jsp>
