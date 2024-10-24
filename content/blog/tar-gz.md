---
title: "文件压缩解压缩快速参考"
description: "文件压缩解压缩快速参考"
summary: ""
date: 2024-03-10T15:22:20+08:00
lastmod: 2024-03-10T15:22:20+08:00
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

文件压缩解压缩快速参考。

## 常用文件格式

.tar：tar 其实打包（或翻译为归档）文件，本身并没有压缩。在 Linux 里 man tar 可以看到它的描述也是“manipulate tape archives”（tar 最初被用来在磁带上创建档案，现在，用户可以在任何设备上创建档案，只是它的描述还没有改）。

.gz：gzip 是 GNU 组织开发的一个压缩程序，.gz 结尾的文件就是 gzip 压缩的结果。

.bz2：bzip2 是一个压缩能力更强的压缩程序，.bz2 结尾的文件就是 bzip2 压缩的结果。

.Z：compress 也是一个压缩程序。.Z 结尾的文件就是 compress 压缩的结果。

.zip：使用 zip 软件压缩的文件。

.tar.gz、.tar.bz2、.tar.xz 等可以理解为打包+压缩的效果，用软件解压可以发现比。gz 多了一层包。gzip 和 bzip2，不能同时压缩多个文件，tar 相当于开个挂加上同时压缩的特效，tar 先归档为一个大文件，而归档为大文件的速度是很快的，测试了一下几乎可以忽略不计。

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
```
