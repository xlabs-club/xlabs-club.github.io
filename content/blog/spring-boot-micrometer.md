---
title: "Spring Boot 使用 Micrometer 集成 Prometheus 监控，5 分钟接入自定义监控指标"
description: "Spring Boot 使用 Micrometer 集成 Prometheus 监控，5 分钟接入自定义监控指标"
summary: ""
date: 2023-08-07T10:54:37+08:00
lastmod: 2024-03-09T14:29:03+08:00
draft: false
weight: 200
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

Spring Boot 使用 Micrometer 集成 Prometheus 监控，5 分钟接入自定义监控指标，主要内容：

1. Micrometer 介绍。
2. 业务如何自定义指标，如何接入 Prometheus，实现方式和规范。

## Micrometer 介绍

Micrometer 为 Java 平台上的性能数据收集提供了一个通用的 API，应用程序只需要使用 Micrometer 的通用 API 来收集性能指标，Micrometer 会负责完成与不同监控系统的适配工作。

Micrometer 提供了多种度量指标类型（Timers、Guauges、Counters 等），同时支持接入不同的监控系统，例如 Influxdb、Graphite、Prometheus、OTLP 等。

从 Spring Boot 2.x 开始使用 Micrometer 作为默认的监控门面接口， `Think SLF4J, but for observability` 。

### Micrometer 核心概念

Micrometer 中两个最核心的概念：计量器注册表 (MeterRegistry)，计量器 (Meter)。

- MeterRegistry

  - 内存注册表 (SimpleMeterRegistry): 在内存中保存每一个 Meter（指标）的最新值，并且不会将数据导出到任何地方。
  - 组合注册表 (CompositeMeterRegistry): 可以添加多个注册表，用于将各个注册表组合起来，可以同时将指标发布到多个监控系统。Micrometer 提供了一个全局的 MeterRegistry，`io.micrometer.core.instrument.Metrics` 中持有一个静态 final 的 CompositeMeterRegistry 实例 globalRegistry。
  - 普罗米修斯注册表 (PrometheusMeterRegistry): 当使用普罗米修斯监控时，引入 micrometer-registry-prometheus 依赖时会提供此种收集器，用于将指标数据转换为普罗米修斯识别的格式和导出数据等功能。

- Meter（指标）

  监控数据的整个过程都是围绕着 Meter（指标）, 通过一个一个的 Meter（指标）数据来进行观察应用的状态。常用的指标如：

  - Counter（计数器）: 单一计数指标，允许按固定数量递增，用来统计无上限数据。只允许递增。
  - Gauge（仪表盘）: 表示单个的变化的值，例如温度，气压。用于统计有上限可增可减的数据。在每次取样时，Gauge 会返回当前值。
  - Timer（计时器）: 通常用来记录事件的持续时间。Timer 会记录两类的数据，事件的数量和总的持续时间。

- Tag（标签）

  Mircrometer 通过 Tag（标签）实现了多维度的度量数据收集，通过 Tag 的命名可以推断出其指向的数据代表什么维度或是什么类型的度量指标。

## 当前实现方式和要求

总体架构：Spring Boot Actuator + Micrometer + Prometheus + Granfana。

- Spring Boot Micrometer：提供监控门面 Api。
- Spring Boot Actuator：提供监控指标采集服务，通过 `/actuator/prometheus` 获取数据。
- Prometheus + Granfana：采集和存储数据，提供图表展示，另外 Granfana 可根据指标配置告警规则发出告警。

总体实现步骤如下：

1. Spring Boot Actuator 放开 `prometheus` http 访问，在配置文件中增加以下配置。

   ```properties
   management.endpoint.prometheus.enabled=true
   management.endpoints.web.exposure.include=info,health,metrics,prometheus
   management.metrics.export.prometheus.enabled=true
   ```

2. 创建 Prometheus ServiceMonitor 或 PodMonitor，从 `/actuator/prometheus` path 采集指标，如果涉及多个 war 合并部署到一个 tomcat 的，从多个 path 采集。

   ```yaml
   apiVersion: monitoring.coreos.com/v1
   kind: ServiceMonitor
   metadata:
   labels:
     app.kubernetes.io/component: metrics
     release: your-prometheus-instance-name
   name: eye-consumer
   namespace: test
   spec:
   endpoints:
     - interval: 30s
       honorLabels: true
       # /client-biz 是我的服务 ContextPath
       path: /client-biz/actuator/prometheus
       port: metrics
     - interval: 30s
       honorLabels: true
       path: /gateway-biz/actuator/prometheus
       port: metrics
   jobLabel: eye-consumer
   selector:
     matchLabels:
     app: eye-consumer
   ```

3. 业务可通过 `http://localhost:8080/actuator/metrics` 查看指标是否已上报，通过 `http://localhost:8080/actuator/prometheus` 查看指标的当前值。

## 自定义 Metrics 指标

在 Spring Boot 中实现自定义指标非常简单，几种方式举例如下。

1. 像使用 slf4j 一样，使用 `io.micrometer.core.instrument.Metrics` 静态方式初始化一个指标，然后使用此指标直接操作。
2. 使用 `@Timed @Counted` 注解。注意注解方式必须等方法调用后才能生成指标。而静态方法形式 `io.micrometer.core.instrument.Metrics.counter`立即就生成指标只是值为 0。另外注意 Spring 注解不支持 private、default 级别方法。
3. 使用 Autowired MeterRegistry 创建自己的指标类型，适合一些动态 Tag 等高级定制场景。

```java

import io.micrometer.core.annotation.Counted;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Metrics;
import org.springframework.stereotype.Service;

@Service
public class MicrometerSampleService {

  /**
   * 方式 1：像使用 slf4j 一样，使用 `io.micrometer.core.instrument.Metrics`静态方式初始化一个计数器，适用于名字和 Tag 固定的场景
   */
  private static final Counter failure = Metrics.counter("fs.sms.send", "result", "failure");

  @Autowired
  private MeterRegistry registry;

  private void sendSms() {
    try {
      // do something
    } catch (Exception e) {
      failure.increment();
    }
  }

  /**
   * 方式 2：使用注解的方式，注意需要引入 spring-boot-starter-aop 依赖
   */
  @Counted(value = "fs.sms.send", extraTags = {"provider", "huawei"})
  public void sendByHuawei() {
    this.sendSms();
  }

  @Counted(value = "fs.sms.send", extraTags = {"provider", "ali"})
  public void sendByAli() {
    this.sendSms();
  }

    /**
   * 方式 3：使用 MeterRegistry，适合一些动态 Tag 等高级定制场景
   *
   * @param result result
   */
  public void countByResult(String result) {

    registry.counter("fs.sms.send", "result", result).increment();

    // or
    Counter.builder("fs.sms.send")
        .description("send sms")
        .tags("result", result)
        .register(registry)
        .increment();
  }

}

```

Spring Boot 无法直接使用 `@Timed @Counted` 注解，需要引入切面支持，需要引入 spring-boot-starter-aop 依赖。

```java

@Configuration
public class MicrometerAspectConfiguration {

  @Bean
  public CountedAspect countedAspect(MeterRegistry registry) {
    return new CountedAspect(registry);
  }

  @Bean
  public TimedAspect timedAspect(MeterRegistry registry) {
    return new TimedAspect(registry);
  }
}

```

另外这里大家可能有个疑惑，我的请求量很大，`Metrics.counter` 对象是不是每次都 new 出来的，要不要缓存起来，减少获取 counter 对象的压力。

其实不用，MeterRegistry 已经做了缓存，参考 `io.micrometer.core.instrument.MeterRegistry#registerMeterIfNecessary` 以下代码片段。

```java

  private <M extends Meter> M registerMeterIfNecessary(Class<M> meterClass, Meter.Id id, @Nullable DistributionStatisticConfig config, BiFunction<Meter.Id, DistributionStatisticConfig, M> builder, Function<Meter.Id, M> noopBuilder) {
    Meter.Id mappedId = this.getMappedId(id);
    Meter m = this.getOrCreateMeter(config, builder, id, mappedId, noopBuilder);
    if (!meterClass.isInstance(m)) {
      throw new IllegalArgumentException(String.format("There is already a registered meter of a different type (%s vs. %s) with the same name: %s", m.getClass().getSimpleName(), meterClass.getSimpleName(), id.getName()));
    } else {
      return (Meter)meterClass.cast(m);
    }
  }
```

### 自定义指标高级配置

Spring 默认注入的 MeterRegistry 是一个 CompositeMeterRegistry，如果想定制可注入自定义 MeterRegistryCustomizer Bean。

```java
@Configuration
public class MicrometerConfiguration {

  @Bean
  MeterRegistryCustomizer<MeterRegistry> configurer() {
    return (registry) -> registry.config()
        .commonTags("group", "sample")
        .commonTags("application", "sample");
  }

}

```

如果只是想为当前应用增加 Tag，可直接通过配置文件增加，示例如下。

```properties
management.metrics.tags.biz=sample
management.metrics.tags.application=${spring.application.name}
```

### 自定义指标规范

1. 指标和 Tag 命名约定使用英语句号分隔，全小写，Tag 可根据实际情况使用缩写。指标名在不同的 MeterRegistry 里会自动转换，比如在 Prometheus 会把 `fs.sms.send` 转换为 `fs_sms_send`。
2. 指标命名建议以 `fs.application.action` 为模板，避免与开源或其他项目组冲突。
3. 注意 Tag values 不能为 Null， 且必须是可枚举的某些固定类型便于统计。
4. 使用注解 `@Timed @Counted` 会默认增加 `method、class、result、exception` 这几个 Tag，注意不要与之冲突。
5. 在 K8S 集群内，公司和开源默认 Tag 如下，这些会被 ServiceMonitor 强制覆盖，业务不要自己定义。

   ```console
   namespace、application、service、container、pod、instance、job、endpoint、id
   ```

6. 编码中如果需要 MeterRegistry，不允许引用具体实现（比如 Prometheus 的 io.prometheus.client.CollectorRegistry），而是使用 Micrometer 提供的统一接口 `MeterRegistry`。类比，在打印日志时不允许直接使用 logback 或 log4j api，而是使用 slf4j api.
7. 不要自己 new MeterRegistry，而是使用自动注入的或静态方法。
8. 建议为指标加上 `description` 字段。

## 最佳实践

1. 合理规划 Tag，一个 Meter 具体类型需要通过名字和 Tag 作为它的唯一标识，这样做的好处是可以使用名字进行标记，通过不同的 Tag 去区分多种维度进行数据统计。

   ```console
   反例 1（全部用 name 区分，无 Tag，重复计量，无法多维度分析汇聚）：
     Metrics.counter("fs.sms.all");
     Metrics.counter("fs.sms.aliyun");
     Metrics.counter("fs.sms.huaweiyun");

   正例：
     Metrics.counter("fs.sms.send","provider","ali");
     Metrics.counter("fs.sms.send","provider","huawei","result","success");
   ```

2. 避免无意义不可枚举的 Tag，混乱的 Tag 比无 Tag 更难管理。
