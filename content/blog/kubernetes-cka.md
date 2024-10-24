---
title: "备考 CKA 过程，CKA 真题分享"
description: "备考 CKA 过程，CKA 真题分享"
summary: ""
date: 2022-02-26T23:42:48+08:00
lastmod: 2022-02-26T23:42:48+08:00
draft: false
weight: 50
categories: []
tags: []
contributors: []
pinned: false
homepage: false
seo:
  title: ""
  description: ""
  canonical: ""
  noindex: false
---

备考 CKA （Certified Kubernetes Administrator）过程，心得，遇见问题，CKA 真题。

一句话总结：按照教程多练习，把控好时间就能通过，期望通过刷题通过考试的年代已经过去了，而且多练习对平时工作真的有用。

## 备考环境

备考使用的系统和软件版本如下。

- Ubuntu：20.04 Focal Fossa
- Kubernetes：1.20.7
- kubeadm：1.20.7

## 安装和使用问题记录

### kubeadm 安装问题

安装 kubeadm，国内安装使用阿里镜像源。

```console
$ cat /etc/apt/sources.list.d/kubernetes.list
deb https://mirrors.aliyun.com/kubernetes/apt kubernetes-xenial main
```

踩坑：因为使用的是 ubuntu 20.04，代号 `focal`，专门去各个代理镜像源找`kubernetes-focal`都没有找到，后来发现 google 官方根本没发布对应的版本，只有`kubernetes-xenial`， k8s 官方文档里 ubuntu 也是用的这一个版本。可以用，就用他吧。

kubeadm init 时指定使用阿里镜像源（解决国内连不上 k8s.gcr.io 的问题）、指定版本号（安装考试对应的版本，不一定是最新版本）。
通过指定`--image-repository`，不需要手动下载镜像重新打 tag，kubeadm 自动使用指定的 repository。

```sh
kubeadm init --image-repository=registry.aliyuncs.com/google_containers \
  --pod-network-cidr=10.244.0.0/16 \
  --kubernetes-version=v1.20.7
```

### 解决 scheduler Unhealthy，controller-manager Unhealthy

第一次安装完成后通过 `kubectl get cs`命令，发现 scheduler Unhealthy，controller-manager Unhealthy。

```console
$ kubectl get cs
NAME                 STATUS      MESSAGE
scheduler            Unhealthy   Get "http://127.0.0.1:10251/healthz": dial tcp 127.0.0.1:10
controller-manager   Unhealthy   Get "http://127.0.0.1:10252/healthz": dial tcp 127.0.0.1:10
```

查看本机端口，10251 和 10252 都没有启动。

确认 schedule 和 controller-manager 组件配置是否禁用了非安全端口。

查看配置文件，路径分别为：`/etc/kubernetes/manifests/kube-scheduler.yaml` 和 `/etc/kubernetes/manifests/kube-controller-manager.yaml`
将两个配置文件中 `--port=0` 注释掉（注释掉是否合适待商量）。

```yaml
spec:
  containers:
    - command:
        - kube-scheduler
        - --authentication-kubeconfig=/etc/kubernetes/scheduler.conf
        - --authorization-kubeconfig=/etc/kubernetes/scheduler.conf
        - --bind-address=127.0.0.1
        # 注释掉 port，其他行原样不要动
        - --port=0
```

### 解决 master 无法调度

我的环境是单节点，既当 master 又当 worker，kubeadm 安装完成后默认 master 节点是不参与调度的，pod 会一直 pending。

kubectl describe node 发现 node 的 Taints 里有 `node-role.kubernetes.io/master:NoSchedule`。

设置 k8s master 节点参与 POD 调度。

```sh
kubectl taint nodes your-node-name node-role.kubernetes.io/master-
```

## 考试心得

- 刷新浏览器会导致考试被终止。
- 提前演练敲一遍，时间其实挺紧张。
- 官方`kubectl Cheat Sheet`章节非常有用，必考。
- 命令自动补全 source <(kubectl completion bash)。
- 尽量使用命令创建 Pod、deployment、service。

  ```console
  kubectl run podname --image=imagename --restart=Never -n namespace
  kubectl run <deploymentname> --image=<imagename> -n <namespace>
  kubectl expose <deploymentname> --port=<portNo.> --name=<svcname>
  ```

- 使用 dry-run。

  ```console
  kubectl run <podname> --image=<imagename> --restart=Never --dry-run -o yaml > title.yaml
  ```

- 使用 kubectl -h 查看各个命令的帮助，很多都在 Examples 里。比如 `kubectl expose -h`。

## CKA 真题练习

真题会过时，别指望着刷刷题就通过考试，老老实实学一遍。

1. 将所有 pv 按照 name/capacity 排序。

   ```console
    # sort by name
    kubectl get pv --sort-by=.metadata.name
    # sort by capacity
    kubectl get pv --sort-by=.spec.capacity.storage
   ```

2. deployment 扩容。

   ```console
    kubectl scale deployment test --replicas=3
   ```

3. Set the node named ek8s-node-1 as unavaliable and reschedule all the pods running on it.

   ```console
    kubectl cordon ek8s-node-1
    # drain node 的时候可能出错，根据错误提示加参数
    kubectl drain ek8s-node-1 --delete-local-data --ignore-daemonsets --force
   ```

4. Form the pod label name-cpu-loader,find pods running high CPU workloads and write the name of the pod consuming most CPU to the file `/opt/KUTR00401/KURT00401.txt`(which alredy exists).

   ```console
    # 注意题目中并没有提 namespace，可以先看下这个 label 的 pod 在哪个 namespace，确定命令中要不要加 namespace
    kubectl top pods -l name=name-cpu-loader --sort-by=cpu
    echo '排名第一的 pod 名称' >>/opt/KUTR00401/KUTR00401.txt
   ```
