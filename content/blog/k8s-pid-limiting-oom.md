---
title: "K8S 容器 PID 限制引起的 Java OutOfMemoryError"
description: "K8S 容器 PID 限制引起的 Java OutOfMemoryError"
summary: ""
date: 2023-09-07T16:21:44+08:00
lastmod: 2023-09-07T16:21:44+08:00
draft: false
weight: 50
images: []
categories: [k8s]
tags: [k8s, Java]
contributors: [l10178]
pinned: false
homepage: false
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

真实原因： K8S 容器限制了 PID 数，无法创建新的线程，在 Pod 内 `cat /sys/fs/cgroup/pids/pids.max` 发现是 1024。

关于 K8S pid limit， 可参考此资料：<https://kubernetes.io/zh-cn/docs/concepts/policy/pid-limiting/>.

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
