---
title: "CI: Maven 如何在编译时禁止调用某些特定 API"
description: "CI: Maven 如何在编译时禁止调用某些特定 API"
summary: ""
date: 2025-09-09T22:18:59+08:00
lastmod: 2025-09-09T22:18:59+08:00
draft: false
weight: 50
categories: [Java]
tags: [CICD, Java]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "CI: Maven 如何在编译时禁止调用某些特定 API"
  description: "CI: Maven 如何在编译时禁止调用某些特定 API"
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

在日常开发中，我们经常遇到类似如下需求：

- 项目组提供了 SDK，某个 API 已经被标记为废弃，但是大家迟迟不升级，项目组还需要花费时间维护已经废弃的 API。
- 有些项目在使用 JDK 已经废弃的 API，这些废弃 API 在更高版本 JDK 中已经删除，导致推动升级 JDK 比较困难。
- 有些项目会跨版本混合编译，比如用 Java 8 编译运行在 Java 21 上，常见的错误比如 `javafx.util` 在 Java 21 默认已经去掉了，就会出现编译成功却运行时失败。

所以我们想提供一种方案，能不能在编译期就强制禁用某些 API，主动阻止让编译不通过，提前报错及早发现及早处理。

## 实现方案

当前我们使用 maven [forbiddenapis](https://github.com/policeman-tools/forbidden-apis) 插件，结合 CI 流程来实现。

执行效果，如果有使用禁用的 API，能看到类似如下错误提示，编译失败并给出原因。

```console
12:40:30.647 [INFO]
12:40:30.648 [INFO] --- forbiddenapis:3.9:check (check-forbidden-apis) @ app-biz ---
12:40:30.657 [INFO] Scanning for classes to check...
12:40:30.661 [INFO] Reading bundled API signatures: jdk-deprecated-1.8
12:40:30.694 [INFO] Reading API signatures: /usr/share/maven/conf/forbidden-apis.txt
12:40:30.694 [INFO] Loading classes to check...
12:40:30.695 [INFO] Scanning classes for violations...
12:40:30.849 [ERROR] Forbidden class/interface use: javafx.util.Pair [禁止使用 JavaFX 相关类]
12:40:30.850 [ERROR]   in com.tester.HomeController (HomeController.java:11)
12:40:30.865 [ERROR] Scanned 13 class file(s) for forbidden API invocations (in 0.21s), 1 error(s).
12:40:30.872 [INFO] ------------------------------------------------------------------------

24784 [INFO] --- forbiddenapis:3.9:check (check-forbidden-apis) @ app-api ---
24812 [INFO] Scanning for classes to check...
24884 [INFO] Reading bundled API signatures: jdk-deprecated-1.8
25016 [INFO] Reading API signatures: /usr/share/maven/conf/forbidden-apis.txt
25017 [INFO] Loading classes to check...
25106 [INFO] Scanning classes for violations...
25984 [ERROR] Forbidden method invocation: java.net.URLEncoder#encode(java.lang.String) [Deprecated in Java 1.8]
25984 [ERROR]   in com.tester.FormBody$FormBodyBuilder (FormBody.java:60)
26110 [ERROR] Scanned 660 class file(s) for forbidden API invocations (in 1.31s), 2 error(s).
26113 [INFO]
```

### Maven 核心配置

首先，在父 pom 里增加了以下片段，此内容主要含义：

- 在存在 ${env.MAVEN_HOME}/conf/forbidden-apis.txt 文件时激活此 profile，以便确保缺少 txt 文件时不会报错。
- 默认激活了 forbiddenapis 插件的 jdk-deprecated 规则。
- 增加了我们定制的 forbidden-apis.txt 规则，此文件放在 maven 的基础镜像里。

```xml
<profile>
      <id>forbidden</id>
      <activation>
        <file>
          <exists>${env.MAVEN_HOME}/conf/forbidden-apis.txt</exists>
        </file>
      </activation>
      <build>
        <plugins>
          <plugin>
            <groupId>de.thetaphi</groupId>
            <artifactId>forbiddenapis</artifactId>
            <version>3.9</version>
            <configuration>
              <detail>true</detail>
              <failOnUnsupportedJava>false</failOnUnsupportedJava>
              <ignoreSignaturesOfMissingClasses>true</ignoreSignaturesOfMissingClasses>
              <bundledSignatures>
                <bundledSignature>jdk-deprecated</bundledSignature>
              </bundledSignatures>
              <signaturesFiles>
                <signaturesFile>${env.MAVEN_HOME}/conf/forbidden-apis.txt</signaturesFile>
              </signaturesFiles>
            </configuration>
            <executions>
              <execution>
                <id>check-forbidden-apis</id>
                <phase>process-classes</phase>
                <goals>
                  <goal>check</goal>
                </goals>
              </execution>
              <execution>
                <id>test-check-forbidden-apis</id>
                <phase>process-test-classes</phase>
                <goals>
                  <goal>testCheck</goal>
                </goals>
              </execution>
            </executions>
          </plugin>
        </plugins>
      </build>
</profile>
```

我的项目需要紧急发版，来不及改代码，如何禁用以上插件，在 pom.xml 中增加以下属性，或通过 mvn 命令行 `-Dforbiddenapis.skip=true` 传递此参数：

```xml
    <properties>
      <forbiddenapis.skip>true</forbiddenapis.skip>
    </properties>
```

### forbiddenapis 规则详解

forbiddenapis 插件有内置规则和自定义规则，规则名字叫 signatures。

forbiddenapis 插件默认已经内置了一些规则 signatures，参考：[bundled-signatures](https://jenkins.thetaphi.de/job/Forbidden-APIs/javadoc/bundled-signatures.html)。

主要默认规则：

- `jdk-unsafe-*`: Signatures of "unsafe" methods that use default charset, default locale, or default timezone. For server applications it is very stupid to call those methods, as the results will definitely not what the user wants (for Java* = 1.7, 1.8, 9,..., 24; Ant / Maven / Gradle automatically add the compile Java version).
- `jdk-deprecated-*`: This disallows all deprecated methods from the JDK (for Java*= 1.7, 1.8, 9,..., 24; Ant / Maven / Gradle automatically add the compile Java version).
- `jdk-internal-*`: Lists all internal packages of the JDK as of Security.getProperty("package.access"). Calling those methods will always trigger security manager and is completely forbidden from Java 9 on (for Java*= 1.7, 1.8, 9,..., 24; Ant / Maven / Gradle automatically add the compile Java version, since forbiddenapis v2.1).
- `jdk-non-portable`: Signatures of all non-portable (like com.sun.management.HotSpotDiagnosticMXBean) or internal runtime APIs (like sun.misc.Unsafe). This is a superset of jdk-internal.
    Internally this is implemented using heuristics: Any reference to an API that is part of the Java runtime (rt.jar, extensions, Java 9+ java.*/ jdk.* core modules) and is not part of the Java SE specification packages (mainly java, javax, but also org.ietf.jgss, org.omg, org.w3c.dom, and org.xml.sax) is forbidden (any java version, no specific JDK version, since forbiddenapis v2.1).
- `jdk-system-out`: On server-side applications or libraries used by other programs, printing to System.out or System.err is discouraged and should be avoided (any java version, no specific JDK version).
- `jdk-reflection`: Reflection usage to work around access flags fails with SecurityManagers and likely will not work anymore on runtime classes in Java 9 or later (any java version, no specific JDK version, since forbiddenapis v2.1).
- `commons-io-unsafe-*`: If your application uses the famous Apache Common-IO library, this adds signatures of all methods that depend on default charset (for versions* = 1.0, 1.1, 1.2, 1.3, 1.4, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8.0, 2.9.0, 2.10.0, 2.11.0, 2.12.0, 2.13.0, 2.14.0, 2.15.0, 2.15.1, 2.16.0, 2.16.1, 2.17.0, 2.18.0).

通过 txt 文件自定义规则，规则语法：[signatures-syntax](https://jenkins.thetaphi.de/job/Forbidden-APIs/javadoc/signatures-syntax.html)。

- Class reference: A binary/fully-qualified class name (including package). You may use the output of Class.getName(). Be sure to use correct name for inner classes! Example: `java.lang.String`
- A package/class glob pattern: To forbid all classes from a package, you may use glob patterns, like `sun.misc.**`(`**` matches against package boundaries).
- A field of a class: package.Class#fieldName
- A method signature: It consists of a binary class name, followed by # and a method name including method parameters: java.lang.String#concat(java.lang.String) – All method parameters need to use fully qualified class names! Instead of method parameters, the special wildcard string ** may be used to add all variants of a method, regardless of their parameter types. To refer to instance constructors, use the method name `<init>`, e.g. `java.lang.Integer#<init>(int)`.

The error message displayed when the signature matches can be given at the end of each signature line using "@" as separator:

  ```console
  java.lang.String @ You are crazy that you disallow strings
  ```

To not repeat the same message after each signature, you can prepend signatures with a default message. Use a line starting with "@defaultMessage".

  ```console
  @defaultMessage You are crazy that you disallow substrings
  java.lang.String#substring(int)
  java.lang.String#substring(int,int)
  ```

这里着重需要注意：

- 按方法名定义时，一定要定义好参数类型，否则不生效。
- 按包名定义时，一定要区分好一个 `*` 和两个 `**`，一个`*`只能匹配一级，两个`**`能匹配 N 级。
