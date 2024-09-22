# xlabs-club.github.io

[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/xlabs-club/xlabs-club.github.io/.github%2Fworkflows%2Fgh-pages.yml)](https://github.com/xlabs-club/xlabs-club.github.io/actions)
[![GitHub Repo stars](https://img.shields.io/github/stars/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/graphs/contributors)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io)

卫星实验室，一个专注于技术创新的开源组织。

此项目为卫星实验室主页 [xlabs.club][] 的源码，在这里将分享我们的平台工程实践经验，介绍如何以技术驱动业务长期发展和高速增长。

欢迎提交 PR 进行开源共建。

## 主页内容

- 平台工程：我们的平台工程建设之路，关于 DevOps, DataOps, FinOps 以及 AIOps 的工程实践。
- 云原生：云原生技术探索，如何以云原生技术支撑起不断变化的复杂业务。
- 技术博客：研发踩坑记录，翻一翻总有惊喜。
- awesome-x-ops：一些关于 AIOps、DataOps、DevOps、GitOps、FinOps 的优秀软件、博客、配套工具。
- xlabs-ops：一些 IaC 运维脚本和通用模板，如 Argo Workflows 模板仓库，是对官方 Examples 的组合、扩展。
- xlabs-developer-platform：一个基于 Backstage 自建的开发者平台。
- backstage-plugins：卫星实验室的开源 backstage plugins，欢迎提交 PR。

## 贡献指南

本项目使用 [Hugo][] 开发，使用 [Doks][] 作为 Hugo 主题，一切内容都是 Markdown，专心写文字即可。

本地开发时需要先安装 Nodejs 和 Hugo。

```bash
# 安装 npm 依赖包，注意此过程需要连接 github 下载 hugo
npm install
# 启动 Web，然后浏览器访问 http://localhost:1313/即可浏览效果
npm run dev
# 创建新页面
npm run create docs/platform/backstage.md
npm run create blog/k8s.md
# 编译结果
npm run build
```

## License

本文档采用 [CC BY-NC 4.0][] 许可协议。

[xlabs.club]: https://www.xlabs.club
[Hugo]: https://gohugo.io/
[Doks]: https://github.com/thuliteio/doks
[CC BY-NC 4.0]: https://creativecommons.org/licenses/by-nc/4.0/
