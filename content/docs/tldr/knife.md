---
title: "Knife"
description: "程序员的瑞士军刀，常用优秀命令行工具"
summary: ""
date: 2024-03-09T14:39:50+08:00
lastmod: 2024-03-09T14:39:50+08:00
draft: false
weight: 999
toc: true
seo:
  title: "程序员的瑞士军刀，常用优秀命令行工具"
  description: "程序员的瑞士军刀，常用优秀命令行工具"
  canonical: ""
  noindex: false
---

程序员的瑞士军刀，常用优秀命令行工具，上榜都是有理由的。

## procs

比 ps 好用的工具，查看路径和端口一步到位，支持过滤。

## ripgrep

[ripgrep](https://github.com/BurntSushi/ripgrep) 简称 rg，是一个面向行的搜索工具，Rust 编写，全平台支持，也是 VS Code 的默认搜索工具。它的搜索性能极高，在大项目中也有着出色的表现，并且默认可以忽略 .gitignore 文件中的内容，非常实用。

除了作为一个高效的命令行工具使用外，整个项目的设计也不错，另外还是一个学习 Rust 的好项目。

`rg -h` 开启探索之旅吧。

## TL;DR

Too Long; Didn’t Read.

tldr 根据二八原则，简化了烦琐的 man 指令帮助文档，仅列出常用的该指令的使用方法，让人一看就懂，大多数情况下，给出几个指令的使用 demo 可能正是我们想要的。

举个例子看下实际运行效果，如下（太长，节选）。

```console
➜  ~ tldr docker

  List all docker containers (running and stopped):

      docker ps -a

  Start a container from an image, with a custom name:

      docker run --name container_name image

  Start or stop an existing container:

      docker start|stop container_name

```

[tldr](https://github.com/tldr-pages/tldr) 命令行有多种实现，比如官方推荐的有 npm 和 python。

个人更喜欢 Rust 版本的实现 [tealdeer](https://github.com/dbrgn/tealdeer)，支持各系统包管理器和二进制安装，比如 homebrew。

```bash
brew install tealdeer
```

## fd

[fd](https://github.com/sharkdp/fd)，find 的替代品。

## bottom

[bottom](https://github.com/ClementTsang/bottom)，类似 Top 的酷炫系统监控工具，Inspired by gtop, gotop, and htop。

## bat

[bat](https://github.com/sharkdp/bat)，一只带翅膀的 cat，代替 cat 命令。
