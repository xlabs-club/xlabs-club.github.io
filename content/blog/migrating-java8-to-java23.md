---
title: "从 Java 8 升级到 Java 23，踩坑记录、变更评估方法、辅助工具介绍"
description: "从 Java 8 升级到 Java 23，踩坑记录、变更评估方法、辅助工具介绍"
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
  title: "从 Java 8 升级到 Java 23，踩坑记录、变更评估方法、辅助工具介绍"
  description: "从 Java 8 升级到 Java 23，踩坑记录、变更评估方法、辅助工具介绍"
  canonical: ""
  noindex: false
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
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-jdeps-plugin</artifactId>
        <version>3.1.2</version>
        <executions>
          <execution>
            <goals>
              <!-- verify main classes -->
              <goal>jdkinternals</goal>
              <!-- verify test classes -->
              <goal>test-jdkinternals</goal>
            </goals>
          </execution>
        </executions>
        <configuration>
          <multiRelease>21</multiRelease>
          <!-- 其他参数按需配置 -->
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>

```

## 升级兼容方法

1. 利用 Maven 的 `profile` 机制，根据 JDK 版本号，自动激活不同的配置。

    ```xml
    <profiles>
      <!-- 以下配置抄自地瓜哥博客，感谢地瓜哥    -->
      <profile>
        <id>Java1.8</id>
        <activation>
          <!-- 在 JDK 1.8 时自动激活-->
          <jdk>1.8</jdk>
        </activation>
        <properties>
          <spring.version>5.3.33</spring.version>
        </properties>
        <!-- 在父 POM 中使用 dependencyManagement 生命 -->
        <!-- 在需要的子模块中可以直接使用 -->
        <dependencyManagement>
          <dependencies>
            <dependency>
              <groupId>javax.servlet</groupId>
              <artifactId>javax.servlet-api</artifactId>
              <version>4.0.1</version>
              <scope>provided</scope>
            </dependency>
          </dependencies>
        </dependencyManagement>
        <build>
          <plugins>
            <plugin>
              <groupId>org.apache.maven.plugins</groupId>
              <artifactId>maven-surefire-plugin</artifactId>
              <version>3.2.5</version>
              <configuration>
                <includes>
                  <include>**/*Test.java</include>
                </includes>
              </configuration>
            </plugin>
            <plugin>
              <groupId>org.apache.maven.plugins</groupId>
              <artifactId>maven-compiler-plugin</artifactId>
              <version>3.13.0</version>
              <configuration>
                <showWarnings>true</showWarnings>
                <fork>true</fork>
              </configuration>
            </plugin>
          </plugins>
        </build>
      </profile>

      <profile>
        <id>Java21</id>
        <activation>
          <!-- 在 Java 21 以上激活        -->
          <jdk>[21,)</jdk>
        </activation>
        <properties>
          <spring.version>6.0.19</spring.version>
        </properties>
        <!-- 在父 POM 中使用 dependencyManagement 生命 -->
        <!-- 在需要的子模块中可以直接使用 -->
        <dependencyManagement>
          <dependencies>
            <dependency>
              <groupId>jakarta.servlet</groupId>
              <artifactId>jakarta.servlet-api</artifactId>
              <version>6.0.0</version>
              <scope>provided</scope>
            </dependency>
            <dependency>
              <groupId>org.openjdk.nashorn</groupId>
              <artifactId>nashorn-core</artifactId>
              <version>15.4</version>
            </dependency>
            <dependency>
              <groupId>org.glassfish.jaxb</groupId>
              <artifactId>jaxb-runtime</artifactId>
              <version>2.3.9</version>
            </dependency>
          </dependencies>
        </dependencyManagement>
        <dependencies>
          <dependency>
            <groupId>javax.annotation</groupId>
            <artifactId>javax.annotation-api</artifactId>
            <version>1.3.2</version>
          </dependency>
        </dependencies>
        <build>
          <plugins>
            <plugin>
              <groupId>org.apache.maven.plugins</groupId>
              <artifactId>maven-surefire-plugin</artifactId>
              <version>3.2.5</version>
              <configuration>
                <includes>
                  <include>**/*Test.java</include>
                </includes>
                <argLine>
                  --add-opens java.base/java.lang=ALL-UNNAMED
                  --add-opens java.base/java.util=ALL-UNNAMED
                  --add-opens java.base/java.math=ALL-UNNAMED
                  --add-opens java.base/java.time=ALL-UNNAMED
                </argLine>
              </configuration>
            </plugin>
            <plugin>
              <groupId>org.apache.maven.plugins</groupId>
              <artifactId>maven-compiler-plugin</artifactId>
              <configuration>
                <showWarnings>true</showWarnings>
                <fork>true</fork>
                <compilerArgs>
                  <arg>-J--add-opens=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED</arg>
                </compilerArgs>
              </configuration>
            </plugin>
          </plugins>
        </build>
      </profile>
    </profiles>

    ```

2. Java 模块化兼容。

    你一定见过这种错误。

    ```console
    Caused by: java.lang.reflect.InaccessibleObjectException: Unable to make field protected int[] java.util.Calendar.fields accessible: module java.base does not "opens java.util" to unnamed module @21282ed8
    ```

    也一定知道怎么解决了，将没开放的模块强制对外开放，有两个参数选项：
    --add-exports 导出包，意味着其中的所有公共类型和成员都可以在编译和运行时访问。
    --add-opens 打开包，意味着其中的所有类型和成员（不仅是公共类型）都可以在运行时访问。

    两者的区别在于 --add-opens 开放的更加彻底，不仅 public 类型、变量及方法可以访问，就连非 public 元素，也可以通过调用 setAccessible(true) 后也可以访问。简单起见，直接使用 --add-opens 即可。

    使用 Maven 命令时，配置 maven-surefire-plugin 插件，参考如下：

    ```xml
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <configuration>
          <argLine>
          --add-opens=java.base/java.lang.reflect=ALL-UNNAMED
          --add-opens=java.base/java.math=ALL-UNNAMED
          </argLine>
        </configuration>
      </plugin>
    ```

    在 IntelliJ IDEA 运行程序如果报错，可以通过在 “VM Option” 配置项中，增加 Java 模块化 `--add-opens` 相关启动参数即可正常启动。

    完整 `add-opens` 列表。

    ```sh
    --add-opens=java.base/java.lang.reflect=ALL-UNNAMED
    --add-opens=java.base/java.lang=ALL-UNNAMED
    --add-opens=java.base/java.io=ALL-UNNAMED
    --add-opens=java.base/java.util=ALL-UNNAMED
    --add-opens=java.base/java.util.concurrent=ALL-UNNAMED
    --add-opens=java.rmi/sun.rmi.transport=ALL-UNNAMED
    --add-opens=java.base/java.math=ALL-UNNAMED
    --add-opens=java.base/java.net=ALL-UNNAMED
    --add-opens=java.base/java.nio=ALL-UNNAMED
    --add-opens=java.base/java.security=ALL-UNNAMED
    --add-opens=java.base/java.text=ALL-UNNAMED
    --add-opens=java.base/java.time=ALL-UNNAMED
    --add-opens=java.base/jdk.internal.access=ALL-UNNAMED
    --add-opens=java.base/jdk.internal.misc=ALL-UNNAMED
    ```

## 推荐配置

升级到 Java 21 以后以下是根据我们公司常规经验推荐的配置，非普世可用，请根据自己的应用情况臻选。

- 如果在使用 ZGC，推荐启用分代 `-XX:+ZGenerational` ，对稳定性、吞吐量、内存占用都有很大优化。
- 在很多场景下 G1 仍然是最稳的选择，内存占用比 ZGC 低，CPU 更稳定。大部分场景下小内存应用，并不需要 ZGC。

## 辅助迁移工具

一些辅助迁移到新版本的工具，仅供参考。

### [Eclipse Migration Toolkit for Java (EMT4J)](https://github.com/adoptium/emt4j)

EMT4J 也是一个静态分析工具，可输出分析报告，也可直接 apply 到 git，直接通过 maven 插件、cli 命令行、Java Agent 3 种方式分析。

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

可通过 emt4j-maven-plugin 进行检查。增加以下 plugin，执行 `mvn emt4j:check` 成功后查看报告。

注意 emt4j-maven-plugin 目前版本 0.8.0 比较老，请使用 Java 8 或 Java 17 跑 mvn 命令，版本太高会失败。

```xml
<plugin>
  <groupId>org.eclipse.emt4j</groupId>
  <artifactId>emt4j-maven-plugin</artifactId>
  <version>0.8.0</version>
  <configuration>
      <!-- 当前版本 -->
      <fromVersion>8</fromVersion>
      <!-- 期望升级版本，0.8.0 还不支持 Java 21 -->
      <toVersion>17</toVersion>
      <outputFile>target/report.html</outputFile>
  </configuration>
</plugin>
```

不想使用 xml 配置的，可参考以下命令行直接 run plugin。

```sh
mvn org.eclipse.emt4j:emt4j-maven-plugin:0.8.0:check -DfromVersion=8 -DtoVersion=17 -DoutputFile=emt4j-report.html
```

检查结果错误可能很多，根据优先级修改，比如我的检查结果。

```console

Non-heap memory footprint increasing

Description

Priority: p1 Issue Count: 1
Netty uses the direct byte buffer internally. There 2 ways to manage the direct buffer lifecycle, the first it's managed by Netty self, and the second is managed by JVM. In JDK 8, netty uses the first way, but in JDK 11, netty uses the second. The first cannot be monitored through MXBean, but the second can be monitored.

How to fix

If you want keep the first way,add the option to JVM:"-Dio.netty.tryReflectionSetAccessible=true --add-opens=java.base/jdk.internal.misc=ALL-UNNAMED --add-opens=java.base/java.nio=ALL-UNNAMED" when running on JDK 11.But if use the second way,the netty should upgrade to a version at least 4.1.33. Because the older netty use a remove API tht release byte buffer.

Issues Context

Target: file:/Users/l10178/.m2/repository/io/netty/netty/3.10.0.Final/netty-3.10.0.Final.jar

```

### [OpenRewrite](https://docs.openrewrite.org/)

一键升级依赖包，重构源码，入门指导可参考我的另一篇博客：[智能代码重构](https://www.xlabs.club/docs/platform/smart-code/)。 OpenRewrite 更成熟易用。

### [JaCoLine](https://jacoline.dev/inspect)

检查 Java 命令行选项参数有没有问题，识别出已经过时不支持的参数。

### [Java 参数查询工具](https://chriswhocodes.com/corretto_jdk21_options.html)

Java 参数太多，到 [VM Options Explorer - Corretto JDK21](https://chriswhocodes.com/corretto_jdk21_options.html) 中参照，里面根据 JDK 的版本以及发行商，列出来所有的相关参数，选择好对应发行商的正确版本，就可以搜索或者查看 java 命令支持的所有参数了。

## 遇见问题和解决办法

- TLS 不兼容问题，类似如下错误。JDK 17 是支持 TLS1.0 ~ TLS1.3 的，但是默认使用的 TLS 版本是 TLS 1.3, 老版本被禁用了，需要主动放开。

  ```console
  # 错误日志
  The server selected protocol version TLS10 is not accepted by client preferences [TLS13, TLS12]。

  # 配置文件
  $JAVA_HOME/conf/security/java.security

  # 找到里面的一行配置：
  jdk.tls.disabledAlgorithms=SSLv3, TLSv1, TLSv1.1, RC4, DES, MD5withRSA, \
      DH keySize < 1024, EC keySize < 224, 3DES_EDE_CBC, anon, NULL

  # 说明：JDK 中的 jdk.tls.disabledAlgorithms 参数用于禁用不安全或不需要的 TLS 密码算法，
  以提高系统的安全性。通过配置这个参数，可以指定 JDK 不支持的密码算法或协议，以降低它们的优先级，
  减少被攻击的风险。

  # 我们把 TLSv1，TLSv1.1 这两个删除掉，变成如下：
  jdk.tls.disabledAlgorithms=SSLv3, RC4, DES, MD5withRSA, \
      DH keySize < 1024, EC keySize < 224, 3DES_EDE_CBC, anon, NULL

  ```

  ```console
  # 不建议直接去改原 java.security 文件，可自定义一个新文件 custom.java.security，内容只包含 disabledAlgorithms 配置
  jdk.tls.disabledAlgorithms=RC4, DES, MD5withRSA, \
     DH keySize < 1024, EC keySize < 224, 3DES_EDE_CBC, anon, NULL, \
     include jdk.disabled.namedCurves
  # 然后启动的命令行增加以下参数配置
  -Djava.security.properties=$JAVA_HOME/conf/security/custom.java.security
  ```

- module jdk.proxy3 does not "opens jdk.proxy3" to unnamed module.

  网上包括人工智能推荐的答案都是 add-opens，这也是我想到的第一个方式，毕竟以前遇见 unnamed module 都是这么干的。

  ```console
  -–add-opens=jdk.proxy3=ALL-UNNAMED
  --add-opens=java.base/java.lang.reflect=ALL-UNNAMED
  --add-opens=java.base/java.lang=ALL-UNNAMED
  --add-opens=java.base/java.lang.reflect=ALL-UNNAMED
  ```

  实际上都不生效。Java 里并没有一个真的叫 `jdk.proxy3` 的模块，这是由 Dynamic Proxy 动态生成的一个虚拟方法。最根本的解决办法还是升级代码，不要调用 Java 过时的方法。我这里是因为 Groovy 调用产生，升级了一下 Groovy，完美解决。

## 参考资料

- 从 Java 15 到 23 关于 G1 GC 的优化

  <https://tschatzl.github.io/>

- Oracle 出的 Java 21 迁移指南，包含新特性介绍、Removed APIs、Removed Tools and Components 等

  <https://docs.oracle.com/en/java/javase/21/migrate/getting-started.html>

- Microsoft transition from java 8 to java 11

    <https://learn.microsoft.com/en-us/java/openjdk/transition-from-java-8-to-java-11>

- Java Dependency Analysis Tool

   <https://wiki.openjdk.org/display/JDK8/Java+Dependency+Analysis+Tool>

- 什么是多版本 Jar（Multi Release Jar）

   <https://docs.oracle.com/en/java/javase/11/docs/specs/jar/jar.html#multi-release-jar-files>

- Java G1 重要参数设置参考

   <https://gceasy.io/gc-recommendations/important-g1-gc-arguments.jsp>

- 地瓜哥 JVM GC 性能测试（三）：真实流量

   <https://www.diguage.com/post/gc-performance-real-qps/>
