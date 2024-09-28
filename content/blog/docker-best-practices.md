---
title: "容器镜像制作最佳实践，Dockerfile 实践经验和踩坑记录"
description: "容器镜像制作最佳实践，Dockerfile 实践经验和踩坑记录"
summary: ""
date: 2024-05-24T20:56:08+08:00
lastmod: 2024-05-24T20:56:08+08:00
draft: false
weight: 50
categories: []
tags: [k8s]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "" # custom title (optional)
  description: "" # custom description (recommended)
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

整理了由 Docker 官方和社区推荐的用于构建高效镜像的最佳实践和方法，当然有些可能并不适用于你，请注意分辨。

1. 使用官方镜像作为基础镜像。官方镜像经过了充分验证并集成了最佳实践。

    ```dockerfile
    # 正例：
        FROM node
    # 反例：
        FROM ubuntu
        RUN apt-get install -y node
    ```

2. 保持尽可能小的镜像大小，绝不安装无关依赖。
3. 严格的版本化管理，使用确定性的标签，基础镜像禁用 latest。
4. 使用 .dockerignore 文件排除文件干扰。
5. 最经常变化的命令越往后执行，充分利用分层缓存机制。
6. Dockerfile 中每行命令产生一层，请合并命令执行，最大限度减少层数。
7. 使用多阶段构建，减少所构建镜像的大小。
8. 禁用 root 用户，使用独立的 use 和 group。
9. 启用镜像安全扫描，并及时更新。
10. 一个容器只专注做一件事情。
11. Java 应用程序不要使用 PID 为 1 的进程，使用 tini 或 dump-init 管理进程，避免僵尸进程。

以上都是一些基本的原则，但是实际工作的过程中，大家可能会像我一样纠结几个问题。

- 关于第 1 点，一定要使用官方镜像吗。未必，看情况。比如我们作为平台，涉及很多种开发语言，很多种组合场景，每个官方基础镜像可能都不同，就会自建基础镜像，以便统一操作系统、统一脚本和安全维护。为什么要统一操作系统，操作系统投的毒，就像出骨鱼片里未净的刺，给人一种不期待的伤痛。
- 为了镜像大小和安全，一定要使用 Alpine 或 distroless 镜像吗。我的建议是不要使用 Alpine 镜像，如有能力才使用 distroless 镜像。毕竟 libc 的坑，谁痛谁知道。

## 我们的镜像策略

## Dockerfile 编写小技巧

- 使用 Heredocs 语法代替又长又臭的字符串拼接，当然 Heredocs 支持更多功能比如 run python、多文件内容拷贝，具体请参考官方文档。

  ```dockerfile
  # 以前
  RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y ...

  # 使用 Heredocs
  RUN <<EOF
    apt-get update
    apt-get upgrade -y
    apt-get install -y ...
  EOF

  # 单文件内容拷贝，直接生成文件内容到目标文件
  COPY <<EOF /usr/share/nginx/html/index.html
  (your index page goes here)
  EOF

  # 多文件内容拷贝，每个文件指定不同的文件内容
  COPY <<robots.txt <<humans.txt /usr/share/nginx/html/
  (robots content)
  robots.txt
  (humans content)
  humans.txt

  ```

- 使用 ARG 变量动态构建。

  ```dockerfile
  # ARG 可写默认值，也可不写
  ARG TOMCAT_TAG=9.0.93-jre21
  # 把 ARG 放到 FROM 的前面，FROM 指令即可使用变量
  FROM docker.io/tomcat:${TOMCAT_TAG}
  # 想在 FROM 后面继续使用 ARG，需在 FROM 后再声明一次
  ARG TOMCAT_TAG=9.0.93-jre21
  RUN echo "Tomcat tag is ${TOMCAT_TAG}"

  ```

- 使用 `COPY --from` 代替 curl 或 wget 静态文件下载，适用于一些 COPY 即可用的文件。

  ```dockerfile
  # 去 github.com releases 下载文件可能很慢，有些组件本身有 docker 版本，COPY 来用
  ARG JMX_VER=1.0.1
  FROM docker.io/nxest/tomcat-jmx-agent:${JMX_VER} AS tomcat-jmx-agent
  COPY --from=tomcat-jmx-agent /plugins /opt/tomcat/plugins

  ```

## 辅助工具

### skopeo

镜像搬运工具：<https://github.com/containers/skopeo>

## 参考资料

构建 Java 镜像的 10 个最佳实践：<https://zhuanlan.zhihu.com/p/469820791>

K8S 1.18 版本之前使用 kubectl-debug 插件：<https://github.com/aylei/kubectl-debug/blob/master/docs/zh-cn.md>
