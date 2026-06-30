---
title: "K8S StatefulSet 应用 PV/PVC 平滑扩容"
description: "K8S StatefulSet 应用 PV/PVC 平滑扩容方案，包含 Helm 部署场景下的扩容步骤和常见问题解决"
summary: "K8S StatefulSet 应用 PV/PVC 平滑扩容方案，包含 Helm 部署场景下的扩容步骤和常见问题解决"
date: 2024-03-31T21:29:52+08:00
lastmod: 2025-12-18T22:41:46+08:00
draft: false
weight: 50
categories: [K8S]
tags: [k8s, StatefulSet, PV, PVC, 扩容]
contributors: []
pinned: false
homepage: false
seo:
  title: "K8S StatefulSet 应用 PV/PVC 平滑扩容实战指南"
  description: "K8S StatefulSet 应用 PV/PVC 平滑扩容方案，包含 Helm 部署场景下的扩容步骤和常见问题解决"
  canonical: ""
  noindex: false
---

在 K8S 中使用 Helm 部署了一些有状态应用，并通过 Helm 自动生成了 PV 和 PVC，某天想扩容，竟然报错了。

以下以 bitnami zookeeper 为例，其他 StatefulSet 同理。

为了实现磁盘扩容，改大 `persistence.size`，比如由 8Gi 改为 10Gi，然后执行 helm upgrade，出现错误。

```console
Error: UPGRADE FAILED: cannot patch "zookeeper" with kind StatefulSet: StatefulSet.apps "zookeeper" is invalid: spec: Forbidden: updates to statefulset spec for fields other than 'replicas', 'template', 'updateStrategy', 'persistentVolumeClaimRetentionPolicy' and 'minReadySeconds' are forbidden
```

实际上我们想更新的是 StatefulSet 的 spec.volumeClaimTemplates 中的 storage 大小，根据提示信息，StatefulSet 竟然不允许。

```yaml
spec:
  volumeClaimTemplates:
    - apiVersion: v1
      spec:
        resources:
          requests:
            storage: 8Gi
```

查看 K8S 官方说明，果然当前版本 (1.29) 还不支持，参考链接如下。

- KEP-0661: StatefulSet volume resize kubernetes/enhancements#3412 <https://github.com/kubernetes/enhancements/pull/3412>
- Support Volume Expansion Through StatefulSets kubernetes/enhancements#661 <https://github.com/kubernetes/enhancements/issues/661>

注意此时 helm release 的状态是 failed，先把 `persistence.size` 改为原大小，然后再执行一遍 helm upgrade，先把 release 恢复正常。

那么如何实现 StatefulSet 磁盘平滑扩容，issues/661 提供了解决方案。

## 扩容流程

### 前置检查

1. **确认 StorageClass 支持扩容：**

   ```bash
   kubectl get sc <storage-class-name> -o jsonpath='{.allowVolumeExpansion}'
   # 应返回 true
   ```

2. **确认 PVC 当前大小：**

   ```bash
   kubectl get pvc -l app=your-app
   ```

3. **确认 PV 后端存储有足够物理空间**（尤其 Ceph、Longhorn 等需要关注集群存储池使用率）。

4. **备份关键数据**——虽然扩容操作不涉及数据销毁，但 StatefulSet 的删/建操作存在误操作风险：

   ```bash
   kubectl exec <pod> -- sh -c "cd /data && tar czf /tmp/backup.tar.gz ."
   kubectl cp <pod>:/tmp/backup.tar.gz ./backup.tar.gz
   ```

### 执行扩容

1. 确保你用的 StorageClass 支持扩容，比如 NFS、rancher/local-path-provisioner 都是不支持扩容的。

2. 删除 StatefulSet，但是保留 Pod，让服务继续运行。删除时增加 `--cascade=orphan` 参数：

   ```bash
   kubectl delete statefulset --cascade=orphan zookeeper
   ```

   `--cascade=orphan` 的作用是仅删除 StatefulSet 资源本身，保留其管理的 Pod。这样服务不会中断。

3. 修改 Helm 中声明的 size，继续执行 helm upgrade 更新应用，此时通过 kubectl 可以看到 PV/PVC 大小已经变更，StatefulSet 已经重建，但是 Pod 无任何变化。

4. 重建 Pod，使更新生效：

   ```bash
   kubectl rollout restart statefulset zookeeper
   ```

### 扩容后验证

```bash
# 确认 PVC 大小已更新
kubectl get pvc -l app=your-app

# 确认 Pod 内文件系统已扩容
kubectl exec <pod> -- df -h /data
```

## 文件系统自动扩容

PVC 扩容后，底层 PV 的块设备大小更新了，但文件系统未必自动扩展。结果：`df -h` 看到的还是旧大小。

**确认是否需要手动扩容文件系统：**

```bash
# 在 Pod 内
df -h /data       # 文件系统可见大小
lsblk             # 查看块设备实际大小（如果容器内可用）
```

如果块设备已扩容但文件系统未扩展，取决于 StorageClass 的 CSI Driver 是否支持 `ExpandCSIVolumes` 的在线扩容（K8S 1.16+）。大多数现代 CSI Driver（如 AWS EBS、GCE PD、Ceph RBD）支持自动扩容。

若为旧版或某些 CSI Driver 不支持自动扩容，需手动执行（以 ext4 为例）：

```bash
# 文件系统在线扩容（ext4 支持在线 extend）
kubectl exec <pod> -- resize2fs /dev/<device>

# XFS 文件系统
kubectl exec <pod> -- xfs_growfs /data
```

## Helm Release 状态恢复

扩容过程中如果 helm upgrade 执行到一半失败，release 会处于 `failed` 或 `pending-upgrade` 状态。

```bash
# 回滚到上一个成功的版本
helm rollback <release-name>

# 查看 release 历史
helm history <release-name>

# 如果 rollback 也失败，查看 Secret（Helm 3 用 Secret 存储 release 信息）
kubectl get secrets -l owner=helm,name=<release-name>
```

推荐操作顺序：先 rollback，确认 release 正常后再重新按上述流程扩容。

## rancher/local-path-provisioner

rancher/local-path-provisioner 是 Rancher 提供的一个本地存储卷插件，它主要用于在 Kubernetes 集群中动态创建和管理本地存储卷，让本地存储使用起来更简单。

有些应用使用了此 local-path 作为存储，但是在更新完 size 后，发现 PV 大小已经变更，PVC 大小仍然是旧值，比如以下 PVC 声明的是 10Gi，但是 status 仍然是 8Gi。

```yaml
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: PersistentVolumeClaim
    spec:
      resources:
        requests:
          storage: 10Gi
      storageClassName: local-path
    status:
      capacity:
        storage: 8Gi
      phase: Bound
```

通过 `kubectl describe pvc` 发现 Events 中有以下 warning。

```console
# Warning  ExternalExpanding  8h   volume_expand    Ignoring the PVC: didn't find a plugin capable of expanding the volume; waiting for an external controller to process this PVC.
```

然而我们的 local-path-provisioner 已经声明了 `allowVolumeExpansion: true`，通过以下命令查看值也是对的，为啥不行呢，因为当前版本（我使用的是 v0.0.26） 就是不支持。

```console
$ kubectl get sc
NAME         PROVISIONER                            RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
local-path   cluster.local/local-path-provisioner   Retain          WaitForFirstConsumer   true                   2d
```

使用 local-path-provisioner 注意事项：

1. local-path-provisioner 使用 hostPath 映射，不支持磁盘扩容，扩容后会出现以上 Warning。
2. 不管是 K8S hostPath、Local volumes 还是 local-path-provisioner，都不支持限制磁盘大小，映射到主机的 hostPath 磁盘有多大，Pod 就能用多大。PV/PVC 声明的大小都只是声明并不起作用，所以也不用给 PV/PVC 尝试做扩容。
3. 目前常用的 NFS 存储和 local-path-provisioner 一样，也不支持扩容和限制磁盘大小。

## 各 StorageClass 扩容支持速查

| Storage Provisioner | 扩容支持 | 在线扩容 | 备注 |
|---|---|---|---|
| AWS EBS CSI | 支持 | 支持 | 已广泛验证 |
| GCE PD CSI | 支持 | 支持 | 已广泛验证 |
| Azure Disk CSI | 支持 | 支持 | 需特定版本 |
| Ceph RBD CSI | 支持 | 支持 | 视 Ceph 版本 |
| Longhorn | 支持 | 支持 | v1.1.0+ |
| NFS (nfs-subdir-external-provisioner) | 不支持 | - | NFS 本身无容量限制 |
| local-path-provisioner | 不支持 | - | hostPath 无容量限制 |
| hostPath (手动) | 不支持 | - | 静态 PV，无法动态扩容 |

对于不支持扩容的存储，提前规划好 PVC 大小，避免后期被动迁移数据。
