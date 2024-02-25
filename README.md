# xlabs-club.github.io

卫星实验室，一个专注于研究卫星以及 CRM 的开源组织。

此项目为卫星实验室主页 [xlabs.club][] 的源码，记录常用文档和零碎博客，欢迎提交 PR 开源共建。

## 本地开发

本项目使用 [Hugo](https://gohugo.io/) 开发，使用 [Doks](https://github.com/gethyas/doks) 作为 Hugo 主题。

本地开发时先安装 Nodejs，然后使用 pnpm（或 npm） 安装 Hugo bin，本地不需要提前安装 Hugo。

```bash

# 安装 npm 依赖包，注意网络连接
pnpm install

# 启动 Web，然后浏览器访问 http://localhost:1313/即可浏览效果
pnpm run dev

# 代码提交前先检查
pnpm run lint

# 编译结果
pnpm run build

# 创建新页面
pnpm run create docs/guides/faq.md
pnpm run create docs/platform/backstage.md
pnpm run create blog/k8s.md

```

## License

本文档采用 [CC BY-NC 4.0][] 许可协议。

[xlabs.club]: https://www.xlabs.club
[CC BY-NC 4.0]: https://creativecommons.org/licenses/by-nc/4.0/
