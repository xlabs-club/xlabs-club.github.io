---
title: "MySQL 大文件导入优化，提高速度，提升性能"
description: "MySQL 大文件导入优化，提高速度，提升性能"
summary: ""
date: 2024-03-10T15:18:22+08:00
lastmod: 2024-03-10T15:18:22+08:00
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

项目中需要根据 SQL 文件导入数据，文件大约 20G，正常导入约需要 2 小时，如何提高导入速度。

经过实验测试，如果一个 SQL 文件只有一个表的数据，可以直接使用 mysql load data infile 语法，速度比较快。

我们是一个 SQL 文件包含了很多表，mysql load data infile 就不支持了，可考虑在导入过程中设置如下参数，经过测试 20G 大约需要 40 分钟，比之前快了很多。

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
