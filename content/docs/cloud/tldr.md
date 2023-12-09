---
title: "TL;DR"
description: ""
summary: ""
date: 2023-12-07T16:04:48+02:00
lastmod: 2023-12-07T16:04:48+02:00
draft: false
images: []
weight: 15
toc: true
---

常用 Kubernetes 命令，复制，粘贴，这就是生活。

---

- 复制 secret 到另一个 namespace。

```sh
kubectl get secret mys --namespace=na -oyaml | grep -v '^\s*namespace:\s' | kubectl apply --namespace=nb -f -
```

- 批量删除 pod。

```sh
kubectl get pods --all-namespaces | grep Evicted | awk '{print $2 " --namespace=" $1}' | xargs kubectl delete pod
# Delete by label
kubectl delete pod -n idaas-book -l app.kubernetes.io/name=idaas-book
```

- 密钥解密。

```sh
 kubectl get secret my-creds -n mysql -o jsonpath="{.data.ADMIN_PASSWORD}" | base64 --decode
```

- 合并多个 kube config 文件。

```sh
export KUBECONFIG=~/.kube/config:~/.kube/anotherconfig
kubectl config view --flatten > ~/.kube/config-all

cp ~/.kube/config-all ~/.kube/config
# 顺手把权限改了，避免 helm 或 kubectl 客户端 warning
chmod 600 ~/.kube/config

```

- 获取某个 namespace 下的全部资源，找出你看不见的资源，常用于 CR/CRD 清理。

```sh

ns=your-namespace

for resource in `kubectl api-resources --verbs=list --namespaced -o name | xargs -n 1 kubectl get -o name -n $ns`; do 
    kubectl get $resource  -n $ns;
    # kubectl patch $resource -p '{"metadata": {"finalizers": []}}' --type='merge' -n $ns;
done

```

- 根据特定字段排序 Pod 列表。

```sh
# 根据重启次数排序
kubectl get pods --sort-by='.status.containerStatuses[0].restartCount' -A
```

- 命令行快速扩缩容。

```sh
# kubectl scale -h
kubectl scale --replicas=1 deploy/xxx -n yns
```