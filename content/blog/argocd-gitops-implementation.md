---
title: "ArgoCD GitOps 实施方案与架构设计"
description: "面向技术评审和平台落地的 ArgoCD GitOps 精简方案，聚焦架构选型、实施顺序、权限边界、迁移路径与应急策略。"
summary: "面向技术评审和平台落地的 ArgoCD GitOps 精简方案，聚焦架构选型、实施顺序、权限边界、迁移路径与应急策略"
date: 2026-07-09T12:00:00+08:00
lastmod: 2026-07-09T12:00:00+08:00
draft: false
weight: 49
categories: [K8S, DevOps]
tags: [k8s, GitOps, ArgoCD, CI/CD, 落地方案]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "ArgoCD GitOps 实施方案与架构设计"
  description: "面向技术评审和平台落地的 ArgoCD GitOps 精简方案，聚焦架构选型、实施顺序、权限边界、迁移路径与应急策略。"
  canonical: ""
  noindex: false
---

这篇文档不是 ArgoCD 全量手册，而是一份给技术评审和平台实施使用的**可实施方案**。目标只有三个：

- 说清楚为什么要做 GitOps
- 说清楚方案边界和关键设计决策
- 说清楚团队怎么分阶段落地，而不是把问题留给实施阶段

不在本文展开的内容包括：Argo Rollouts、Argo Events、Kargo、SOPS 完整教程、灾备演练细节、超大规模性能调优。这些能力可以在主方案稳定后再单独建设。

## 一、背景与目标

传统 Push 式部署把 `kubectl apply`、`helm upgrade` 放在 CI 里执行，短期能跑，长期有三个问题：

1. **安全边界不对**
CI 必须持有集群写权限，CI 被攻破时，生产集群也会一起暴露。

2. **状态不可持续校验**
流水线执行结束后就退出，后续的手工改动、配置漂移、误操作不会被持续发现。

3. **发布状态不集中**
部署记录散落在 CI 日志、集群状态、聊天记录里，审计链不完整。

GitOps 的目标不是换一个部署工具，而是把部署改成：

- Git 保存期望状态
- ArgoCD 在集群内持续拉取和协调
- 集群状态偏离 Git 时自动发现并回归

本文的落地目标如下：

| 目标 | 落地要求 |
|---|---|
| 安全收口 | CI 不再持有生产集群写权限 |
| 可审计 | 生产变更必须通过 Git PR 合并触发 |
| 可回滚 | 生产版本可回退到明确的 tag 或 commit |
| 可推广 | 新应用可按统一模板接入 GitOps |
| 可运维 | 有明确的权限边界、应急流程和验收口径 |

## 二、方案边界与核心决策

### 2.1 本方案覆盖范围

本文覆盖以下内容：

- ArgoCD 作为 GitOps CD 控制面
- 多环境发布模型
- 仓库结构和版本推进方式
- Secret 管理选型
- 权限、策略、回滚和应急边界
- 存量应用迁移路径

本文不覆盖以下内容：

- 灰度发布平台能力建设
- 复杂事件编排
- 多租户平台计费
- 超大规模上千集群调优

### 2.2 核心选型

| 主题 | 选择 | 原因 |
|---|---|---|
| GitOps 控制器 | **ArgoCD** | UI 成熟，ApplicationSet、RBAC、Project 隔离能力完整 |
| 部署模式 | **Pull** | 集群内拉取 Git 变更，CI 不接触集群写权限 |
| 管理拓扑 | **管控集群集中部署 ArgoCD** | 便于统一治理、审计和权限收口 |
| 仓库模式 | **源码仓库 + 部署仓库分离** | 应用开发和环境配置解耦 |
| 环境差异管理 | **Kustomize Overlay** | 结构清晰，适合多环境 patch |
| Secret 标准方案 | **ESO + 云 Secret Manager** | Git 不存敏感值，轮转和审计更容易 |
| 生产发版方式 | **PR 合并更新 tag/commit** | 审计链清晰，可回滚 |

### 2.3 为什么选 ArgoCD

这里只讲决策，不做长篇工具评测。

- 需要 Web UI 给研发、测试、运维统一查看发布状态
- 需要 `AppProject` 做仓库、集群、namespace 的边界控制
- 需要 `ApplicationSet` 做批量生成和多集群分发
- 需要比较成熟的企业落地经验

如果团队只追求极简控制面、没有 UI 诉求，也可以评估 Flux；但本文默认企业平台侧更需要集中可视化和权限治理，因此选择 ArgoCD。

## 三、目标架构

推荐采用**单独管控集群**承载 ArgoCD，统一管理多个业务集群。

```text
开发提交代码
    │
    ▼
CI 构建镜像、测试、扫描
    │
    ▼
CI 修改部署仓库中的镜像 tag / commit
    │
    ▼
Git 部署仓库（唯一事实源）
    │
    ▼
ArgoCD 从管控集群拉取并渲染清单
    │
    ├─ 同步到 dev 集群
    ├─ 同步到 staging 集群
    └─ 同步到 prod 集群
```

设计原则：

- ArgoCD 部署在独立管控集群，不与业务生产集群混布
- CI 只负责构建和改 Git，不直接部署
- 每个团队通过 `AppProject` 收口权限
- 生产环境只接受固定 tag 或 commit，不跟随分支漂移

## 四、落地前置条件

这是原始方案里最容易被忽略、但最影响开工判断的部分。没有这些前置条件，方案再完整也无法真正落地。

### 4.1 平台前提

| 类别 | 最低要求 |
|---|---|
| Kubernetes | 至少准备 1 个管控集群和 1 套业务环境 |
| Ingress / DNS / TLS | 能为 ArgoCD UI、Webhook 暴露稳定域名和证书 |
| Git 平台 | 支持 PR、分支保护、审计日志、机器人账号 |
| 镜像仓库 | 支持按环境拉取镜像，最好具备漏洞扫描 |
| 身份系统 | 能提供 OIDC / SSO，例如 Keycloak、GitLab、企业 IdP |
| Secret 后端 | AWS Secrets Manager、GCP Secret Manager、Azure Key Vault 或 Vault |
| 监控告警 | Prometheus + Alertmanager 或同类系统 |
| 对象存储 | 用于后续备份或审计留存，建议预留 |

### 4.2 组织前提

- 明确平台团队作为 ArgoCD 平台所有者
- 明确应用团队负责自身 YAML/Helm/Kustomize 内容
- 明确安全团队参与权限和 Secret 方案评审
- 明确生产变更审批规则由 Git PR 承载，而不是口头确认

### 4.3 版本基线

为了避免“文档能看、环境跑不起来”，建议在评审阶段就固定一套版本基线。

| 组件 | 建议基线 | 说明 |
|---|---|---|
| Kubernetes | 1.29+ | 低于该版本时先做兼容性验证 |
| ArgoCD | 2.12.x 或团队已验证版本 | 不建议文档里只写 `stable` |
| ApplicationSet | 随 ArgoCD 同版本能力验证 | 确认 Matrix、Cluster Generator 可用 |
| External Secrets Operator | 0.14.x 或团队已验证版本 | 以官方 CRD 为准 |
| Kyverno / Gatekeeper | 二选一 | 本方案示例按 Kyverno 表达 |

评审输出必须包含一句话：**上线版本以 PoC 验证矩阵为准，不接受“先装 stable 再看”**。

### 4.4 PoC 输出物

在正式推广前，建议先用 1 个管控集群和 1-2 个非核心应用完成 PoC。PoC 不是“能跑起来”就结束，至少要产出以下结果：

| 输出物 | 说明 |
|---|---|
| 版本兼容矩阵 | Kubernetes、ArgoCD、ESO、策略引擎的可用组合 |
| 最小模板仓库 | 至少包含一个业务应用模板和一个基础设施模板 |
| 发布与回滚演示记录 | 包含一次正常发布和一次回滚的截图或操作记录 |
| 权限模型说明 | 平台管理员、应用维护者、只读用户的权限映射结果 |
| 风险清单 | 当前不支持或暂缓接入的场景 |

只有这些输出物齐全，方案才算具备推广条件。

### 4.5 PoC 验证矩阵

PoC 至少验证下面这些能力项，避免评审通过后再把基础能力问题留到生产阶段：

| 类别 | 必验项 | 通过标准 |
|---|---|---|
| 基础接入 | 仓库拉取、集群注册、ApplicationSet 生成 | 首次接入不依赖手工修补 |
| 发布流程 | 构建、PR、合并、自动同步 | 一次完整链路可重复成功 |
| 回滚能力 | `git revert`、紧急 rollback | 两种路径都能恢复到预期版本 |
| 漂移治理 | 手工改副本数或镜像 tag | ArgoCD 能识别并纠正或阻断 |
| 权限模型 | SSO 登录、角色映射、Project 隔离 | 越权访问被明确拦截 |
| Secret 方案 | Secret 引用、生效、轮转 | 应用无明文感知且轮转后可生效 |
| 多环境一致性 | dev/staging/prod 差异受控 | 差异只来自 overlay，不来自手工改动 |

PoC 退出条件：

- 任一能力项无法稳定复现
- 需要平台团队长期手工介入才能跑通
- 无法证明回滚和漂移治理有效

## 五、核心资源与规范

这一节只保留真正会影响落地一致性的资源定义。

### 5.1 Application

`Application` 定义“从哪里取、部署到哪里、按什么策略同步”。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-prod
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: team-payment-prod
  source:
    repoURL: https://git.example.com/platform/apps.git
    targetRevision: v1.2.3
    path: workloads/myapp/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp-prod
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
```

生产规范：

- `metadata.name` 统一用 `<app>-<env>`
- 生产 `targetRevision` 必须是固定 tag 或 commit
- `prune: true` 默认开启，避免僵尸资源
- 生产默认 `selfHeal: true`，禁止长期手工漂移

### 5.2 AppProject

`AppProject` 是治理边界，不是可选项。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: team-payment-prod
  namespace: argocd
spec:
  sourceRepos:
    - https://git.example.com/platform/apps.git
  destinations:
    - namespace: payment-*
      server: https://kubernetes.default.svc
  clusterResourceWhitelist:
    - group: ""
      kind: Namespace
```

规范：

- 每个团队至少一个 `AppProject`
- 生产和非生产建议拆分不同 Project
- `sourceRepos`、`destinations` 一律白名单收口
- 锁死默认 `default` Project，禁止继续当公共垃圾桶

### 5.3 ApplicationSet

`ApplicationSet` 用于批量生成，而不是手工复制 Application。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: workloads-prod
  namespace: argocd
spec:
  generators:
    - matrix:
        generators:
          - git:
              repoURL: https://git.example.com/platform/apps.git
              revision: main
              directories:
                - path: workloads/*
          - clusters:
              selector:
                matchLabels:
                  env: prod
  template:
    metadata:
      name: "{{index .path.segments 1}}-{{.name}}"
    spec:
      project: shared-prod
      source:
        repoURL: https://git.example.com/platform/apps.git
        targetRevision: main
        path: "{{.path.path}}"
      destination:
        server: "{{.server}}"
        namespace: "{{index .path.segments 1}}"
```

适用场景：

- 一套基础设施分发到多个集群
- 多个业务目录批量生成 Application
- 统一通过标签选集群，而不是手写集群列表

## 六、仓库结构与发布模型

### 6.1 双仓库模式

推荐把应用源码和部署配置拆开：

```text
myapp/                         # 应用源码仓库
├── src/
├── Dockerfile
└── .gitlab-ci.yml

apps/                          # 部署仓库
├── workloads/
│   └── myapp/
│       ├── base/
│       └── overlays/
│           ├── dev/
│           ├── staging/
│           └── prod/
└── argocd/
    ├── projects/
    └── appsets/
```

好处：

- 开发和部署职责分离
- 生产变更可以单独审计
- 平台团队能统一治理目录结构和模板

### 6.2 Kustomize Overlay 规范

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
images:
  - name: registry.example.com/myapp
    newTag: v1.2.3
patches:
  - path: deployment-patch.yaml
```

约束：

- `base/` 不放环境特定值
- 每个环境只在 `overlays/<env>/` 覆盖差异
- 生产环境的镜像版本必须显式写入 Git

### 6.3 CI 到 CD 的接缝

推荐分环境处理：

| 环境 | 推荐方式 | 原因 |
|---|---|---|
| dev | 自动更新部署仓库或 Image Updater | 追求反馈速度 |
| staging | 通过 PR 合并推进 | 提前验证生产流程 |
| prod | 必须通过 PR 更新固定 tag/commit | 审计、回滚、审批最清晰 |

基线原则：

- CI 不直接执行 `kubectl`
- 生产发布动作等价于“合并一个版本变更 PR”
- 生产回滚动作等价于“revert 这个 PR 或恢复上一个 tag”

### 6.4 发布变更流程

推荐把发布动作固定成一条标准链路：

1. 应用仓库完成构建、测试、扫描并生成镜像
2. CI 或机器人账号发起部署仓库 PR
3. PR 只改本次发布所需的镜像 tag、配置差异或版本清单
4. 合并后由 ArgoCD 自动同步到目标环境
5. 发布结果通过 ArgoCD UI、通知渠道和监控共同确认

这样做的核心价值是：**生产发布被收敛成一次 Git 变更，而不是一次临时操作。**

## 七、Secret 管理选型

Secret 是 GitOps 里最容易失控的一环，所以只给明确结论，不展开冗长教程。

### 7.1 方案对比

| 方案 | Git 中是否存敏感值 | 自动轮转 | 复杂度 | 结论 |
|---|---|---|---|---|
| SOPS | 存加密密文 | 弱 | 中 | 适合轻量团队或外部依赖受限场景 |
| ESO + Secret Manager | 不存敏感值 | 强 | 中 | **标准推荐方案** |
| Vault CSI | 不存敏感值，也不落 etcd | 强 | 高 | 适合高合规场景 |

### 7.2 推荐方案

默认推荐：

- **标准场景**：ESO + 云 Secret Manager
- **高合规场景**：Vault CSI
- **受限场景**：SOPS 作为备选，而不是主线方案

原因很直接：

- Git 中只保存引用，不保存明文或业务密文
- Secret 轮转不依赖重新改 Git
- 平台、安全、应用三方职责更清晰

## 八、安全控制与权限边界

### 8.1 SSO 与 RBAC

ArgoCD 必须接入企业 SSO，禁止长期使用本地管理员账号。

最小角色模型建议：

| 角色 | 权限 |
|---|---|
| 平台管理员 | 管理集群注册、Project、RBAC、全局配置 |
| 应用维护者 | 管理自己项目下的同步、查看、回滚 |
| 只读用户 | 查看发布状态和 diff |

### 8.2 Policy as Code

策略控制放在三层：

1. Git PR Review：做代码级审查
2. AppProject：限制仓库、集群、namespace 范围
3. Kyverno / Gatekeeper：拦截高风险资源

建议最低基线：

- 禁止特权容器
- 禁止 `latest` 标签
- 限制 `NodePort`、`hostNetwork`
- 限制生产 namespace 外溢

### 8.3 紧急绕过边界

必须明确规则，否则“GitOps”最后会退化成“平时 Git，出事手改”。

建议评审时写死：

- 只有值班平台管理员和指定 SRE 有权绕过 GitOps
- 只有 P1/P2 事故允许临时 `kubectl` 止血
- 脱离 Git 的临时变更必须在 30 分钟内补回 Git
- 事故结束后必须执行一次强制 diff 校验

### 8.4 职责分工

GitOps 落地失败，常见原因不是工具，而是职责模糊。建议在实施前明确如下边界：

| 角色 | 负责内容 | 不负责内容 |
|---|---|---|
| 平台团队 | ArgoCD 平台、Project、集群纳管、模板、权限基线 | 业务配置正确性 |
| 应用团队 | Deployment、Service、环境差异、版本推进、业务回滚确认 | 全局平台治理 |
| 安全团队 | SSO、Secret、策略基线、审计要求 | 日常业务发版 |
| SRE / 值班 | 紧急止血、故障回滚、变更留痕 | 长期配置维护 |

推荐把这张表直接纳入评审结论，避免实施阶段再重新拉扯。

### 8.5 关键动作 RACI

除了角色边界，还需要把关键动作的责任人写死：

| 动作 | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| 生产版本发布 | 应用团队 | 业务负责人 | 平台团队、SRE | 安全团队 |
| `AppProject` / RBAC 变更 | 平台团队 | 平台负责人 | 安全团队、应用团队 | SRE |
| 新集群纳管 | 平台团队 | 平台负责人 | 安全团队 | 应用团队 |
| 策略豁免审批 | 安全团队 | 安全负责人 | 平台团队、应用团队 | SRE |
| 紧急绕过 GitOps | SRE / 值班平台管理员 | 值班负责人 | 应用团队 | 安全团队 |
| 绕过后补 Git 对齐 | 应用团队 | 应用负责人 | 平台团队、SRE | 安全团队 |

如果评审不愿意写到个人，至少要写到团队级别，否则上线后很容易进入“谁都能发、谁都不兜底”的状态。

## 九、首次安装顺序

这是最容易踩坑的部分。顺序不对，会直接出现 CRD 未就绪、SSO 把自己锁死、Project 锁早了没人能同步等问题。

推荐顺序：

1. 准备管控集群、域名、TLS、OIDC、镜像仓库、Secret 后端
2. 安装 ArgoCD 基础组件
3. 用本地管理员完成首次登录和最小化验证
4. 注册目标集群并打标签
5. 创建 Git 仓库接入凭据
6. 创建 `AppProject` 和最小 RBAC
7. 部署 ESO 等基础依赖
8. 部署第一批非生产 Application
9. 接入 SSO，验证角色映射
10. 锁定默认 `default` Project
11. 最后再放开团队接入和生产发布

原则：

- 先通，再收口
- 先非生产，再生产
- 先人工验证，再自动同步

### 9.1 自举验收项

完成首次安装后，不要马上宣布平台可用，至少逐项验收：

- ArgoCD UI、CLI、Webhook 都能正常访问
- 至少 1 个目标集群已注册且标签可被 ApplicationSet 识别
- 基础仓库凭据可正常拉取
- 一个示例应用能完成 Sync、Prune、Self Heal
- SSO 登录和角色映射已验证
- 默认 `default` Project 已锁定

只要其中任何一项未通过，就不应该开放给业务团队接入。

### 9.2 生产启用门槛

GitOps 平台正式承接生产前，建议至少满足以下硬门槛：

- 平台自身监控、告警、审计日志已接入
- 回滚路径已演练并留存记录
- 平台配置和关键 Secret 已具备备份方案
- 值班联系人、变更窗口、升级窗口已明确
- 生产 Project、RBAC、Policy 已完成安全评审
- 至少 1 个试点团队完成从发布到回滚的闭环演示

缺一项都不建议直接开放生产纳管。

## 十、多环境发布与迁移路径

### 10.1 环境推进规则

建议固定成一条简单路径：

```text
dev -> staging -> prod
```

对应规则：

- `dev` 可以快，允许自动推进
- `staging` 必须与生产流程一致
- `prod` 只能通过 PR 合并推进

### 10.2 存量应用迁移步骤

不要一上来全量迁移，按下面顺序推进：

| 阶段 | 范围 | 目标 |
|---|---|---|
| 试点 | 1-2 个非核心服务 | 跑通仓库结构、同步策略、回滚流程 |
| 模板化 | 补齐 Project、目录、CI 模板 | 让第二批应用可复制 |
| 推广 | 新应用默认 GitOps，老应用分批迁移 | 建立统一入口 |
| 收口 | 关闭 CI 直连集群权限 | 完成治理闭环 |

### 10.3 单应用切换步骤

一条存量应用从旧流程切到 GitOps，建议按这个顺序执行：

1. 梳理现有部署入口，确认旧 CI 中哪些步骤还在直接操作集群
2. 抽取 Kubernetes 资源到部署仓库，完成 `base` 和 `overlays`
3. 用非生产环境完成首次 ArgoCD 同步
4. 验证配置漂移、自愈、删除资源的行为是否符合预期
5. 在 staging 环境完整走一遍“构建 -> PR -> 合并 -> 自动同步”
6. 约定生产切换窗口，冻结旧 CI 的集群写权限
7. 生产第一次发布采用低风险版本，完成上线观察
8. 发布后删除旧部署脚本或至少显式下线旧入口

切换完成的标志不是“新流程能发布”，而是“旧流程已经不能再偷偷发布”。

### 10.4 状态类应用的额外要求

如果是数据库、消息中间件、强状态服务或依赖 DDL 的业务，迁移时要额外补一层控制：

- 把数据库变更和应用发布拆开管理，不要把高风险 DDL 混入普通同步
- 明确是否需要停写、双跑、灰度切流或数据比对
- 先在 staging 验证一次“版本前进 + 版本回退 + 数据一致性检查”
- 无法证明可回退的数据变更，不应纳入第一批试点

本文主线方案默认优先迁移无状态或弱状态服务，核心状态业务单独评估。

### 10.5 试点准入标准

第一批试点建议满足：

- 无复杂数据库迁移依赖
- 单服务或低耦合服务
- 已有稳定容器化镜像
- 有明确负责人愿意配合改 CI

不建议第一批纳入：

- 强依赖手工运维脚本的系统
- 大量跨环境差异的遗留系统
- 高频热修、无版本纪律的业务线

### 10.6 迁移失败回退

如果某个应用在迁移阶段失败，回退规则要提前写清楚：

- GitOps 失败但旧流程仍可用时，允许临时退回旧流程
- 回退前先撤销或冻结当前未完成的 GitOps 自动同步
- 回退后必须记录失败原因，不能直接带着同样问题重试
- 同一个应用连续两次迁移失败后，应降级优先级，先解决基础问题

### 10.7 验收口径

一个应用算“迁移完成”，至少满足：

- CI 不再持有生产集群写权限
- 生产版本能从 Git 精确定位到 tag/commit
- 能演示一次正常发布
- 能演示一次 `git revert` 回滚
- 能演示一次漂移检测或自愈

一个团队算“具备推广条件”，至少还要满足：

- 已有可复用模板，不需要平台团队逐个手工陪跑
- 生产审批和发布职责已固化到 PR 流程
- 运维、研发、值班都知道统一发布入口在哪里

## 十一、运维、回滚与应急

### 11.1 必监控项

至少监控这些指标：

- Application `OutOfSync`
- Sync 失败次数
- Health 状态异常
- Repo Server 错误率和耗时
- Controller Reconcile 延迟

### 11.2 回滚路径

生产环境只保留两条标准路径：

1. **Git revert**
适合常规回滚，审计最完整。

2. **`argocd app rollback`**
适合紧急回滚，但事后必须补 Git 对齐。

建议明确规则：**能用 Git revert 就不用控制台回滚；控制台回滚只用于止血。**

### 11.3 平台级失败回退

除了业务应用版本回退，还要提前定义平台级失败的处理边界：

| 场景 | 首选处理 |
|---|---|
| ArgoCD 自身升级失败 | 先回退 ArgoCD 版本或恢复上一个安装清单 |
| Policy 误拦截业务 | 先回退策略或加临时豁免，再补审计 |
| Secret 引用错误 | 先修正外部 Secret 或回退引用变更 |
| CRD 升级不兼容 | 停止继续同步，按变更批次回退 CRD 和依赖资源 |
| 数据库 schema 已前滚 | 不直接回滚应用，先按数据库回退方案处理 |

原则：

- 平台级事故优先恢复控制面稳定
- 数据前滚类问题不能简单等同于应用版本回退
- 任何平台级回退都必须留下操作记录和后续补偿动作

### 11.4 紧急变更 SOP

最短版本即可，不要写成操作教科书：

1. 先止血，恢复服务
2. 记录执行人、时间、影响范围
3. 30 分钟内把临时变更补回 Git
4. 执行一次手工 Sync 或 Diff 校验
5. 24 小时内完成复盘

### 11.5 运行治理

GitOps 上线后，平台团队建议建立固定治理动作，而不是“上线即结束”：

| 周期 | 动作 |
|---|---|
| 每日 | 检查 Sync 失败、OutOfSync、未处理告警 |
| 每周 | 审核新接入应用是否符合模板和权限规范 |
| 每月 | 抽查生产 Project、RBAC、Secret 访问权限 |
| 每季度 | 演练一次回滚和一次应急绕过恢复 |

如果没有这类例行治理，GitOps 平台很容易在半年后重新积累例外和手工路径。

### 11.6 长期运营机制

为了避免平台只在建设期有人管，建议同步建立以下机制：

- 告警分级和路由：区分平台告警、业务告警、策略告警
- 接入和下线流程：新应用接入、应用下线都要有统一入口
- 例外申请机制：豁免必须有期限，过期自动复核
- 季度审计机制：检查是否重新出现 CI 直连集群、手工入口或越权 Project

## 十二、评审结论

如果团队要的是一套**能审、能上、能推广**的 GitOps 方案，那么建议采用下面这条主线：

- ArgoCD 统一承载 GitOps 控制面
- 管控集群集中部署，业务集群按标签纳管
- 源码仓库与部署仓库分离
- Kustomize Overlay 作为默认环境差异方案
- ESO + Secret Manager 作为标准 Secret 方案
- 生产发布通过 PR 更新固定 tag/commit
- 权限通过 SSO、AppProject、Policy 三层收口
- 存量应用先试点，再模板化，再推广，再关停旧权限

这套方案的价值不在于“把 YAML 搬进 Git”，而在于把部署真正变成一条**可审计、可回滚、可复制、可治理**的工程链路。

如果后续需要建设灰度发布、事件编排、灾备恢复、平台级性能调优，建议以本文为主线方案，再分别拆成专题文档，不要继续把主方案写成大全。
