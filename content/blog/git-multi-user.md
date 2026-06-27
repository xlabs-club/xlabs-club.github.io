---
title: "Git SSH 客户端同一机器多用户多仓库配置"
description: "Git SSH 客户端在同一机器上为不同目录配置不同的用户，实现个人账号和公司账号分离管理"
summary: ""
date: 2024-02-26T22:55:10+08:00
lastmod: 2025-12-18T22:56:18+08:00
draft: false
weight: 50
categories: [Tools]
tags: [Tools, Git, SSH, 多用户配置]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "Git SSH 多用户配置：同一机器多账号多仓库管理方案"
  description: "Git SSH 客户端在同一机器上为不同目录配置不同的用户，实现个人账号和公司账号分离管理"
  canonical: ""
  noindex: false
---

Git 为不同目录配置不同的 config，比如在同一个电脑上区分个人开发账号和公司开发账号，开源项目放一个文件夹，公司项目放一个文件夹，这样在提交代码的时候就不会混乱。

## 目录级 Git 身份配置

为账户 B 准备一个单独的配置文件，比如： `~/.gitconfig-b`，内容根据需要定义。

```txt
[user]
  name = userb-name
  email = userb-email@test.com
```

修改 `~/.gitconfig` 文件，增加以下配置，引用上面创建的配置文件，注意其中的路径用绝对路径，并且路径以 `/` 结尾。

```txt
[includeIf "gitdir:/project/path-b/"]
path = /Users/xxxx/.gitconfig-b
```

保存后，在 `/project/path-b/` 下新的仓库都会以 `.gitconfig-b` 中的用户名和邮箱提交了。

`includeIf` 支持多种匹配条件，可根据实际情况选择：

```txt
# 按目录路径匹配（最常用）
[includeIf "gitdir:/path/to/work/"]
    path = ~/.gitconfig-work

# 按 Git 工作树路径匹配（以 / 结尾表示目录，不以 / 结尾视为模式）
[includeIf "gitdir/i:~/work/"]
    path = ~/.gitconfig-work

# 按远程 URL 匹配（onbranch 从 Git 2.23 开始支持）
[includeIf "hasconfig:remote.*.url:git@github.com:company/**"]
    path = ~/.gitconfig-company
```

条件中的 `i` 前缀表示大小写不敏感。

## SSH Key 管理

多账号场景下，需要为每个账号生成独立的 SSH Key，并在 SSH 配置中按 Host 区分。

**生成 Key（注意不要覆盖已有 Key）：**

```bash
# 个人 GitHub 账号
ssh-keygen -t ed25519 -C "personal@example.com" -f ~/.ssh/id_ed25519_personal

# 公司账号
ssh-keygen -t ed25519 -C "work@company.com" -f ~/.ssh/id_ed25519_work
```

**配置 `~/.ssh/config`：**

```txt
# 个人 GitHub
Host github.com-personal
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_personal
    IdentitiesOnly yes

# 公司 GitHub / 自建 GitLab
Host github.com-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_work
    IdentitiesOnly yes

Host gitlab.company.com
    HostName gitlab.company.com
    User git
    IdentityFile ~/.ssh/id_ed25519_work
    IdentitiesOnly yes
```

`IdentitiesOnly yes` 确保只使用指定的 Key，避免 ssh-agent 中其他 Key 干扰。

**使用方式**——克隆仓库时，将 Host 名替换为 SSH Config 中定义的别名：

```bash
# 使用个人 Key 克隆
git clone git@github.com-personal:username/personal-repo.git

# 使用工作 Key 克隆
git clone git@github.com-work:company/company-repo.git
```

对于已有仓库，修改 remote URL：

```bash
git remote set-url origin git@github.com-personal:username/repo.git
```

**验证 Key 是否生效：**

```bash
ssh -T git@github.com-personal
# 输出: Hi personal-user! You've successfully authenticated...

ssh -T git@github.com-work
# 输出: Hi work-user! You've successfully authenticated...
```

## GPG 签名按目录配置

如果仓库要求 commit 签名，可以在 per-directory 的 gitconfig 中配置 GPG Key：

```txt
# ~/.gitconfig-work
[user]
    name = work-user
    email = work@company.com
    signingkey = YOUR_GPG_KEY_ID_FOR_WORK

[commit]
    gpgsign = true

[gpg]
    program = gpg
```

查看可用 GPG Key：

```bash
gpg --list-secret-keys --keyid-format LONG
```

## 完整示例：个人 + 公司的 Git 配置结构

```
~/
├── .gitconfig              # 全局默认配置（个人）
├── .gitconfig-work         # 工作专用配置
├── .ssh/
│   ├── config              # SSH 多 Host 配置
│   ├── id_ed25519_personal # 个人私钥
│   ├── id_ed25519_personal.pub
│   ├── id_ed25519_work     # 工作私钥
│   └── id_ed25519_work.pub
├── projects/
│   ├── personal/           # 个人项目 → 使用 .gitconfig 默认
│   └── work/               # 工作项目 → includeIf 引用 .gitconfig-work
```

`~/.gitconfig` 核心片段：

```txt
[user]
    name = personal-user
    email = personal@example.com

[includeIf "gitdir:~/projects/work/"]
    path = ~/.gitconfig-work
```

**事后检查提交身份：**

```bash
# 查看最近提交的作者信息
git log --pretty="%h %an <%ae>" -5

# 查看某个目录下所有仓库的配置
cd ~/projects/work/repo && git config user.email
```

## 常见问题

**Q: `git commit` 后仍然使用了错误的 user.email？**

A: 确认 `includeIf` 路径以 `/` 结尾，使用绝对路径，且仓库确实在该路径下。可在仓库内执行 `git config --show-origin user.email` 查看该配置来自哪个文件。

**Q: SSH 连接提示 `Permission denied (publickey)`？**

A: 检查 `~/.ssh/config` 中 `IdentitiesOnly yes` 是否设置，并用 `ssh -vT git@github.com-personal` 观察使用的 Key 路径是否正确。

**Q: 如何将已有仓库的 remote URL 从默认 Host 改为自定义 Host？**

A: `git remote set-url origin $(git remote get-url origin | sed 's/github.com/github.com-work/')`
