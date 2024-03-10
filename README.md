# xlabs-club.github.io

[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/xlabs-club/xlabs-club.github.io/.github%2Fworkflows%2Fgh-pages.yml)](https://github.com/xlabs-club/xlabs-club.github.io/actions)
[![GitHub Repo stars](https://img.shields.io/github/stars/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io/graphs/contributors)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/xlabs-club/xlabs-club.github.io)](https://github.com/xlabs-club/xlabs-club.github.io)

卫星实验室，一个专注于研究 CRM（Customer Relationship Management，客户关系管理） 的开源组织。

此项目为卫星实验室主页 [xlabs.club][] 的源码，在这里我们将分享 CRM 领域独有的建设经验，介绍如何以技术驱动 CRM 长期发展和高速增长。

加入我们，与我们共同共同探索 CRM 技术前沿，解决行业中的挑战。

## 主页内容

- 平台工程：我们的平台工程建设之路，关于 DevOps, DataOps, FinOps 以及 AIOps 的工程实践。
- 云原生：云原生技术探索，如何以云原生技术支撑起不断变化的复杂业务。
- 技术博客：研发踩坑记录，翻一翻总有惊喜。
- awesome-x-ops：一些关于 AIOps、DataOps、DevOps、GitOps、FinOps 的优秀软件、博客、配套工具。
- xlabs-ops：一些运维脚本和模板，如 Argo Workflows 模板仓库，是对官方 Examples 的组合、扩展。

## 贡献指南

本项目使用 [Hugo][] 开发，使用 [Doks][] 作为 Hugo 主题，一切内容都是 Markdown，专心写文字即可。

本地开发时需要先安装 Nodejs，然后使用 pnpm（或 npm） 安装 Hugo bin，本地不需要提前安装 Hugo。

```bash
# 安装 npm 依赖包，注意此过程需要连接 github 下载 hugo
pnpm install
# 启动 Web，然后浏览器访问 http://localhost:1313/即可浏览效果
pnpm run dev
# 创建新页面
pnpm run create docs/platform/backstage.md
pnpm run create blog/k8s.md
# 执行代码检查
pnpm run lint
# 编译结果
pnpm run build
```

如果文章中包含图片，提交 Git 前推荐使用 [pngquant][] 先进行无损压缩。

```bash
# 选择自己的文件夹
for file in $(ls *.png)
do
  pngquant $file --force --output $file
done
```

## 贡献者列表

<a href="https://github.com/xlabs-club/xlabs-club.github.io/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=xlabs-club/xlabs-club.github.io" />
</a>

## License

本文档采用 [CC BY-NC 4.0][] 许可协议。

[xlabs.club]: https://www.xlabs.club
[Hugo]: https://gohugo.io/
[Doks]: https://github.com/gethyas/doks
[pngquant]: https://pngquant.org/
[CC BY-NC 4.0]: https://creativecommons.org/licenses/by-nc/4.0/
