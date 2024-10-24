---
title: "Git SSH 客户端同一机器多用户多仓库配置"
description: "Git SSH 客户端在同一机器上为不同目录配置不同的用户"
summary: ""
date: 2024-02-26T22:55:10+08:00
lastmod: 2024-02-26T22:55:10+08:00
draft: false
weight: 50
categories: []
tags: [Tools]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "Git SSH 客户端同一机器多用户多仓库配置"
  description: "Git SSH 客户端在同一机器上为不同目录配置不同的用户"
  canonical: ""
  noindex: false
---

Git 为不同目录配置不同的 config，比如在同一个电脑上区分个人开发账号和公司开发账号，开源项目放一个文件夹，公司项目放一个文件夹，这样在提交代码的时候就不会混乱。

为账户 B 准备一个单独的配置文件，比如： ~/.gitconfig-b，内容根据需要定义。

```txt
[user]
  name = userb-name
  email = userb-email@test.com
```

修改 ~/.gitconfig 文件，增加以下配置，引用上面创建的配置文件，注意其中的路径用绝对路径，并且路径以 / 结尾。

```txt
[includeIf "gitdir:/project/path-b/"]
path = /Users/xxxx/.gitconfig-b
```

保存后，在 /project/path-b/ 下新的仓库都会以 .gitconfig-b 中的用户名和邮箱提交了。

注意如果使用 ssh key 方式，在生成 key 的时候 ssh-keygen 名字指定文件名，多个 key 不要覆盖了。
