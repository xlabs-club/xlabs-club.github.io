---
title: "使用 Pulumi 部署 cert-manager 创建 K8S 自签名证书并信任证书"
description: "使用 Pulumi 部署 cert-manager 创建 K8S 自签名证书，为应用自动签发 HTTPS 证书，并信任证书"
summary: ""
date: 2024-04-29T21:49:22+08:00
lastmod: 2024-04-29T21:49:22+08:00
draft: false
weight: 50
categories: []
tags: [k8s, pulumi]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: ""
  description: ""
  canonical: ""
  noindex: false
---

在搭建本地 Kubernetus 集群后，由于环境在内网，做不了域名验证，无法使用 Let's Encrypt 颁发和自动更新证书，然而很多应用要求必须启用 HTTPS，只能用自签名 CA 证书，并由此 CA 继续颁发其他证书。

所以我们准备了以下工具，开始搭建。

- [Pulumi](https://www.pulumi.com/): 当前非常流行的 IaC 工具，值得一试。
- [cert-manager](https://cert-manager.io/): 云原生证书管理，用于自动管理和颁发各种发行来源的 TLS 证书。它将确保证书有效并定期更新，并尝试在到期前的适当时间更新证书。

核心步骤和相关代码如下，更多源码请参考我们的 GitHub 项目 [xlabs-ops](https://github.com/xlabs-club/xlabs-ops)。

使用 Pulumi 安装 cert-manager，生成自签名 CA 证书，根据自签名 CA 证书生成 cert-manager ClusterIssuer，都在如下代码了。

```ts
import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";

// 部署 cert-manager Helm chart
const certManagerRelease = new kubernetes.helm.v3.Release("cert-manager", {
  name: "cert-manager",
  chart: "cert-manager",
  version: "1.14.5",
  namespace: "cert-manager",
  createNamespace: true,
  timeout: 600,
  repositoryOpts: {
    repo: "https://charts.jetstack.io"
  },
  values: {
    installCRDs: true
  }
});

// 生成一个 CA private key
const caPrivateKey = new tls.PrivateKey("caPrivateKey", {
  algorithm: "RSA"
});

// 生成一个 自签名 CA 证书
const caCert = new tls.SelfSignedCert("caCert", {
  // keyAlgorithm: "RSA",
  privateKeyPem: caPrivateKey.privateKeyPem,
  isCaCertificate: true,
  validityPeriodHours: 87600, // 10 year
  allowedUses: ["cert_signing", "crl_signing"],
  subject: {
    commonName: "your.domain.com",
    organization: "Xlabs Club"
  }
});

// 生成一个带有 CA crt 和 key 的 Kubernetes Secret
const caSecret = new kubernetes.core.v1.Secret("caSecret", {
  metadata: {
    name: "selfsigned-cert-manager-ca",
    namespace: "cert-manager"
  },
  type: "Opaque",
  stringData: {
    "tls.crt": caCert.certPem,
    "tls.key": caPrivateKey.privateKeyPem
  }
});

// 创建一个自签名的 ClusterIssuer 给 ingress 用
const clusterIssuer = new kubernetes.apiextensions.CustomResource(
  "selfsigned-issuer",
  {
    apiVersion: "cert-manager.io/v1",
    kind: "ClusterIssuer",
    metadata: {
      name: "selfsigned-issuer",
      // 注意 ClusterIssuer 和 caSecret 放在同一个 namespace，不写 namespace 时 ClusterIssuer 找不到 caSecret
      namespace: "cert-manager"
    },
    spec: {
      ca: {
        secretName: caSecret.metadata.name
      }
    }
  },
  { dependsOn: certManagerRelease }
);

export const certManagerVersion = certManagerRelease.version;
export const clusterIssuerName = clusterIssuer.metadata.name;

// Export CA 证书，便于客户端导入信任证书
export const caCertificatePem = caCert.certPem;
```

以上执行 `pulumi up` 后，我们就得到了一个自签名的 CA 证书、一个可用于为 ingress 自动签发 TLS 的 ClusterIssuer。

在 K8S ingress 上，增加以下 annotations 即可自动生成 TLS 证书，注意名字 selfsigned-issuer 与上面创建的名字保持一致。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    cert-manager.io/cluster-issuer: selfsigned-issuer
```

另外提供一个小插曲，实际上 cert-manager 的 ClusterIssuer 不需要指定 namespace，但是在创建的时候发现不写 namespace，caSecret 创建在 `default` namespace 后，ClusterIssuer 找不到 caSecret，所以为他们两个都特别指定了 namespace。

## 让 Edge/Chrome 信任自签名证书

以上生成的自签名证书在浏览器访问时，会有红色提示不安全，被禁止访问，所以需要将我们的 CA 证书导入本机并选择信任。

```bash
# 导出上面步骤生产的 CA 证书
pulumi stack output caCertificatePem --show-secrets > ca.crt.pem
```

Mac 用户，通过以下命令行，或打开 Keychain Access 应用程序手动导入并在 info trust 中选择 always trust。

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca.crt.pem
```

对于 Ubuntu 用户，可通过以下命令导入。某些 Ubuntu Desktop 增加信任证书后，Edge 仍然提示证书无效，在 Edge 地址栏输入 `edge://settings/privacy/manageCertificates` 重新导入了一次就解决了。

```bash

mv ca.crt.pem ca.crt
sudo apt-get install -y ca-certificates
sudo cp ca.crt /usr/local/share/ca-certificates/my-local-ca.crt
sudo update-ca-certificates
```

Windows 用户，双击 ca.crt 安装证书到“受信任的根证书颁发机构”。
