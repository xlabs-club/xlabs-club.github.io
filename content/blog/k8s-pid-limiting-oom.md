---
title: "K8S 容器 PID 限制引起的 Java OutOfMemoryError"
description: "K8S 容器 PID 限制引起的 Java OutOfMemoryError 问题分析与解决方案，包含 PID 限制配置和排查方法"
summary: ""
date: 2023-09-07T16:21:44+08:00
lastmod: 2025-12-18T22:37:18+08:00
draft: false
weight: 50
images: []
categories: [k8s]
tags: [k8s, Java, OOM, PID限制]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "K8S 容器 PID 限制引起的 Java OutOfMemoryError 问题排查"
  description: "K8S 容器 PID 限制引起的 Java OutOfMemoryError 问题分析与解决方案，包含 PID 限制配置和排查方法"
  canonical: ""
  noindex: false
---

问题描述：

一个 Java 应用跑在 K8S 容器内，Pod 内只有 Java 这一个进程。应用跑了一段时间后，CPU、内存占用都不高，但是却出现以下 OutOfMemoryError 错误。

```console
Exception in thread "slow-fetch-15" java.lang.OutOfMemoryError: unable to create new native thread
428  at java.lang.Thread.start0(Native Method)
429  at java.lang.Thread.start(Thread.java:719)
430  at java.util.concurrent.ThreadPoolExecutor.addWorker(ThreadPoolExecutor.java:957)
431  at java.util.concurrent.ThreadPoolExecutor.processWorkerExit(ThreadPoolExecutor.java:1025)
432  at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1167)
433  at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:624)
```

进入 Pod 内，尝试执行任何操作，又会出现 `unable to start container process` 错误。

一开始怀疑是内存不足，调大了内存，同时也缩小了 Java 的 `xss`，都不起作用。

真实原因： K8S 容器限制了 PID 数，无法创建新的线程。关于 K8S PID limit， 可参考此资料：<https://kubernetes.io/zh-cn/docs/concepts/policy/pid-limiting/>.

在 Pod 内查看当前 PID 限制方式：

```bash
# cgroup v1 版本，查看最大值和当前值
cat /sys/fs/cgroup/pids/pids.max
cat /sys/fs/cgroup/pids/pids.current
# cgroup v2 版本
cat /sys/fs/cgroup/$(cat /proc/self/cgroup | grep -o '[^:]*$')/pids.max
cat /sys/fs/cgroup/$(cat /proc/self/cgroup | grep -o '[^:]*$')/pids.current

```

但是，PID 为什么会超呢，Pod 内只有一个 Java 进程，PID 数不应该是 1 个吗，这个 PID 限制为什么影响了`线程`。

简单来讲，在 Linux 中线程其实是通过轻量级进程实现的，也就是 LWP(light weight process)，因此在 Linux 中每个线程都是一个进程，都拥有一个 PID，换句话说，操作系统原理中的线程，对应的其实是 Linux 中的进程（即 LWP），因此 Linux 内核中的 PID 对应的其实是原理中的 TID。

在 Pod 内通过 `top -p pid -H` 查看，可以看到第一列每个线程都分配了一个 PID。

```console

PID USER      PR  NI    VIRT    RES    SHR S %CPU %MEM     TIME+ COMMAND
101 root      20   0 8622220   5.1g  15640 S  0.3  8.1   0:16.29 VM Thread
112 root      20   0 8622220   5.1g  15640 S  0.3  8.1   0:46.13 C2 CompilerThre
113 root      20   0 8622220   5.1g  15640 S  0.3  8.1   0:39.62 C1 CompilerThre
846 root      20   0 8622220   5.1g  15640 S  0.3  8.1   0:00.64 NettyClientSele
850 root      20   0 8622220   5.1g  15640 S  0.3  8.1   0:00.54 NettyClientWork
  1 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:00.27 java
 89 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:00.99 java
 90 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:03.29 java
 91 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:03.27 java
 92 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:03.26 java
 93 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:03.30 java
 94 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:01.43 java
 95 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:00.11 java
 96 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:00.12 java
 97 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:00.16 java
 98 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:00.31 java
 99 root      20   0 8622220   5.1g  15640 S  0.0  8.1   0:00.32 java
```

为什么要限制 POD PID 数。类似 CPU 和内存，进程 ID（PID）也是节点上的一种基础资源，很容易就会在尚未超出其它资源约束的时候就已经触及任务个数上限，进而导致宿主机不稳定。某日某个不起眼的服务因为无节制创建了 N 多线程，把整个宿主机打挂了，谁痛谁知道啊。

## 如何估算 Java 应用的 PID 需求

Java 应用的 PID 消耗由以下部分组成：

| 组成部分 | 说明 | 典型数量 |
|---|---|---|
| JVM 进程自身 | 1 个主进程 PID | 1 |
| GC 线程 | 与 GC 算法相关，G1 和 Parallel 默认与 CPU 核数相关 | `ParallelGCThreads` ≈ CPU 核数 |
| JIT 编译线程 | C1 + C2 编译器 | ~2-4 |
| JVM 内部线程 | VM Thread、Reference Handler、Finalizer 等 | ~10-15 |
| 业务线程池 | `ThreadPoolExecutor` + `ForkJoinPool` | 取决于配置 |
| Netty/Web Server 线程 | Tomcat thread pool（默认 200）/ Netty event loop | 200+ |
| 第三方库线程 | Hystrix、RxJava、Kafka Client 等 | 因库而异 |

**估算公式（Java 应用）：**

```
预估 PID 数 = 基础线程（~20）+ Tomcat线程数 + 业务线程池大小 + Netty 线程数 + 第三方库线程数 + 安全余量（20%）
```

对于典型的 Spring Boot Web 应用：
- Tomcat `max-threads` 默认 200
- 业务线程池假设 50
- Netty 事件循环（如有）假设 ~2*core
- 总计：~280

设置 PID limit 为 500-1000 较为安全，可应对并发波动。

## 如何设置合理的 PID Limit

Pod 配置中使用 `resources.limits` 或 Pod-level PID limit（K8S 1.20+）：

```yaml
# 通过 resources.limits 间接限制（K8S 1.14+ 开启 SupportPodPidsLimit feature gate，默认值）
# 或 K8S 1.20+ 通过 PodPidsLimit 来限制
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: java-app
      image: my-java-app:latest
      env:
        - name: JAVA_OPTS
          value: "-Xss512k"
```

对于 Kubelet 级别的默认 PID 限制（K8S 1.20+），通过 `--pod-max-pids` 参数设置：

```yaml
# /var/lib/kubelet/config.yaml
podPidsLimit: 4096  # 每个 Pod 的默认 PID 上限，-1 表示不限制
```

注意：`podPidsLimit` 是集群级默认值，如需各 Pod 差异化配置，可在 PodSecurityPolicy 或 K8S 1.21+ 的 Pod Security Admission 中设置。

## 排查与监控

### 实时查看线程数

```bash
# 在 Pod 内查看当前线程数
jstack <java_pid> | grep "^Thread" | wc -l

# 或通过 /proc 文件系统
ls /proc/<java_pid>/task | wc -l

# 按线程状态分类统计
jstack <java_pid> | grep "java.lang.Thread.State" | sort | uniq -c | sort -rn
```

### 关键 JVM 指标

```bash
# JMX 或 jcmd 查看线程使用情况
jcmd <java_pid> Thread.print -l > thread_dump.txt

# 线程数历史趋势（如果接入 Prometheus）
# jvm_threads_current{state="runnable|blocked|waiting|timed-waiting"}
```

### 设置告警

在 Prometheus 中配置告警规则：

```yaml
# 基于 cAdvisor 指标监控 PID 使用率
- alert: PodPidNearLimit
  expr: |
    (container_processes{pod=~".*"})
    / on(pod) (container_spec_pid_limit{pod=~".*"}) > 0.8
  for: 5m
  annotations:
    summary: "Pod {{ $labels.pod }} PID usage near limit"
```

当 PID 使用率超过 80% 且持续 5 分钟时触发告警。

## 根本解决思路

1. **排查线程泄漏**：如果 PID 持续增长不下降，很可能是线程池未合理关闭，或类似 `Executors.newCachedThreadPool()` 无限创建线程。用 `jstack` 抓取线程 dump 按状态分类。

2. **限制线程池大小**：
   ```java
   // 避免无界线程池
   ExecutorService executor = new ThreadPoolExecutor(
       10, 50, 60L, TimeUnit.SECONDS,
       new LinkedBlockingQueue<>(1000),
       new ThreadPoolExecutor.CallerRunsPolicy() // 拒绝策略：让调用线程执行
   );
   ```

3. **确认 `Xss` 设置**：每个线程的栈空间由 `-Xss` 决定（默认 1M），128 线程 × 1M = 128M，这部分占的是虚拟内存而非物理内存，但仍会影响 `PIDs.current`。

4. **合理设置 PID Limit**：根据上述估算公式给出合理的 `pidLimit`，不要一味放大——过高的 PID Limit 失去了 container 隔离的意义。
