---
title: "MacOS 持久化配置，彻底解决 too many open files in system 的问题"
description: "MacOS 持久化配置，彻底解决 too many open files in system 的问题"
summary: ""
date: 2024-03-19T23:05:07+08:00
lastmod: 2024-04-16T23:05:07+08:00
draft: false
weight: 50
categories: []
tags: [Tools]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "MacOS 持久化配置，彻底解决 too many open files in system 的问题"
  description: "MacOS 持久化配置，彻底解决 too many open files in system 的问题"
  canonical: ""
  noindex: false
---

作为一个开发者，经常在 MacOS 遇到 Too many open files in system 的报错，尤其是碰到黑洞 node_modules 时，如何持久化配置彻底解决，直接上代码。

输入 launchctl limit 即可看到当前的限制，我这里 maxfiles 是改过以后的。

```console

$ launchctl limit
  cpu         unlimited      unlimited
  filesize    unlimited      unlimited
  data        unlimited      unlimited
  stack       8388608        67104768
  core        0              unlimited
  rss         unlimited      unlimited
  memlock     unlimited      unlimited
  maxproc     1392           2088
  maxfiles    10240         102400
```

开始创建文件 `sudo vi /Library/LaunchDaemons/limit.maxfiles.plist` ，内容如下，可根据自己爱好改后面的两个数字值。

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

再次输入 `launchctl limit` 查看是否生效。
