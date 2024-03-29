---
title: "使用 Sentinel 实现分布式应用限流"
description: "基于 Alibaba Sentinel 实现的分布式限流中间件服务"
summary: ""
date: 2024-03-07T21:06:10+08:00
lastmod: 2024-03-07T21:06:10+08:00
draft: false
weight: 50
categories: []
tags: [Java]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "" # custom title (optional)
  description: "" # custom description (recommended)
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

基于 Alibaba Sentinel 实现的分布式限流中间件服务。主要对服务提供者提供限流、系统保护，对服务调用者提供熔断降级、限流排队等待效果。

实现目标：

1. 作为服务提供者，保护自己不被打死，服务可以慢不可以挂。
2. 作为客户端及时限速和熔断，防止对服务提供方包含 Http、数据库、MQ 等造成太大压力，防止把糟糕的情况变得更糟。
3. 以用户、租户、对象等更细粒度进行流量精细控制。
4. 服务预热，应用新发布上线，缓存尚未完全建立，防止流量一下子把服务打死。
5. 能够根据 Prometheus、ClickHouse、Elasticsearch 提供的监控指标，动态生成规则，自适应调整规则。

## 概述

Sentinel 的基础知识请参考官方文档描述，这里单独介绍一些与我们定制相关的内容。

限流简单来说就三个点：资源、规则、效果。

资源：就是一个字符串，这个字符串可以自己定义、可以用注解自动生成、可以通过拦截器按规则生成。
规则：Sentinel 定义的一系列限流保护规则，比如流量控制规则、自适应保护规则。
效果：实际上“效果”也是“规则”定义的一部分。任何一条请求，命中某些资源规则后产生的效果，比如直接抛出异常、匀速等待。

## Sentinel 全局注意事项和使用限制

使用开源默认 Sentinel 组件，可关注以下注意事项：

1. 单个进程内资源数量阈值是 6000，多出的资源规则将不会生效，也不提示错误而是直接忽略，资源数量太多建议使用热点参数控制。
2. 对于限流的链路模式，context 阈值是 2000，所以默认的 WEB_CONTEXT_UNIFY 为 true，如果需要链路限流需要把这个改为 false。
3. 自定义时，资源名中不要带 `|` 线， 这个日志中要用，日志以此作为分割符。
4. Sentinel 支持按来源限流，注意 `origin` 数量不能太多，否则会导致内存暴涨，并且目前不支持模式匹配。
5. 一个资源可以有多个规则，一条请求能否通过，取决于规则里阈值最小的限制条件。
6. 限流的目的是保护系统，计数计量并不准确，所以不要拿限流做计量或配额控制。
7. 增加限流一定程度上通过时间换空间，降低了 CPU、内存负载，对 K8S HPA 策略会有一定影响。后续我们也会考虑根据 Sentinel 限流指标进行扩缩容。
8. 接口变慢，各调用链需要关注调用超时和事务配置。
9. 目前 sentinel-web-servlet 和 sentinel-spring-webmvc-adapter 均不支持热点参数限流。为了支持热点参数需要自行扩展。

## 接入指导

总体架构图。

![架构模块](sentinel.png "架构模块")

我们所有组件，规则加载都是由 Datasource 组件统一加载，配置是懒加载的，在第一次访问的时候加载，如果需要定义规则请在配置中心定义。这是由 Sentinel 在第一次初始化的时候通过 SPI 加载的，所以在咱们的代码里看不到主动加载的动作。
注意：如果你有自编码使用 Sentinel SDK 自带的 XxxRuleManager.loadRules 加载规则，会被远端配置中心覆盖掉。

### 规则参数详解

Sentinel 规则的资源名字匹配支持正则表达式，但是不知道为什么文档里从未提及，可能是考虑到性能。如果要为某个规则启用正则，需主动设置 xxRule.setRegex(true)，另外注意用的是 Java 正则匹配，不要和 Spring Path 的正则匹配混了。比如 Java 里  `.*`  代表任意匹配，Spring `*` 表达任意匹配。

#### 系统自适应保护规则

参数示例：

```json

  {
    "avgRt": 500,
    "highestSystemLoad": 100,
    "highestCpuUsage": 90.0,
    "maxThread": 100,
    "qps": 200.0
  }

```

- highestSystemLoad：当系统 load1 超过阈值，且系统当前的并发线程数超过系统容量时才会触发系统保护。系统容量由系统的 `maxQps * minRt` 计算得出。设定参考值一般是 `CPU cores * 2.5`。
- highestCpuUsage：当系统 CPU 使用率超过阈值即触发系统保护（取值范围 0.0-1.0）。
- avgRt ：当单台机器上所有入口流量的平均 RT 达到阈值即触发系统保护，单位是毫秒。
- maxThread：当单台机器上所有入口流量的并发线程数达到阈值即触发系统保护。
- qps：当单台机器上所有入口流量的 QPS 达到阈值即触发系统保护。

以上参数默认是 `-1`，代表无限制。

注意：

1. 在 K8S 环境下，Sentinel 读取当前指标值时，highestSystemLoad 获取的是宿主机的 load1，不是 Pod 的。参考：<https://github.com/alibaba/Sentinel/issues/2260>
2. Sentinel 读取当前指标值时，获取的 CPU 指标取的是 Pod Cpu 和宿主机 CPU 的最大值，也就是说如果 `宿主机 CPU 占用太高，Pod CPU 很低`，会误伤，会触发限流。
3. highestSystemLoad 相当于要不要自适应的开关，达到条件后会计算下是否还能承受流量，不行才拒绝。这就是所谓的“自适应”。除 highestSystemLoad 外，其他几个参数是达到阈值就拒绝。
4. 规则中的几个参数，可以在一条规则里全部设置，也可以分多个规则配置不同参数，也可以只设置某个，Sentinel 会自行合并参数计算。

#### 流量控制

参数示例：

```json
 {
    "resource": "spring-cloud-samples:GET:/api-provider/pets/{id}",
    "count": 100.0,
    "grade": 1,
    "controlBehavior": 0,
    "warmUpPeriodSec": 10,
    "maxQueueingTimeMs": 5000,
    "limitApp": "default",
    "strategy": 0
  }

```

- resource：资源名，即限流规则的作用对象
- count: 限流阈值
- grade: 限流阈值类型，QPS（RuleConstant.FLOW_GRADE_QPS = 1） 或线程数（RuleConstant.FLOW_GRADE_THREAD = 0）。
- controlBehavior：限流效果，有直接拒绝（RuleConstant.CONTROL_BEHAVIOR_DEFAULT = 0）、冷启动（RuleConstant.CONTROL_BEHAVIOR_WARM_UP=1）、匀速器（RuleConstant.CONTROL_BEHAVIOR_RATE_LIMITER=2）、冷启动-匀速器（RuleConstant.CONTROL_BEHAVIOR_WARM_UP_RATE_LIMITER=3）。
- warmUpPeriodSec：冷启动时间，单位秒，默认 10s。
- maxQueueingTimeMs：最大排队等待时长，默认 500ms。（仅在匀速排队模式 + QPS 下生效）
- limitApp: 按来源限流，默认 default 表示忽略来源。
- strategy: 根据调用关系选择策略（默认用 RuleConstant.STRATEGY_DIRECT=0，直接来源）

注意：

1. 匀速器模式的时候一定要计算好 maxQueueingTimeMs，这个值默认比较小，避免排队超时（也就抛出异常）达不到匀速的效果。
2. 匀速排队模式不支持 QPS > 1000 的场景，因为 Sentinel 内部通过 Thread::sleep 来实现虚拟等待队列，QPS 等于 1000 时，每个请求正好 sleep 1 ms，而当 QPS > 1000 时，没法精准的控制 sleep 小于 1 ms 的时长。

#### 热点参数限流

热点参数限流会统计传入参数中的热点参数，并根据配置的限流阈值与模式，对包含热点参数的资源调用进行限流。热点参数限流可以看做是一种特殊的流量控制，仅对包含热点参数的资源调用生效。
Sentinel 利用 LRU 策略统计最近最常访问的热点参数，结合令牌桶算法来进行参数级别的流控。

参数示例：

```json
 {
    "resource": "spring-cloud-samples:GET:/api-provider/pets/{id}",
    "count": 100.0,
    "grade": 1,
    "paramIdx": 0,
    "controlBehavior": 0,
    "warmUpPeriodSec": 1,
    "maxQueueingTimeMs": 5000,
    "durationInSec": 1,
    "burstCount": 0,
    "limitApp": "default",
    "paramFlowItemList": [{
        "object": "ea-vip",
        "classType": "String",
        "count": 1000
    }],
    "strategy": 0
  }

```

- 默认参数参考流量控制规则的解释。
- paramIdx：热点参数的索引，必填，对应 SphU.entry(xxx, args) 中的 args 参数索引位置，从 0 开始。
- durationInSec：统计窗口时间长度（单位为秒），默认 1s。
- paramFlowItemList：参数例外项，可以针对指定的参数值单独设置限流阈值，不受前面 count 阈值的限制。仅支持基本类型和字符串类型。
- burstCount: 为应对突发流量"额外允许"的流量，在原 count 的基础上再额外加上这个值，相当于保底。默认为 0，仅在 `快速失败|Warm UP` + QPS 下生效。（Java 文档中未提及，代码中支持）

注意：

1. 可以通过 paramFlowItemList 设置例外项，比如为 VIP 单独设置限流阈值。
2. 每个参数索引 (paramIdx) 对应的不同值最多统计 4000（ParameterMetric.BASE_PARAM_MAX_CAPACITY）个。
3. 在统计窗口时间长度（durationInSec）内最多允许统计 20 万个。可以理解为 LRU 的 Top N。

#### 来源访问控制

参数示例：

```json
 {
    "resource": "spring-cloud-samples:GET:/api-provider/pets/{id}",
    "limitApp": "default",
    "strategy": 0
  }

```

- resource：资源名，即限流规则的作用对象
- limitApp：对应的黑名单/白名单，不同 origin 用 , 分隔，如 appA,appB
- strategy：限制模式，AUTHORITY_WHITE=0 为白名单模式，AUTHORITY_BLACK=1 为黑名单模式，默认为白名单模式。

#### 熔断降级

现代微服务架构都是分布式的，由非常多的服务组成。不同服务之间相互调用，组成复杂的调用链路。以上的问题在链路调用中会产生放大的效果。复杂链路上的某一环不稳定，就可能会层层级联，最终导致整个链路都不可用。因此我们需要对不稳定的弱依赖服务调用进行熔断降级，暂时切断不稳定调用，避免局部不稳定因素导致整体的雪崩。熔断降级作为保护自身的手段，通常在客户端（调用端）进行配置。

Sentinel 提供以下几种熔断策略：

- 慢调用比例 (SLOW_REQUEST_RATIO)：选择以慢调用比例作为阈值，需要设置允许的慢调用 RT（即最大的响应时间），请求的响应时间大于该值则统计为慢调用。当单位统计时长（statIntervalMs）内请求数目大于设置的最小请求数目，并且慢调用的比例大于阈值，则接下来的熔断时长内请求会自动被熔断。经过熔断时长后熔断器会进入探测恢复状态（HALF-OPEN 状态），若接下来的一个请求响应时间小于设置的慢调用 RT 则结束熔断，若大于设置的慢调用 RT 则会再次被熔断。
- 异常比例 (ERROR_RATIO)：当单位统计时长（statIntervalMs）内请求数目大于设置的最小请求数目，并且异常的比例大于阈值，则接下来的熔断时长内请求会自动被熔断。经过熔断时长后熔断器会进入探测恢复状态（HALF-OPEN 状态），若接下来的一个请求成功完成（没有错误）则结束熔断，否则会再次被熔断。异常比率的阈值范围是 [0.0, 1.0]，代表 0% - 100%。
- 异常数 (ERROR_COUNT)：当单位统计时长内的异常数目超过阈值之后会自动进行熔断。经过熔断时长后熔断器会进入探测恢复状态（HALF-OPEN 状态），若接下来的一个请求成功完成（没有错误）则结束熔断，否则会再次被熔断。

```json
 {
    "resource": "spring-cloud-samples:GET:/api-provider/pets/{id}",
    "grade": 0,
    "count": 100.0,
    "timeWindow": 10,
    "minRequestAmount": 5,
    "statIntervalMs": 1000,
    "slowRatioThreshold": 1
  }

```

- grade：熔断策略，支持慢调用比例/异常比例/异常数策略。默认慢调用比例。
- count：慢调用比例模式下为慢调用临界 RT（超出该值计为慢调用）；异常比例/异常数模式下为对应的阈值。
- timeWindow：熔断时长，单位为秒。
- minRequestAmount：熔断触发的最小请求数，请求数小于该值时即使异常比率超出阈值也不会熔断。默认 5。
- statIntervalMs：统计时长（单位为 ms），如 60*1000 代表分钟级。默认 1000ms。
- slowRatioThreshold：慢调用比例阈值，仅慢调用比例模式有效。

注意事项：

1. 熔断降级规则在服务端时，Spring 的全局异常处理器一般会消化掉异常转换成一个合法的 Response，会导致熔断规则中的异常数规则失效，我们在 Server 端并不准备支持，参考 [Issue](https://github.com/alibaba/Sentinel/issues/2461)。

### 日志和监控模块

我们自定义了日志模块，在 block 和 metrics 日志中增加 trace id、user id 等更多参数，通过 fluent-bit 收集到 ClickHouse 中。

可在 Granfana 中以 ClickHouse 作为数据源配置自己需要的视图，并结合告警组件配置告警，比如应用 1 分钟 block 次数超过 10 次触发告警。

## FAQ

- Q：Sentinel 资源生成时如何忽略某些资源。

  A：自定义 UrlCleaner，对想忽略的资源返回空字符。

- Q：对于限流的冷启动效果，冷启动结束进入稳定状态后，还会不会重新回到冷启动阶段。

  A：一段时间流量较小或无流量后会回到冷启动阶段。服务第一次启动时，或者接口很久没有被访问，都会导致当前时间与上次生产令牌的时间相差甚远，所以第一次生产令牌将会生产 maxPermits 个令牌，直接将令牌桶装满。由于令牌桶已满，接下来 10s 就是冷启动阶段。具体查看参考资料里的冷启动算法详解。

## 参考资料

- 令牌桶算法在 Sentinel 中的应用：<https://blog.51cto.com/morris131/6506314>
- Sentinel 中的冷启动限流算法：<https://cloud.tencent.com/developer/article/1674916>
