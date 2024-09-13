---
title: "Mac 搭建本地 K8S 开发环境方案选型"
description: "Mac 搭建本地 K8S 开发环境，基于 K3D、multipass、lima 等不同方案介绍对比"
summary: ""
date: 2024-04-13T15:20:43+08:00
lastmod: 2024-04-16T22:20:43+08:00
draft: false
weight: 50
categories: [k8s]
tags: [k8s]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "Mac 搭建本地 K8S 开发环境方案选型"
  description: "Mac 搭建本地 K8S 开发环境方案选型，基于 k3d、multipass、lima 等不同方案介绍对比"
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

因为工作经常需要用到 K8S，而且有时因网络原因不能完全依赖公司网络，或者因为测试新功能不能直接发布到公司集群，所以就有了本地搭建 K8S 的需求。

另外如果你有以下需求，此文档中提到的方案也许有所帮助：

- 开发机器模拟 Arm、AMD64 等不同架构。
- 完全隔离的不同环境，比如为测试 docker、podman、buildkit、containd 等不同软件设置的独立环境。
- CI/CD 流程中即用即消的轻量级虚拟机替代方案。
- 有限的资源模拟大批量的 K8S 节点。

以下介绍一下我用过的几种不同方案，有些纯属个人观点仅供参考。

1. Docker Desktop 并启用 Kubernetes 功能。

   优点：最简单，开箱即用。

   缺点：只支持单节点 K8S，且 K8S 部分功能不支持，不易定制。

2. Docker run K3D, K3D run K3S。

   优点：简单，任何支持 docker 的工具（Rancher Desktop、Podman） 启动一个容器即可。

   缺点：只支持 K3S。

3. [multipass][] 启动虚拟机，然后安装 K8S、K3S 或 minikube。

   优点：multipass 可启动空白 ubuntu 虚拟机，或者启动已经安装好 minikube 的虚拟机。

   缺点：只支持 ubuntu，虚拟机与宿主机同架构。

4. [lima][] 启动虚拟机，然后安装 K8S、K3S 或 minikube。

   优点：支持虚拟多种 Linux，支持异构虚拟机。

   缺点：架构稍复杂，启动略慢，不如 multipass 稳定，不支持运行在 Windows。

以上方案，在网络畅通的情况下，均能在 10 分钟内启动一个单节点 K8S，所以整体方案都不复杂。

如何选择：

- 如果你需要在公司使用，并且不想买商业 License 的话，可直接排除 Docker Desktop。

- 如果你需要对 K8S 集群有些把控，有较多定制，可排除 K3D。

- 如果你的开发机器是 Windows，可排除 lima，目前还不支持运行在 Windows 上。

在过去的很多年，我一直使用 multipass 虚拟出 ubuntu 虚拟机，有了虚拟机就想干啥干啥了，自己按需安装 K8S 或 K3S，相对比较稳定，使用也很方便，这是我最喜欢的方案。

直到我换了 MacBook Arm 架构，经常需要联调或测试一些 amd64 的功能，为方便异构编译和测试，不得不寻找一种新的解决方案，就换到了 lima。

lima 支持 ARM on Intel、Intel on ARM 异构虚拟机，异构机器整体性能上有所损失，基本能满足日常开发联调使用。

## multipass 快速安装 K3S

multipass 是 Ubuntu 背后的厂商 Canonical 推出的一款虚拟化工具，可运行在 Windows、Mac、Linux 上，在本地快速启动 Ubuntu 虚拟机。

在启动前使用 `multipass find` 看下有哪些可用镜像。

```console
$ multipass find
Image                       Aliases           Version          Description
20.04                       focal             20240408         Ubuntu 20.04 LTS
22.04                       jammy,lts         20240319         Ubuntu 22.04 LTS
23.10                       mantic            20240410         Ubuntu 23.10

Blueprint                   Aliases           Version          Description
anbox-cloud-appliance                         latest           Anbox Cloud Appliance
docker                                        0.4              A Docker environment with Portainer and related tools
minikube                                      latest           minikube is local Kubernetes
```

使用 multipass 启动一个 ubuntu 虚拟机，然后安装 k3s，安装完成后把 k3s 的 kube config 文件拷贝到本机，以便能执行 helm 和 kubectl 命令。

```bash

# 启动一个新虚拟机，名字叫 k3s，使用 ubuntu 22.04 镜像
multipass launch --name k3s --cpus 8 --memory 16G --disk 256G 22.04

# 查看虚拟机信息
multipass info k3s
# 进入虚拟机
multipass shell k3s

# Install or upgrade k3s as master
curl -sfL https://rancher-mirror.rancher.cn/k3s/k3s-install.sh | INSTALL_K3S_MIRROR=cn K3S_KUBECONFIG_MODE=600 INSTALL_K3S_CHANNEL=latest sh -

# copy /etc/rancher/k3s/k3s.yaml as your kube config file

```

## lima 快速入门

Linux Machines (Lima) 也是一个虚拟化工具，目前是 CNCF sandbox 工程，大厂背书颇有前景。

lima 版本还在不断迭代，具体使用请参考官方文档，以下是入门常用命令。

```bash

# 查看模板列表
limactl start --list-templates

# 使用 Ubuntu 模版启动一个默认虚拟机，此时需要下载镜像模板文件，镜像比较大耐心等待
limactl start --name=default --cpus=2 --memory=4 --disk=32 template://ubuntu
# 在 MacBook Arm 上指定使用 --arch=x86_64 架构
limactl create --name=agent --arch=x86_64 --cpus=2 --memory=4 --disk=32 template://ubuntu

# 直接启动 k8s 模板
limactl start --name=k8s --cpus=2 --memory=4 --disk=32 template://k8s
# 导出可用的 KUBECONFIG
export KUBECONFIG=$(limactl list k8s --format 'unix://{{.Dir}}/copied-from-guest/kubeconfig.yaml')

# 查看当前虚拟机列表
limactl list
# 启停虚拟机，agent 是上面创建出来的虚拟机名字
limactl start agent
limactl stop agent
# 进入虚拟机 shell 环境
limactl shell agent

```

[multipass]: https://multipass.run/
[lima]: https://lima-vm.io/
