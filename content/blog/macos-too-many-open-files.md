---
title: "MacOS 持久化配置，彻底解决 too many open files in system 的问题"
description: "MacOS 持久化配置，彻底解决 too many open files in system 的问题，包含 launchctl limit 配置和系统级限制调整方法"
summary: ""
date: 2024-03-19T23:05:07+08:00
lastmod: 2025-12-18T22:46:38+08:00
draft: false
weight: 50
categories: [Tools]
tags: [Tools, MacOS, 系统配置]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "MacOS 彻底解决 too many open files 问题：持久化配置指南"
  description: "MacOS 持久化配置，彻底解决 too many open files in system 的问题，包含 launchctl limit 配置和系统级限制调整方法"
  canonical: ""
  noindex: false
---

作为一个开发者，经常在 MacOS 遇到 Too many open files in system 的报错，尤其是碰到黑洞 node_modules 时，如何持久化配置彻底解决，直接上代码。

## 诊断步骤

先确认当前限制值，以及哪个进程消耗了大量文件描述符。

### 查看当前限制

```bash
# 系统级软硬限制
launchctl limit maxfiles

# 当前 Shell 的限制
ulimit -n

# 内核级限制
sysctl kern.maxfiles
sysctl kern.maxfilesperproc
```

输出示例（已调整后）：

```console
$ launchctl limit maxfiles
    maxfiles    10240         102400

$ sysctl kern.maxfiles
kern.maxfiles: 102400

$ sysctl kern.maxfilesperproc
kern.maxfilesperproc: 81920
```

这三个值是不同层面的限制，需要协调调整：
- `launchctl limit maxfiles`（软/硬）— 每个进程的文件描述符限制，相当于 Linux 的 `nofile`
- `kern.maxfiles` — 系统全局文件描述符上限
- `kern.maxfilesperproc` — 内核层面每进程文件描述符上限

### 找出文件描述符消耗大户

```bash
# 列出所有进程的文件描述符数量（前 10）
lsof -n 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10

# 查看特定进程的打开文件数
lsof -p <PID> | wc -l

# 查看特定进程的限制和使用量
launchctl limit pid <PID>
# 或
cat /proc/<PID>/limits  # Linux; macOS 无此文件
```

常见消耗大户：Node.js（node_modules 大量文件）、Java 应用、IDE（WebStorm、VS Code）、Docker。

## 持久化配置

创建文件 `sudo vi /Library/LaunchDaemons/limit.maxfiles.plist`，内容如下，可根据自己爱好改后面的两个数字值。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
        "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>limit.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
      <string>launchctl</string>
      <string>limit</string>
      <string>maxfiles</string>
      <string>10240</string>
      <string>102400</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>ServiceIPC</key>
    <false/>
  </dict>
</plist>
```

验证文件格式和内容，并应用生效。

```console
plutil /Library/LaunchDaemons/limit.maxfiles.plist
sudo launchctl load -w /Library/LaunchDaemons/limit.maxfiles.plist
```

再次输入 `launchctl limit maxfiles` 查看是否生效。

注意：plist 中的两个数字分别是「软限制」和「硬限制」。软限制是实际生效的限制，硬限制是软限制能够调高的上限。进程可自行将软限制调至硬限制。（实际上大多数用户都直接以 root 启动，这两者的区别不大。）

## kernel 层面的调整

部分场景下仅调整 `launchctl limit` 不够，还需调整内核参数。macOS 没有 `/etc/sysctl.conf`，需要通过启动参数或 `sysctl` 临时设置：

```bash
# 临时生效（重启后失效）
sudo sysctl -w kern.maxfiles=102400
sudo sysctl -w kern.maxfilesperproc=81920
```

持久化 kernel 参数需要创建 `/Library/LaunchDaemons/sysctl.maxfiles.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
        "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>sysctl.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/sbin/sysctl</string>
      <string>-w</string>
      <string>kern.maxfiles=102400</string>
      <string>kern.maxfilesperproc=81920</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>
```

```bash
sudo launchctl load -w /Library/LaunchDaemons/sysctl.maxfiles.plist
```

## 各 Shell 级别的 ulimit 配置

Shell 初始化时也可能覆盖限制。在 `~/.zshrc` 或 `~/.bashrc` 中添加：

```bash
ulimit -n 10240
```

## 针对特定工具的额外配置

- **Docker Desktop**: Preferences → Resources → Advanced → 调整资源限制
- **VS Code**: 在 `settings.json` 中 `"files.watcherExclude"` 排除 `**/node_modules/**`，减少文件监控数
- **WebStorm**: Preferences → Appearance & Behavior → System Settings → 勾选 "Use 'safe write'"

## 问题排查清单

1. `launchctl limit maxfiles` 确认进程级软/硬限制
2. `sysctl kern.maxfiles kern.maxfilesperproc` 确认内核级限制
3. `ulimit -n` 确认当前 Shell 限制
4. `lsof -p <PID> | wc -l` 定位具体进程的文件描述符使用量
5. 如果是 GUI 应用，注意 `launchctl limit` 对 GUI 应用可能不生效——GUI 应用由 `launchd` 用户域管理，需在 `~/Library/LaunchAgents/` 下单独配置
