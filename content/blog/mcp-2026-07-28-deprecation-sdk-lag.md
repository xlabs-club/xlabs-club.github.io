---
title: "MCP 2026-07-28 弃用 Roots/Sampling/Logging，SDK 还在裸奔（1.32.1 实测）"
description: "实测 @modelcontextprotocol/sdk@1.32.1：spec 已弃用 Roots/Sampling/Logging，但 SDK 零警告零 @deprecated，要主动 audit。"
date: 2026-10-07T00:00:00+08:00
draft: false
categories: [AI, MCP]
tags: [MCP, MCP 2026-07-28, Roots, Sampling, Logging, MRTR, server/discover, SEP-2577]
contributors: []
---

昨天翻 MCP 2026-07-28 changelog，看到一条以前没注意的：**Roots、Sampling、Logging 三个 feature 整体弃用**（SEP-2577），且新增了 `server/discover` 方法和强制 `Mcp-Method` / `Mcp-Name` 请求头（SEP-2243）。文档说弃用是 annotation-only，wire protocol 不变，给 12 个月迁移期。

我立刻去看自己的 server 代码——里面正用着 `sampling/createMessage` 做 Agent 内嵌推理。如果 SDK 已经有 deprecation 警告，我得在升级前看到它。所以拿了 `@modelcontextprotocol/sdk@1.32.1`（2026-10-05 发布，npm 上当前最新）实测了一把。

结论：**SDK 还没跟上 spec。这三个 feature 在 1.32.1 上裸奔，没有任何运行时或类型层警告。**

## 实测环境

- `@modelcontextprotocol/sdk@1.32.1`（npm，2026-10-05）
- Node v22
- InMemory transport，client 端声明 `roots: { listChanged: true }` 和 `sampling: {}` 能力并 stub 了 handler

## 实测：三个弃用 feature 的当前行为

写了一个 probe server，单个工具内部直发三种「弃用」请求，捕获 `console.warn` / `console.error` / `process.on('warning')`：

```js
// 节选，完整 probe.mjs 在文末
try {
  out.roots = await extra.sendRequest(
    { method: 'roots/list', params: {} },
    RootsResultZod,
  );
} catch (e) { out.errors.push('roots: ' + e.message); }

try {
  out.sampling = await extra.sendRequest(
    {
      method: 'sampling/createMessage',
      params: { messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }], maxTokens: 8 },
    },
    SamplingResultZod,
  );
} catch (e) { out.errors.push('sampling: ' + e.message); }

try {
  await extra.sendNotification({
    method: 'notifications/message',
    params: { level: 'info', data: 'deprecated-log', logger: 'probe' },
  });
  out.log = 'sent';
} catch (e) { out.errors.push('logging: ' + e.message); }
```

跑出来的结果：

```json
{
  "roots":    { "roots": [{ "uri": "file:///tmp/x", "name": "x" }] },
  "sampling": { "role": "assistant", "model": "stub",
                "content": { "type": "text", "text": "stub-reply" } },
  "log": null,
  "errors": ["logging: Server does not support logging (required for notifications/message)"]
}
// --- warnings captured ---
// (none)
```

读出来的事实：

- **`roots/list` 工作正常，无任何警告**。SDK 不知道也不在乎 spec 已弃用它。
- **`sampling/createMessage` 工作正常，无任何警告**。同上。
- **`notifications/message` 被拦了，但拦它的不是 deprecation**——是 SDK 自带的能力协商：server 没声明 `logging` 能力，`sendNotification` 直接抛错。也就是说，即使你今天不小心用 logging，得到的提示也不是「这个 API 要没了」，而是「你没声明能力」。

如果只看运行时行为，没人能猜到这三个 feature 已经进入 12 个月倒计时。

## 类型层也没有 `@deprecated`

SEP-2577 明确说要在 `schema/draft/schema.ts` 给以下类型加 `@deprecated`：Root、ListRootsRequest、CreateMessageRequest、SamplingMessage、ModelPreferences、LoggingLevel、LoggingMessageNotification 等等二十多个。

我在 SDK 1.32.1 的 `types.d.ts` 里搜了一遍：

```
$ grep -n "@deprecated" node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts
```

匹配到的全部是无关的旧 API 迁移提示（`isJSONRPCResultResponse`、`ResourceTemplateReferenceSchema` 之类），**没有任何 Roots/Sampling/Logging 类型被标弃用**。

也就是说，IDE 里写 `server.createMessage(...)` 时，IntelliSense 不会标黄、不会跳删除线。开发者不看 spec 就完全感知不到。

## SDK 也没实现 spec 的新增项

spec 2026-07-28 另外引入了几个服务端点：

- `server/discover`：客户端可以问一下服务器的版本、能力、身份，不再依赖 initialize
- `Mcp-Method` / `Mcp-Name` 请求头：让 CDN/网关可以按方法路由，不解析 body
- MRTR（Multi Round-Trip Request）：把 server-initiated 的 roots/list、sampling/createMessage、elicitation/create 改成「result 里嵌 inputRequests + 客户端 retry 时回带 inputResponses」的模式，摆脱长连接

在 1.32.1 的 dist/esm 里 grep：

```
$ grep -rn "server/discover" node_modules/@modelcontextprotocol/sdk/dist/esm/
$ grep -rn "Mcp-Method\|Mcp-Name" node_modules/@modelcontextprotocol/sdk/dist/esm/
$ grep -rn "input_required\|InputRequiredResult\|inputRequests" node_modules/@modelcontextprotocol/sdk/dist/esm/
```

前两个零匹配。第三个只命中 `TaskStatus = "..." | "input_required" | ...`，是 Task 系统的状态枚举，**不是 MRTR 的 InputRequiredResult**。

也就是说 SDK 1.32.1 还是 2025-11-25 时代的实现，没有接 spec 的新机制。这跟我在 [`mcp-2026-07-28-version-negotiation`](https://www.xlabs.club/blog/mcp-2026-07-28-version-negotiation/) 里实测的版本协商一致——SDK 目前默认仍走旧协议。

## 为什么这是个隐患

如果你今天在写新的 MCP server，看到 types.ts 里 `createMessage`、`listRoots` 都是正常的公开 API，IDE 没警告，runtime 没警告，spec 文档里说「annotation-only deprecation」又不会主动跳出来——

**你只会写出来一个 12 个月后要重写的 server。**

更要命的是 spec 给的迁移路径是**结构性的**：

| 弃用 | 替代方案 |
|---|---|
| Roots | 把目录作为工具参数 / resource URI / server 配置传 |
| Sampling | 直接调 LLM provider 的 API（让开发者自己持有 API key） |
| Logging | stderr（stdio）/ OpenTelemetry |

这不是改名，是**架构调整**。Roots 替代方案要求 server 自己管 scope，不再依赖 client 提供；Sampling 替代方案要求 server 直接持有 LLM 凭据，不再是 client 代理。这两种迁移都不能拖到最后一周做。

## 工程清单

今天就得做的事：

1. **主动 audit server 代码**。grep `createMessage`、`listRoots`、`sendLoggingMessage`、`logging/setLevel`，列出来，对每一处的迁移路径做决定。

2. **不要等 SDK 警告才动**。SDK 1.32.1 已经证不会警告你。把 SEP-2577 加进 upgrade checklist。

3. **新代码默认避开这三个 feature**。即使他们还能跑，写新代码时也用工具参数传 scope、直接调 LLM、用 stderr/OTel。

4. **盯 SDK 后续版本的 changelog**。SDK 团队总会在某个版本加 `@deprecated` 和 runtime 警告——那一天会是大范围告警的日子，提前一步。

5. **如果非要继续用 Sampling，把 model_preferences 写好**。spec 明确说 server hint 是 advisory、client 可以无视。写好 fallback 链路。

## 边界

- 只测了 `@modelcontextprotocol/sdk@1.32.1` 一个版本。Python SDK（`py.sdk.modelcontextprotocol.io`）从文档看已经在 sampling 函数上加了 deprecation warning（"Deprecated by the 2026-07-28 specification"），跟 TypeScript SDK 节奏不一样。
- 只测了 InMemory transport。Streamable HTTP 传输层的行为没测。
- SEP-2577 的 12 个月期限从「包含该 SEP 的 spec 版本发布日」起算——changelog 上写 spec 2026-07-28 GA，**所以最晚 2027-07-28 可能被移除**。具体日历看官方 deprecated features registry。
- MRTR 我没实测，因为 SDK 还没实现 InputRequiredResult。

## probe.mjs 完整源码

放出来给需要自己复现的人：

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ListRootsRequestSchema,
  CreateMessageRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const warnLog = [];
const origWarn = console.warn;
console.warn = (...a) => { warnLog.push(a.join(' ')); origWarn(...a); };
process.on('warning', (w) => warnLog.push(w.name + ': ' + w.message));

const server = new McpServer({ name: 'probe-server', version: '0.0.1' });
server.registerTool(
  'use-deprecated',
  {
    description: 'Calls listRoots + createMessage + sendLoggingMessage',
    inputSchema: {},
  },
  async (args, extra) => {
    const out = { roots: null, sampling: null, log: null, errors: [] };
    try {
      out.roots = await extra.sendRequest(
        { method: 'roots/list', params: {} },
        z.object({ roots: z.array(z.object({ uri: z.string(), name: z.string().optional() })) }),
      );
    } catch (e) { out.errors.push('roots: ' + e.message); }
    try {
      out.sampling = await extra.sendRequest(
        {
          method: 'sampling/createMessage',
          params: { messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }], maxTokens: 8 },
        },
        z.object({ role: z.string(), model: z.string(), content: z.any() }),
      );
    } catch (e) { out.errors.push('sampling: ' + e.message); }
    try {
      await extra.sendNotification({
        method: 'notifications/message',
        params: { level: 'info', data: 'deprecated-log', logger: 'probe' },
      });
      out.log = 'sent';
    } catch (e) { out.errors.push('logging: ' + e.message); }
    return { content: [{ type: 'text', text: JSON.stringify(out) }] };
  },
);

const [ct, st] = InMemoryTransport.createLinkedPair();
const client = new Client(
  { name: 'probe-client', version: '0.0.1' },
  { capabilities: { roots: { listChanged: true }, sampling: {} } },
);
client.setRequestHandler(ListRootsRequestSchema, async () => ({
  roots: [{ uri: 'file:///tmp/x', name: 'x' }],
}));
client.setRequestHandler(CreateMessageRequestSchema, async () => ({
  role: 'assistant', model: 'stub',
  content: { type: 'text', text: 'stub-reply' },
}));

await server.connect(st);
await client.connect(ct);
const result = await client.callTool({ name: 'use-deprecated', arguments: {} });
console.log(result.content[0].text);
console.log('--- warnings ---');
console.log(warnLog.length ? warnLog.join('\n') : '(none)');
await client.close();
await server.close();
```

---

MCP 相关的开源 server / client 实现，可以看 [awesome-x-ops 的 AI Coding 分类](https://github.com/xlabs-club/awesome-x-ops#ai-coding)。我前两天写的 [MCP 工具失败回灌实测](https://www.xlabs.club/blog/mcp-tool-failure-recovery/) 是同环境同 SDK 系列。
