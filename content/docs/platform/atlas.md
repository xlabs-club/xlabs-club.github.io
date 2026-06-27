---
title: "Atlas：现代化的数据库 Schema 管理工具"
description: "Atlas 是一个用于管理数据库 Schema 的现代化工具，支持声明式迁移、版本控制和 CI/CD 集成。"
summary: ""
date: 2024-02-24T10:51:27+08:00
lastmod: 2024-02-24T10:51:27+08:00
draft: false
menu:
  docs:
    parent: ""
    identifier: "atlas-b11de3bf80c154c442dae386b57a92b0"
weight: 999
toc: true
seo:
  title: "Atlas：现代化的数据库 Schema 管理工具"
  description: "Atlas 是一个用于管理数据库 Schema 的现代化工具，支持声明式迁移、版本控制和 CI/CD 集成。"
  canonical: ""
  noindex: false
---

[Atlas](https://atlasgo.io/) 是 Ariga 公司开源的数据库 Schema 管理工具，支持声明式地管理数据库结构，类似 Terraform 管理基础设施的思路。它解决了传统迁移工具（如 Flyway、Liquibase）中手动编写 SQL 迁移脚本的痛点。

## 核心能力

- **声明式 Schema 管理**：定义期望的数据库状态，Atlas 自动计算并执行差异化的 DDL。
- **版本化迁移**：自动生成版本化的 SQL 迁移文件，兼容 Flyway/Liquibase 的工作流。
- **CI/CD 集成**：在 CI 中自动检测 Schema 变更、生成迁移脚本，并可作为 PR Comment 展示。
- **多数据库支持**：MySQL、PostgreSQL、SQLite、MariaDB、SQL Server、TiDB 等。

## 安装

```bash
# macOS
brew install ariga/tap/atlas

# Linux
curl -sSf https://atlasgo.sh | sh

# Docker
docker run --rm arigaio/atlas --help
```

## 基本用法

### 声明式迁移

直接告诉 Atlas 你想要什么样的 Schema，它会计算出到达该状态需要的 DDL：

```bash
# 将 MySQL 数据库的当前 Schema 与目标 HCL 文件对比
atlas schema apply \
  --url "mysql://root:pass@localhost:3306/mydb" \
  --to file://schema.hcl \
  --dev-url "docker://mysql/8/mydb"
```

Atlas 会输出计划执行的 DDL 并等待确认，然后执行。

`schema.hcl` 示例：

```hcl
table "users" {
  schema = schema.mydb
  column "id" {
    type = int
    auto_increment = true
  }
  column "name" {
    type = varchar(255)
  }
  column "email" {
    type = varchar(255)
    unique = true
  }
  primary_key {
    columns = [column.id]
  }
}
```

### 检查已有 Schema

```bash
# 将现有数据库的 Schema 导出为 HCL 文件
atlas schema inspect \
  --url "mysql://root:pass@localhost:3306/mydb" \
  --format '{{ sql . "  " }}' > schema.sql
```

### 版本化迁移

与 Flyway/Liquibase 兼容的版本化迁移工作流：

```bash
# 基于 HCL 文件生成版本化迁移 SQL
atlas migrate diff v1.0.0 \
  --to file://schema.hcl \
  --dev-url "docker://mysql/8/dev" \
  --dir "file://migrations"

# 目录结构
# migrations/
# ├── 20240101000000_v1.0.0.sql   ← 生成的迁移脚本
# └── atlas.sum                    ← 校验和文件
```

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: Schema Check
on: [pull_request]
jobs:
  atlas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ariga/atlas-action@v1
        with:
          working-directory: db
          dir: file://migrations
          dev-url: docker://mysql/8/dev
```

当 PR 中修改了 Schema 定义文件但未更新迁移脚本时，Atlas Action 会自动在 PR 中评论展示缺失的 DDL：

```
## Migration Check
The migration directory is not in sync with the desired state.
The following SQL statements are needed:

```sql
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';
```
```

## 与 Flyway / Liquibase 的对比

| 维度 | Flyway | Liquibase | Atlas |
|---|---|---|---|
| 迁移定义 | 手写 SQL | XML/YAML/JSON/SQL | 声明式 HCL（自动生成 SQL） |
| 差异计算 | 不计算，纯版本对比 | 不计算 | 自动计算所需 DDL |
| CI 集成 | 无 Schema 变更检查 | 内置 diff 功能 | 原生 CI Action |
| 学习成本 | 低（只需会 SQL） | 中（需学变更集语法） | 中（需学 HCL Schema 语法） |
| 运行方式 | 应用启动时自动迁移 | 应用启动时 / CLI | 推荐 CLI + CI |

Atlas 不是要完全取代 Flyway/Liquibase。如果你的团队已经习惯手写迁移脚本且流程稳定，继续使用现有方案没问题。Atlas 更适合希望将 Schema 管理"声明式化"和集成到 CI 中的团队。

## 最佳实践

1. **将 Schema HCL 文件提交到 Git**：作为 Schema 的 Single Source of Truth。
2. **CI 中执行 Schema 检查**：确保 PR 中 Schema 变更与迁移脚本同步。
3. **使用 dev-url 指定临时数据库**：Atlas 需要一个临时数据库来计算差异和验证 SQL，生产环境可以使用 Docker 容器作为临时数据库。
4. **审查自动生成的迁移脚本**：虽然 Atlas 生成的 DDL 在逻辑上是正确的，但在生产执行前仍需人工审查（索引命名、LOCK 策略等）。
