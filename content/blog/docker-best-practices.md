---
title: "容器镜像制作最佳实践，Dockerfile 编写小技巧和踩坑记录，镜像维护辅助工具 ORAS、skopeo 等介绍"
description: "容器镜像制作最佳实践，Dockerfile 编写小技巧和踩坑记录，镜像维护辅助工具 ORAS、skopeo 等介绍"
summary: ""
date: 2024-05-24T20:56:08+08:00
lastmod: 2024-09-24T20:56:08+08:00
draft: false
weight: 50
categories: []
tags: [k8s]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "容器镜像制作最佳实践，Dockerfile 编写小技巧和踩坑记录，镜像维护辅助工具 ORAS、skopeo 等介绍"
  description: "容器镜像制作最佳实践，Dockerfile 编写小技巧和踩坑记录，镜像维护辅助工具 ORAS、skopeo 等介绍"
  canonical: ""
  noindex: false
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

- 使用 ARG 变量动态构建，注意 ARG 作用域。

  ```dockerfile
  # ARG 可写默认值，也可不写
  ARG TOMCAT_TAG=9.0.93-jre21
  # 把 ARG 放到 FROM 的前面，FROM 指令即可使用变量
  FROM docker.io/tomcat:${TOMCAT_TAG}
  # 想在 FROM 后面继续使用 ARG，需在 FROM 后再声明一次
  ARG TOMCAT_TAG=9.0.93-jre21
  RUN echo "Tomcat tag is ${TOMCAT_TAG}"

  # ARG 作用域：
  # 1. 在第一个 FROM 之前的所有 ARG , 在所有 FROM 中生效，仅在 FROM 中生效。
  # 2. 在 FROM 后的 ARG, 仅在当前 FROM 作用域生效。 即尽在当前 stage 生效。
  ```

- 使用 `COPY --from` 代替 curl 或 wget 静态文件下载，适用于一些 COPY 即可用的文件。

  ```dockerfile
  # 去 github.com releases 下载文件可能很慢，有些组件本身有 docker 版本，COPY 来用
  ARG JMX_VER=1.0.1
  FROM docker.io/nxest/tomcat-jmx-agent:${JMX_VER} AS tomcat-jmx-agent
  COPY --from=tomcat-jmx-agent /plugins /opt/tomcat/plugins

  ```

- 校验 curl 结果，如果失败退出。

  ```bash
  # 关于 -jkfSL 请参考 man 说明
  curl -jkfSL -o vmtouch.zip 'https://github.com/hoytech/vmtouch/archive/refs/tags/v1.3.1.zip'
  ```

## 多架构编译

如果你本身具备多架构的机器资源，使用 docker 远端 builder 或 [GoogleContainerTools/kaniko](https://github.com/GoogleContainerTools/kaniko) 同架构编译，速度和性能是最理想的。高度依赖指令集的应用，比如某些老 python 包无 arm 版本触发编译，跨架构编译可能需要 3 小时，而同架构只需要 10 分钟。

kaniko 支持“多架构编译”，但是不支持跨架构编译，不能在 amd64 机器上编译 arm64 容器，如果需要多架构只能在不同机器上多次编译，然后使用 manifest-tool 合并。

为 docker 启用多架构编译：

```sh

# 创建新的 build，支持多架构，直接 use 生效，关于 --driver 类型请参考官方文档
docker buildx create --name=multi-platform --platform=linux/amd64,linux/arm64 --driver=docker-container --use --bootstrap

# 查看是否生效，星号的代表当前生效的
docker buildx ls

# 指定 platform，build and push
docker buildx build --platform linux/amd64,linux/arm64 --push --tag tester:1.0

# 切换其他构建器
docker buildx use multi-platform

# 使用 buildx 提供的 imagetools inspect 工具可以查看远程仓库中的清单列表信息
docker buildx imagetools inspect tester:1.0

```

在 Dockerfile 中判断架构，支持如下架构相关的变量。

- **TARGETPLATFORM**: 构建镜像的目标平台，例如 `linux/amd64`, `linux/arm/v7`, `windows/amd64`。
- **TARGETOS**: `TARGETPLATFORM` 的 OS 类型，例如 `linux`, `windows`。
- **TARGETARCH**: `TARGETPLATFORM` 的架构类型，例如 `amd64`, `arm64`。
- **TARGETVARIANT**: `TARGETPLATFORM` 的变种，该变量可能为空，例如 `v7`。
- **BUILDPLATFORM**: 构建镜像主机平台，例如 `linux/amd64`。
- **BUILDOS**: `BUILDPLATFORM` 的 OS 类型，例如 `linux`。
- **BUILDARCH**: `BUILDPLATFORM` 的架构类型，例如 `amd64`。
- **BUILDVARIANT**: `BUILDPLATFORM` 的变种，该变量可能为空，例如 `v7`。

代码中判断架构举例。

```dockerfile

FROM alpine:3.20

# 需要先声明 ARG 才可使用， 但不需要主动赋值，docker 会自动赋值
ARG TARGETARCH

RUN <<EOF
set -e

if [ "${TARGETARCH}" = "amd64" ]; then
  echo "this is amd64"
elif [ "${TARGETARCH}" = "arm64" ]; then
  echo "this is arm64"
fi

EOF

```

在 FROM 中强制切换架构，使用特定平台的基础镜像。

```dockerfile
# 使用特定平台的基础镜像
FROM --platform=linux/amd64 ubuntu:20.04
FROM --platform=$TARGETPLATFORM ubuntu:20.04

# 在这里添加你的指令
RUN apt-get update && apt-get install -y curl
```

## 辅助工具

### hadolint

[hadolint](https://github.com/hadolint/hadolint) 是一个 Dockerfile 语法检测工具，根据最近实践检测语法给出修改方式。

可以用命令行执行，可以 Docker 镜像执行，也可以使用 [Online 在线分析](https://hadolint.github.io/hadolin)。

### skopeo

[skopeo](https://github.com/containers/skopeo) 是一个镜像搬运工具。

不需要运行守护进程，用于对容器镜像与容器仓库执行管理操作的命令行工具，支持 OCI 镜像与 Docker V2 镜像。

主要用于跨仓库之间镜像复制，镜像仓库与本地文件同步。

看一下他的 help 就知道什么意思了。

```console
$ skopeo --help
Various operations with container images and container image registries

Usage:
  skopeo [flags]
  skopeo [command]

Available Commands:
  copy                                          Copy an IMAGE-NAME from one location to another
  delete                                        Delete image IMAGE-NAME
  inspect                                       查看一个镜像的 manifest 或者 image config 详细信息
  list-tags                                     List tags in the transport/repository specified by the SOURCE-IMAGE
  login                                         Login to a container registry
  manifest-digest                               计算文件的清单摘要是一个 sha256sum 值
  standalone-sign                               使用本地文件创建签名
  standalone-verify                             验证本地文件的签名
  sync                                          将一个或多个图像从一个位置同步到另一个位置，非常实用

# 查询支持支持的传输格式，举例
$ skopeo copy --help

Supported transports:
containers-storage, dir, docker, docker-archive, docker-daemon, oci, oci-archive, ostree, sif, tarball

Usage:
skopeo copy [command options] SOURCE-IMAGE DESTINATION-IMAGE

Examples:
skopeo copy docker://quay.io/skopeo/stable:latest docker://registry.example.com/skopeo:latest

```

日常使用可留作 shell 脚本，快速复制镜像。

```bash
# 指定自建的 harbor 地址
expport PRIVATE_HARBOR=custom.harbor.local
skopeo login ${PRIVATE_HARBOR}
# 指定 --multi-arch=all，复制多架构镜像
skopeo copy --multi-arch=all docker://ghcr.io/graalvm/jdk-community:23.0.1 docker://${PRIVATE_HARBOR}/ghcr.io/graalvm/jdk-community:23.0.1

```
