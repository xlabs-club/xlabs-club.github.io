---
title: "Shell Coding"
description: "Linux Shell 编程实用句式速查"
summary: ""
date: 2024-03-09T11:01:01+08:00
lastmod: 2024-03-09T11:01:01+08:00
draft: false
weight: 999
toc: true
seo:
  title: "Linux Shell 编程实用句式速查"
  description: "Linux Shell 编程实用句式速查"
  canonical: ""
  noindex: false
---

Linux Shell 日常编程实用句式速查，注意以下例子如无特殊说明都是 bash 语法。

---

- 选择执行环境。

```shell
#!/usr/bin/env bash

#!/usr/bin/bash
```

- 指定变量默认值，取环境变量，取不到用默认值。

```shell
rep=${ENV_YOUR_KEY:-"my-default-value"}
```

- 获取当前执行脚本的绝对路径，注意直接用 $0 或 pwd 获取的可能都不要你想要的。

```shell
current_dir=$(cd `dirname $0`;pwd)
```

- 为当前目录包含子目录下所有 .sh 文件增加可执行权限。

```shell
chmod +x `find . -name '*.sh'`
```

- 通过 tee 将提示信息显示到终端，并同时写入到文件。

```shell
log_file=/var/log/test.log
echo "This line will echo to console and also write to log file." | tee -a ${log_file}
```

- 类似于 Java properties 中 key=value 形式的字符串，取 key 和 value 的值。

```shell
username_line="username=test"
#key is username
key=${username_line%=*}
#val is test
val=${username_line#*=}
```

- 实现 String trim 效果。

```shell
#trim string by echo
val_trim=$(echo -n ${val})
```

- 声明和循环数组。

```shell
apps=(foo bar)
for app in ${apps[@]}
do
  echo "$app"
done
```

- 文件 ls 转数组

```shell
# ls 转数组，根据需要 grep
arrs=($(ls helmfiles/apps | grep -v .yaml))
```

- 指定数组分割符，字符串转数组。

```shell
# 获取当前 helm list 命令输出结果，通过换行分割成数组
IFS=$'\n' helm_list=($(helm list --no-headers))

for hm in ${helm_list[@]}
do
    # 对每一行进行解析按 Tab 再分割成数组
    IFS=$'\t' hma=($hm)
    echo "helm upgrade --install ${hma[0]} ${hma[0]} --version ${hma[6]} --reset-values 2>&1"
done

```

- 文件按内容排序。

```shell
log=my-log-file
# 原地排序覆盖原文件
sort -o ${log} ${log}
```

- 判断字符串是否以某串开头，并去除指定前缀。

```shell
img=docker.io/nginx:1.20
repo=docker.io
# if 判断字符串是否以 repo 开头
if [[ $img == $repo* ]]; then
  # 注意这里 +2
  suffix=$(echo $img | cut -c$((${#repo}+2))-)
  # 输出  nginx:1.20
  echo "$suffix"
fi

```

- 按多个关键词 `或` 过滤。

```shell
echo "nginx"  | grep -E "nginx|tomcat"
echo "tomcat" | grep -E "nginx|tomcat"
echo "envoy"  | grep -E "nginx|tomcat"
```

- 获取当前时间，加减时区。

```shell
ct=$(TZ=UTC+8 date "+%Y%m%d%H%M")
```

- 检查是否以 root 用户执行。

```shell
# check if run as root user
if [[ `id -u` -ne 0 ]]; then
  echo "You need root privileges to run this script."
fi
```
