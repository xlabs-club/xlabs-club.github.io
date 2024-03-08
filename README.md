# xlabs-club.github.io

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/xlabs-club/xlabs-club.github.io/.github%2Fworkflows%2Fgh-pages.yml)
![GitHub Repo stars](https://img.shields.io/github/stars/xlabs-club/xlabs-club.github.io)
![GitHub contributors](https://img.shields.io/github/contributors/xlabs-club/xlabs-club.github.io)

卫星实验室，一个专注于研究 CRM（Customer Relationship Management，客户关系管理） 的开源组织。

此项目为卫星实验室主页 [xlabs.club][] 的源码，在这里我们将分享 CRM 领域独有的建设经验，介绍如何以技术驱动 CRM 长期发展和高速增长。

加入我们，与我们共同共同探索 CRM 技术前沿，解决行业中的挑战。

## 主页内容

- 平台工程：我们的平台工程建设之路，关于 DevOps, DataOps, FinOps 以及 AIOps 的工程实践。
- 云原生：云原生技术探索，如何以云原生技术支撑起不断变化的复杂业务。
- awesome-x-ops：一些关于 AIOps、DataOps、DevOps、GitOps、FinOps 的优秀软件、博客、配套工具。
- xlabs-ops：一些运维脚本和模板，如 Argo Workflows 模板仓库，是对官方 Examples 的组合、扩展。

## 本地开发

本项目使用 [Hugo](https://gohugo.io/) 开发，使用 [Doks](https://github.com/gethyas/doks) 作为 Hugo 主题。

本地开发时先安装 Nodejs，然后使用 pnpm（或 npm） 安装 Hugo bin，本地不需要提前安装 Hugo。

```bash

# 安装 npm 依赖包，注意网络连接
pnpm install
# 启动 Web，然后浏览器访问 http://localhost:1313/即可浏览效果
pnpm run dev
# 创建新页面
pnpm run create docs/platform/backstage.md
pnpm run create blog/k8s.md
# 代码提交前先检查
pnpm run lint
# 编译结果
pnpm run build
```

## License

本文档采用 [CC BY-NC 4.0][] 许可协议。

[xlabs.club]: https://www.xlabs.club
[CC BY-NC 4.0]: https://creativecommons.org/licenses/by-nc/4.0/
