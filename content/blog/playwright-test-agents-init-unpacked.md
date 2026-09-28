---
title: "Playwright Test Agents 拆包：init-agents 落到磁盘的 3 个 agent 定义文件"
description: "实测 npx playwright init-agents 1.63.0：四个 loop 各自的落点和格式，healer 定义里「不允许问用户」和 fixme() 兜底条款的原文。"
date: 2026-09-29T00:00:00+08:00
draft: false
categories: [AI, DevOps]
tags: [Playwright, Test Agents, E2E, MCP, Claude Code, AI Agent]
contributors: []
---

Playwright 1.56 引入的 Planner / Generator / Healer 三个测试 agent，文档里只给了 `npx playwright init-agents --loop=<client>` 一句话。这个命令到底往仓里写了什么、agent 的 prompt 里写了什么硬约束，没人拆开看过。

我把 1.63.0 在空目录里跑了一遍，四个 loop（claude / codex / vscode / opencode）和 `--prompts` 参数各跑一次。下面是落盘产物对比和原文摘录。

## 四个 loop 落点不一样

`--loop=claude`：

```
.claude/agents/playwright-test-planner.md
.claude/agents/playwright-test-generator.md
.claude/agents/playwright-test-healer.md
.mcp.json
seed.spec.ts
specs/README.md
```

`--loop=codex` 把同一批内容写成 TOML，路径换成 `.codex/agents/playwright_test_*.toml`，且 `.mcp.json` 里的 server 名变成带 `tools: ["*"]` 显式白名单的写法。

`--loop=vscode` 产物最多：`.github/agents/*.agent.md` + `.vscode/mcp.json` + 一个 `.github/workflows/copilot-setup-steps.yml`（Copilot coding agent 在 CI 镜像里跑 `npm ci && npx playwright install --with-deps` 的引导）。

`--loop=opencode` 类似 claude，但落到 `.opencode/`。

公共三件套是 `.mcp.json` + `seed.spec.ts` + `specs/README.md`。`.mcp.json` 永远只声明一个 server：

```json
{
  "mcpServers": {
    "playwright-test": {
      "command": "npx",
      "args": ["playwright", "run-test-mcp-server"]
    }
  }
}
```

`seed.spec.ts` 是 7 行空 `test.describe`，作用是给 agents 一个「能跑起来」的最小锚点。`specs/README.md` 一句话：「directory for test plans」—— Planner 的产出落在这里。

`--prompts` 标志额外多写四个文件，对应四个动作的调用模板（`.claude/prompts/playwright-test-plan.md` 等），内容是 5-9 行的 front matter + 一句提示词，比如 heal 的就一句「Run all my tests and fix the failing ones」。文件本身没有信息密度，主要价值是把入口参数格式固定在仓里。

## Healer 定义里两条值得抄出来的条款

三个 `*.agent.md` 里最硬的两条都长在 healer（`.claude/agents/playwright-test-healer.md`）里，原文摘录：

```
- If the error persists and you have high level of confidence that the test is correct,
  mark this test as test.fixme() so that it is skipped during the execution. Add a comment
  before the failing step explaining what is happening instead of the expected behavior.
- Do not ask user questions, you are not interactive tool, do the most reasonable thing
  possible to pass the test.
- Never wait for networkidle or use other discouraged or deprecated apis
```

三条各自的含义：

1. **`test.fixme()` 是合法出口**。Healer 修不动时会主动选择「跳过 + 注释说明现象」，而不是继续瞎改。这是把「无法修复」显式编码进产物的条款——比静默改成宽断言要诚实。
2. **「不要问用户」是被写死的**。Agent 在无人值守的 CI 循环里跑，遇到歧义自己选最合理解。这意味着同一个 healer 跑两次，第二次的 patch 可能跟第一次不同——它不被要求幂等。
3. **`networkidle` 被点名禁用**。Planner/Generator 的 prompt 里没有这条，Healer 单独提，作者踩过 `networkidle` 把单页应用卡死的坑。

同时 healer 拿到的工具列表是三个 agent 里**唯一带 `test_debug`/`test_run`/`test_list`** 的——planner 和 generator 都没有这两个 MCP 工具，意味着它们不能执行已生成的 spec，只能操作浏览器。生成器写完代码没法自己跑一遍验证，这事是 healer 的活。

## Generator 强制契约：一个文件一个测试

Generator 的 agent.md 把产出格式钉死了：

```
- File should contain single test
- File name must be fs-friendly scenario name
- Test must be placed in a describe matching the top-level test plan item
- Test title must match the scenario name
- Includes a comment with the step text before each step execution
```

外加 `generator_read_log` + `generator_write_test` 两个专属工具——生成不是「模型自己写 spec 文件」，而是「模型在浏览器里把每一步重放一遍，把动作日志回收，再让模型对照日志写最终的 .spec.ts」。从设计稿上能看出作者想避免的事：写代码时不查日志、编造没真跑过的选择器。

这同时是一个隐性约束：**Generator 每产一个文件就要走一次完整 setup_page → 回放 → read_log → write_test**。一个 plan 里 20 个场景就是 20 次完整循环。模型费用、耗时、token 都是线性乘上去的，没有增量压缩机制。

## Codex 的差异在 sandbox

Codex 版的 healer 定义开头多了 `sandbox_mode = "workspace-write"`。

对照我自己的 Codex 记忆（full-auto 沙箱下 git fetch / GitLab API 都不通），这条沙箱声明意味着 healer 在 Codex 里跑时，**写文件可以、但网络出仓是受约束的**。当 spec 里要命中后端 API 拿数据、`test_debug` 要拿 trace 时，能不能出得了沙箱要另算。其他三个 loop 的 agent 定义里没有这个声明。

## 这个实测能带走什么

- **三个 agent 是不对称的**：Planner/Generator 不调 `test_run`，Healer 不调 `generator_write_test`。想让 Generator 写完自己跑验证 → 没有，那是 Healer 的职责边界。
- **init-agents 不会污染你的 `playwright.config.ts`**，所有产物是新建文件，删 `.claude/agents/`、`.mcp.json`、`specs/`、`seed.spec.ts` 就能干净回滚。
- **升级 Playwright 后要重跑 init-agents**。`node_modules/playwright/lib/agents/*.agent.md` 是模板源头，1.56 → 1.63 之间模板本身在演化，仓里那份是当时的快照，不会自动跟着 npm 升。
- **Healer 的「不问用户」**意味着它不适合放到默认 CI：一个歧义场景它可能选错「最合理动作」，把真 bug 改成 `fixme()` 跳过。文档把它放到 IDE 循环里是有原因的。

> 三个 Playwright MCP server 的工具集见 [awesome-x-ops AI Coding 分类](https://github.com/xlabs-club/awesome-x-ops#ai-coding)。MCP 协议本身的握手和会话机制实测见本站 [MCP Streamable HTTP 实测](/blog/mcp-streamable-http-sdk-behavior/)。
