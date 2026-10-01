---
title: "AI 写 Playwright 选择器，5 个模型 5 种 DOM 变异实测：i18n 团灭"
description: "5 模型 × 4 选择器 × 5 种 DOM 变异实测：CSS Modules、多层包裹都免疫，换英文文案时 5 个 AI 全断；i18n 下仅 1 个模型存活。"
date: 2026-10-01T00:00:00+08:00
draft: false
categories: [AI, DevOps]
tags: [AI 测试, Playwright, 选择器稳定性, E2E 测试, 变异测试, LLM 代码生成]
contributors: []
---

让 AI 生成 Playwright 用例时，我关心的是它写的选择器在页面前端重构之后还能不能活。上一篇 [AI 生成的 E2E 测试能抓到真 bug 吗](/blog/ai-generated-e2e-tests-mutation-testing/) 测的是「能不能抓到注入的功能缺陷」，这篇测另一个维度——**选择器本身在 UI 不变语义、只变结构/文案时的存活率**。

## 实验设计

一个用户管理后台的静态 HTML，包含：新建按钮、搜索框、三行用户列表、行内编辑/删除按钮、分页器。把它喂给 5 个模型，让它们为 4 个操作各写一个 Playwright locator 表达式（`getByRole(...)` 或 `page.locator(...)`）。

然后做 5 个**语义等价**的 DOM 变异，让选择器逐一在 6 个页面上跑：

- **M1 CSS Modules**：所有 class 换成 `buttonPrimary_a3f9` 这种带后缀的形式
- **M2 i18n 英文**：整页文案换成英文（「新建用户」→「Create User」）
- **M3 包裹一层**：按钮外包 `<div class="action-area"><div class="action-inner">`
- **M4 动态 id**：`id="create-user-btn"` 变成 `id="create-user-btn-a1b2c3"`
- **M5 aria 语义化**：`button` 换成 `<a role="button">` 或 `<span role="button">`，加 `aria-label`

判定标准：locator 不仅能命中元素，而且命中的必须是**语义正确的那一个**（防止 click 落到相邻行的编辑按钮上——这种错误比断掉更糟，因为测试还是绿的，bug 已经漏了）。

## 结果：i18n 团灭

每个模型 4 个选择器 × 6 页面，共 120 个执行格子：

```
=== deepseek-v4.1-flash
  create_user     ✓ ✓ · ✓ ✓ ✓  <- getByRole('button', { name: '新建用户', exact: true })
  search_user     ✓ ✓ · ✓ ✓ ✓  <- getByPlaceholder('输入用户名搜索', { exact: true })
  edit_zhangwei   ✓ ✓ · ✓ ✓ ·  <- locator('tr[data-user-id="u001"]').getByRole('button', { name: '编辑', exact: true })
  delete_wangfang ✓ ✓ · ✓ ✓ ·  <- locator('tr[data-user-id="u003"]').getByRole('button', { name: '删除', exact: true })

=== MiniMax-M3
  create_user     ✓ ✓ · ✓ ✓ ✓  <- getByRole('button', { name: '新建用户' })
  search_user     ✓ ✓ · ✓ ✓ ✓  <- getByPlaceholder('输入用户名搜索')
  edit_zhangwei   ✓ ✓ · ✓ ✓ ✓  <- page.locator('tr[data-user-id="u001"]').getByRole('button', { name: '编辑' })
  delete_wangfang ✓ ✓ · ✓ ✓ ✓  <- page.locator('tr[data-user-id="u003"]').getByRole('button', { name: '删除' })

=== gpt-5.6-luna
  create_user     ✓ ✓ ✓ ✓ · ✓  <- #create-user-btn
  search_user     ✓ ✓ ✓ ✓ · ✓  <- #search-input
  edit_zhangwei   ✓ ✓ ✓ ✓ ✓ ✓  <- tr[data-user-id="u001"] button.edit-btn
  delete_wangfang ✓ ✓ ✓ ✓ ✓ ✓  <- tr[data-user-id="u003"] button.delete-btn

=== kimi-k3
  create_user     ✓ ✓ · ✓ ✓ ✓  <- getByRole('button', { name: '新建用户' })
  search_user     ✓ ✓ · ✓ ✓ ✓  <- getByPlaceholder('输入用户名搜索')
  edit_zhangwei   ✓ ✓ · ✓ ✓ ✓  <- locator('tr[data-user-id="u001"]').getByRole('button', { name: '编辑' })
  delete_wangfang ✓ ✓ · ✓ ✓ ✓  <- locator('tr[data-user-id="u003"]').getByRole('button', { name: '删除' })

=== doubao-seed-2.0-pro
  create_user     ✓ ✓ · ✓ ✓ ✓  <- getByRole('button', { name: '新建用户' })
  search_user     ✓ ✓ · ✓ ✓ ✓  <- getByPlaceholder('输入用户名搜索')
  edit_zhangwei   ✓ ✓ · ✓ ✓ ✓  <- getByRole('row', { name: '张伟' }).getByRole('button', { name: '编辑' })
  delete_wangfang ✓ ✓ · ✓ ✓ ✓  <- getByRole('row', { name: '王芳' }).getByRole('button', { name: '删除' })
```

每个变异页面让 20 个选择器活下来几个：

```
base                 20/20   (基准)
M1 CSS Modules       20/20   (没有人依赖被改的 class)
M2 i18n 英文          4/20   (团灭)
M3 包裹一层          20/20
M4 动态 id            18/20
M5 aria 语义化        18/20
```

M1 满分有个**实验偏差**：gpt-5.6-luna 用了 `.edit-btn` / `.delete-btn` 这两个 class，而我的 M1 变异里没改它们（只改了 `btn-primary` 等通用修饰）。如果 CSS Modules 改造是全量的，gpt-5.6-luna 的两个行内按钮选择器会一起断。真实项目里不要把 class 名当稳定契约——它随时可能被构建工具改写。

## 三个判断

**1. 模型写选择器已经普遍按 Playwright 推荐的 getByRole 路线走，但这条路线对文案是硬依赖**

deepseek-v4.1-flash、MiniMax-M3、kimi-k3、doubao-seed-2.0-pro 四家全部首选 `getByRole('button', { name: '...' })`。这是 Playwright 官方推荐、也是社区公认的「最稳」写法。前提是页面文案不变。

M2（换英文文案）一上，这 16 个选择器全灭。只剩 gpt-5.6-luna 的 4 个——它用的是 `#id` 和 `data-user-id`。

这不是模型选错了策略，是 **「文案稳定」这个假设在 i18n 场景根本不成立**。给国内单语言后台写用例时没事；一旦产品要出海或做多语言，所有 getByRole 用例需要成批重写。

**2. gpt-5.6-luna 的 `#id` 风格在 i18n 下活下来，但死在了 M4（动态 id 后缀）**

`#create-user-btn` 在 M4（`id="create-user-btn-a1b2c3"`）直接找不到元素。这是组件库多次实例化、或者构建工具自动加 hash 时的常态。一个页面只有 1 个新建按钮时没事，同一页面有两个「新建」入口时 id 一定会变。

**它反而是 5 个模型里唯一在 i18n 变异下活下来的**——以 M4 的死为代价。

**3. M5（aria 语义化）只断 deepseek 一家，出乎意料**

把编辑按钮从「无 aria-label」改成 `aria-label="编辑用户"`，text content 不变。结果 deepseek-v4.1-flash 的 `getByRole('button', { name: '编辑', exact: true })` 断了——Playwright 的 accessible name 计算优先取 `aria-label`，取到的是「编辑用户」而不是「编辑」，exact match 失配。

其他四家都没问题：gpt-5.6-luna 用 class selector 完全不在乎 aria-label；MiniMax-M3、kimi-k3、doubao 用 `name: '编辑'`（不带 exact）substring 命中了「编辑用户」。

讽刺的是：**模型里只有 deepseek 加了 `exact: true`**——这是更严谨的写法，却反而更脆。

## 工程建议

如果让 AI 写回归测试，把这几条塞进 prompt 或 checklist：

- 如果产品会 i18n：禁止依赖 text content / `getByPlaceholder`。要求模型优先选 `data-testid`、`data-user-id`、`aria-*` 这类不变量。
- 如果产品会拆分多语言团队开发：强制 `data-testid` 是唯一可靠的契约。
- 不要把 `exact: true` 当默认值。它确实更严谨，但任何一次文案/aria-label 微调都会断。
- 拿到 AI 生成的选择器后，至少跑一遍「换文案」「换 div 层级」的变异再入库。

## 边界

- 模型只生成一次，temperature=0；换一个 prompt 风格结果可能不同。我用的 prompt 没提「要考虑 i18n」，这是公平的真实场景——真实用户也不会提。
- M2 的英文翻译是我手工写的（「Delete this user?」对应「确认删除该用户？」），如果机翻成别的措辞，部分 substring 匹配可能蒙对。
- M1 的 CSS class 变异只改了部分 class（`btn-primary`、`btn-danger` 等通用修饰），没改 `.edit-btn` / `.delete-btn` 这类业务按钮 class，所以 M1 列的满分不能外推到「更激进的 CSS Modules 改造」。
- 所有 5 个模型都在同一网关下 2026-10-01 实测，模型固化的版本是当时的快照。

## 复现

关键的判定逻辑是「locator 必须命中**语义正确**的元素」——只用 `count() === 1` 不够，因为有些选择器在错误页面上也能命中（比如定位到了相邻行的编辑按钮），那种情况下测试是绿的，bug 已经漏了。我用的是回读 `data-user-id` / `id` 前缀这些稳定特征做二次确认。

同领域 AI 工程工具见 [awesome-x-ops](https://github.com/xlabs-club/awesome-x-ops) 的 AI 分类。MCP/Agent 场景的实测在 [MCP Streamable HTTP SDK 行为](/blog/mcp-streamable-http-sdk-behavior/) 一篇。
