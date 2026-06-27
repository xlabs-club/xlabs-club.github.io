---
title: "MySQL 大文件导入优化，提高速度，提升性能"
description: "MySQL 大文件导入优化方案，提高导入速度，提升性能，包含 load data infile 语法和参数调优实战经验"
summary: ""
date: 2024-03-10T15:18:22+08:00
lastmod: 2025-12-18T22:38:24+08:00
draft: false
weight: 50
categories: [MySQL]
tags: [MySQL, 数据库优化, 性能优化]
contributors: []
pinned: false
homepage: false
seo:
  title: "MySQL 大文件导入优化：load data infile 与参数调优实战"
  description: "MySQL 大文件导入优化方案，提高导入速度，提升性能，包含 load data infile 语法和参数调优实战经验"
  canonical: ""
  noindex: false
---

项目中需要根据 SQL 文件导入数据，文件大约 20G，正常导入约需要 2 小时，如何提高导入速度。

## 方案一：Session 参数调优

如果一个 SQL 文件包含了很多表，`mysql load data infile` 就不支持了，可考虑在导入过程中设置如下参数，经过测试 20G 大约需要 40 分钟，比之前快了很多。

```bash
# 进入 mysql
mysql -u root -p

# 创建数据库（如果已经有数据库忽略此步骤）
CREATE DATABASE 数据库名；

# 设置参数
set sql_log_bin=OFF;//关闭日志
set autocommit=0;//关闭 autocommit 自动提交模式 0 是关闭  1 是开启（默认）
set global max_allowed_packet = 20 *1024* 1024 * 1024;

# 使用数据库
use 数据库名；

# 开启事务
START TRANSACTION;

# 导入 SQL 文件并 COMMIT（因为导入比较耗时，导入和 COMMIT 一行命令，这样不用盯着屏幕等提交了）
source /xxx.sql；COMMIT;
```

各参数作用详解：

| 参数 | 默认值 | 作用 | 影响 |
|---|---|---|---|
| `sql_log_bin` | ON | 关闭 Binlog 写入 | 减少磁盘 IO，导入内容不会写入 Binlog（注意对从库复制的影响） |
| `autocommit` | ON (1) | 关闭自动提交 | 将每条 INSERT 包装在一个大事务中，减少 fsync 次数，性能提升最明显 |
| `max_allowed_packet` | 64M | 增大单次通信包大小 | 允许一次性传输更大的 SQL 语句块，减少客户端-服务端往返 |

额外可调整的 Session 参数：

```sql
-- 关闭唯一键检查（确保数据本身无冲突）
SET unique_checks = 0;

-- 关闭外键检查
SET foreign_key_checks = 0;

-- 降低 InnoDB 日志刷新频率（重启后恢复默认）
SET GLOBAL innodb_flush_log_at_trx_commit = 0;

-- 关闭 doublewrite buffer（仅导入期间，有风险）
-- 仅在 MySQL 8.0.20+ 支持临时关闭
```

导入完成后务必恢复：

```sql
SET unique_checks = 1;
SET foreign_key_checks = 1;
SET GLOBAL innodb_flush_log_at_trx_commit = 1;
```

## 方案二：LOAD DATA INFILE（单表场景）

如果 SQL 文件是单表数据，`LOAD DATA INFILE` 比 `source` 快一个数量级。先将 SQL 导出为 CSV/TSV 格式，再用 LOAD DATA 导入：

```sql
LOAD DATA INFILE '/data/users.csv'
INTO TABLE users
FIELDS TERMINATED BY ',' 
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(id, name, email, created_at);
```

对应的导出命令（将已有 SQL 转为 CSV）：

```bash
mysql -u root -p -D dbname -B -e "SELECT * FROM users" > users.csv
```

`mysqlimport` 是 `LOAD DATA INFILE` 的命令行等价：

```bash
mysqlimport -u root -p \
  --fields-terminated-by=',' \
  --lines-terminated-by='\n' \
  --local \
  dbname /data/users.csv
```

## 方案三：并行导入

如果 SQL 文件包含多个独立表，可将文件按表拆分为多个 `.sql` 文件，并行执行 `source`：

```bash
# 按表拆分（简单场景，按 "CREATE TABLE" 或 "INSERT INTO" 分割）
csplit -f table_ large_dump.sql "/^CREATE TABLE/" "{*}"

# 并行导入
for f in table_*.sql; do
  mysql -u root -p -D dbname -e "source $f" &
done
wait
```

注意事项：
- 表之间有外键依赖时，需按依赖顺序导入，或先关闭 `foreign_key_checks`
- 并行数不要超过 CPU 核数和磁盘 IOPS 上限
- 每个连接需要独立设置 `autocommit=0`

## 方案四：使用 Pipe Viewer 监控进度

导入大文件时无法看到进度非常痛苦，使用 `pv` 配合 `mysql` 可以获得实时速度和 ETA：

```bash
# 安装 pv
# macOS: brew install pv
# Ubuntu: apt-get install pv

pv large_dump.sql | mysql -u root -p dbname
```

输出示例：

```
3.25GiB 0:12:30 [4.21MiB/s] [========================>           ] 65% ETA 0:06:52
```

## 各方案对比

| 方案 | 适用场景 | 预估速度（20G） | 复杂度 |
|---|---|---|---|
| Session 参数调优 | 通用，SQL 文件含多表 | ~40 分钟 | 低 |
| LOAD DATA INFILE | 单表纯数据 | ~5-10 分钟 | 中 |
| 并行导入 | 多表无依赖 | ~15-20 分钟 | 中 |
| 参数调优 + LOAD DATA | 数据量极大，单表 | 最快 | 中 |

## InnoDB 层面额外优化

如果服务端可重启，提前调大 `innodb_buffer_pool_size`（建议物理内存的 60%-80%）和 `innodb_log_file_size`，可显著加速写入：

```sql
-- 查看当前值
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';

-- 调大 Buffer Pool（需要重启 MySQL）
-- my.cnf:
-- innodb_buffer_pool_size = 16G
-- innodb_log_file_size = 2G
```

`innodb_autoinc_lock_mode=2` 在大量 INSERT 时减少自增锁竞争，但会改变自增值的分配语义——仅在确认业务兼容时设置。
