---
title: "文件压缩解压缩快速参考"
description: "文件压缩解压缩速查，汇总 tar、gz、bz2、zip 等常见格式的打包、解包与常用命令示例。"
summary: ""
date: 2024-03-10T15:22:20+08:00
lastmod: 2025-12-18T22:58:27+08:00
draft: false
weight: 50
categories: [Tools]
tags: [Tools, 文件压缩, tar, gzip]
contributors: []
pinned: false
homepage: false
seo:
  title: "文件压缩解压缩快速参考：tar、gz、bz2、zip 命令大全"
  description: "文件压缩解压缩速查，汇总 tar、gz、bz2、zip 等常见格式的打包、解包与常用命令示例。"
  canonical: ""
  noindex: false
---

文件压缩解压缩快速参考。

## 常用文件格式

.tar：tar 其实打包（或翻译为归档）文件，本身并没有压缩。在 Linux 里 man tar 可以看到它的描述也是"manipulate tape archives"（tar 最初被用来在磁带上创建档案，现在，用户可以在任何设备上创建档案，只是它的描述还没有改）。

.gz：gzip 是 GNU 组织开发的一个压缩程序，.gz 结尾的文件就是 gzip 压缩的结果。

.bz2：bzip2 是一个压缩能力更强的压缩程序，.bz2 结尾的文件就是 bzip2 压缩的结果。

.Z：compress 也是一个压缩程序。.Z 结尾的文件就是 compress 压缩的结果。

.zip：使用 zip 软件压缩的文件。

.xz：使用 LZMA2 算法，压缩率高于 bzip2，但压缩速度慢。xz 是 tar 的现代默认 `-J` 支持格式。

.zst：Zstandard（zstd），由 Facebook 开发，压缩率和 gzip 相当但速度远超 gzip，尤其解压速度极快。正在成为新的行业标准。

.tar.gz、.tar.bz2、.tar.xz 等可以理解为打包+压缩的效果，用软件解压可以发现比 .gz 多了一层包。gzip 和 bzip2 不能同时压缩多个文件，tar 相当于开个挂加上同时压缩的特效，tar 先归档为一个大文件，而归档为大文件的速度是很快的。

除了这些格式外，常见的 deb、exe、msi、rpm、dmg、iso 等安装软件，其实都是经过压缩的，一般情况下没有必要再压缩。而 rar 基本认为是 Windows 平台专属的压缩算法了，各个 Linux 发行版都不自带 rar 压缩解压缩软件，所以可以看到很多软件发行的格式都是 .tar.gz 或 .zip。

## 解压缩

根据文件名后缀自行选择解压缩命令。

```shell
tar -xf test.tar
gzip -d test.gz
gunzip test.gz
# -C 直接解压到指定目录
tar -xzf test.tar.gz -C /home
bzip2 -d test.bz2
bunzip2 test.bz2
tar -xjf test.tar.bz2
tar -xvJf test.tar.xz
# .tar.zst 需要 zstd 命令
tar --zstd -xf test.tar.zst
# .zip
unzip test.zip
# .7z（需安装 p7zip）
7z x test.7z
```

## tar 常用参数速查

| 参数 | 含义 |
|---|---|
| `-x` | 解包（extract） |
| `-c` | 打包（create） |
| `-z` | 通过 gzip 过滤 |
| `-j` | 通过 bzip2 过滤 |
| `-J` | 通过 xz 过滤 |
| `--zstd` | 通过 zstd 过滤 |
| `-v` | 显示详细过程 |
| `-f` | 指定文件名（必须放最后） |
| `-C` | 指定解压目标目录 |
| `-t` | 测试归档文件完整性，不解压 |
| `--exclude` | 打包时排除特定文件/目录 |
| `--strip-components` | 解压时剥离路径前 N 层 |

实用示例：

```shell
# 仅查看压缩包内容，不解压
tar -tzf test.tar.gz

# 解压 tar.gz 并剥离第一层目录
tar -xzf project-v1.0.tar.gz --strip-components=1 -C /opt/app

# 打包时排除 node_modules 和 .git
tar -czf project.tar.gz --exclude=node_modules --exclude=.git project/

# 保留文件权限和所有者（需 root）
tar -czpf backup.tar.gz /data

# 解压单个文件
tar -xzf archive.tar.gz path/to/specific/file.txt
```

## 压缩

请根据需要选择压缩算法。

```shell
# 将当前目录下所有 jpg 格式的文件打包为 pictures.tar
tar -cf pictures.tar *.jpg
# 将 Picture 目录下所有文件打包并用 gzip 压缩为 pictures.tar.gz
tar -czf pictures.tar.gz Picture/
# 将 Picture 目录下所有文件打包并用 bzip2 压缩为 pictures.tar.bz2
tar -cjf pictures.tar.bz2 Picture/
# 使用 xz 压缩（更高压缩率）
tar -cJf pictures.tar.xz Picture/
# 使用 zstd 压缩（更快速度）
tar --zstd -cf pictures.tar.zst Picture/
```

## 各算法对比与选型

| 格式 | 压缩率 | 压缩速度 | 解压速度 | 适用场景 |
|---|---|---|---|---|
| gzip | 中 | 快 | 快 | 通用场景，兼容性最好 |
| bzip2 | 较高 | 慢 | 慢 | 存储空间优先，对时间不敏感 |
| xz | 最高 | 最慢 | 中 | 长期归档、发布包 |
| zstd | 中-高 | 最快 | 最快 | 追求速度，现代系统首选 |
| zip | 中 | 快 | 快 | 跨平台分发，Windows 用户友好 |

**选型建议：**
- CI/CD 中压缩构建产物：`zstd`（速度最快）或 `gzip`（兼容性）
- 发布开源软件包：`.tar.gz`（最通用）
- 长期归档备份：`.tar.xz`（体积最小）
- 给 Windows 用户：`.zip`

## 压缩级别调优

gzip 支持 1-9 压缩级别（1 最快，9 最小）：

```bash
# 快速压缩，适合 CI/CD 场景
GZIP=-1 tar -czf fast.tar.gz data/

# 高压缩，适合归档发布
GZIP=-9 tar -czf small.tar.gz data/

# 使用环境变量指定压缩级别
export GZIP=-6  # 默认值，平衡速度和大小
```

xz 同样支持压缩级别：

```bash
# xz 默认 -6，-0 最快，-9 最慢但最小
XZ_OPT=-0 tar -cJf fast.tar.xz data/
XZ_OPT=-9 tar -cJf smallest.tar.xz data/
```

对于 zstd，可直接用命令行参数：

```bash
tar -c --zstd -f output.tar.zst data/ \
  -I 'zstd -3'  # -1 到 -19，-3 是默认
```

## 并行压缩

大文件压缩时，单线程压缩可能成为瓶颈。`pigz`（并行 gzip）和 `pixz`（并行 xz）可利用多核：

```bash
# pigz：并行 gzip，自动使用所有 CPU 核
tar -c data/ | pigz -p 4 > data.tar.gz

# 解开 pigz 压缩的文件
pigz -d -p 4 data.tar.gz

# 或使用 tar 的 -I 参数指定压缩程序
tar -I 'pigz -p 4' -cf data.tar.gz data/
tar -I 'pigz -p 4' -xf data.tar.gz
```

## 管道压缩——边打包边传输

不需要落盘中间文件，直接压缩传输：

```bash
# 本地打包压缩，远程解压
tar -czf - /local/data | ssh user@remote "tar -xzf - -C /remote/path"

# 远程目录直接拉取到本地
ssh user@remote "tar -czf - /remote/data" | tar -xzf - -C /local/path

# 配合 pv 显示进度
tar -czf - /large/data | pv | ssh user@remote "tar -xzf - -C /remote/path"

# 复制目录结构（保留权限、符号链接等）
cd /source && tar -cf - . | (cd /dest && tar -xpf -)
```

## 分卷压缩

需要将大文件分割为多个小文件时（如邮件附件、FAT32 文件系统限制）：

```bash
# 分卷压缩，每卷 100M
tar -czf - large_dir/ | split -b 100M - large_dir.tar.gz.

# 合并解压
cat large_dir.tar.gz.* | tar -xzf -
```

## 带密码的 zip

```bash
# 带密码压缩
zip -e -r secured.zip confidential_dir/

# 或使用 7z（AES-256 加密，更安全）
7z a -p -mhe=on secured.7z confidential_dir/
```
