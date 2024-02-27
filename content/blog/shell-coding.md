---
title: "Shell 编程实用句式速查"
description: "Shell 编程实用句式速查"
summary: ""
date: 2023-02-27T20:48:53+08:00
lastmod: 2023-02-27T20:48:53+08:00
draft: false
weight: 50
categories: []
tags: [Tools]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "" # custom title (optional)
  description: "" # custom description (recommended)
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

选择执行环境。

```shell
#!/usr/bin/env bash

#!/usr/bin/bash
```

检查是否以 root 用户执行。

```shell
# check if run as root user
if [[ `id -u` -ne 0 ]]; then
  echo "You need root privileges to run this script."
fi
```

获取正在执行脚本的绝对路径，注意直接用 $0 或 pwd 获取的可能都不要你想要的。

```shell
current_dir=$(cd `dirname $0`;pwd)
```

为当前目录包含子目录下所有 .sh 文件增加可执行权限。

```shell
chmod +x `find . -name '*.sh'`
```

将提示信息显示到终端（控制台），同时也写入到文件里。

```shell
log_file=/var/log/test.log
echo "This line will echo to console and also write to log file." | tee -a ${log_file}
```

类似于 Java properties 中 key=value 形式的字符串，取 key 和 value 的值。

```shell
username_line="username=test"
#key is username
key=${username_line%=*}
#val is test
val=${username_line#*=}
```

实现 trim 效果。

```shell
#trim string by echo
val_trim=$(echo -n ${val})
```

字体输出颜色及终端格式控制。

```shell
#字体色范围：30-37
echo -e "\033[30m 黑色字 \033[0m"
echo -e "\033[31m 红色字 \033[0m"
echo -e "\033[32m 绿色字 \033[0m"
#字背景颜色范围：40-47
echo -e "\033[40;37m 黑底白字 \033[0m"
echo -e "\033[41;30m 红底黑字 \033[0m"
```
