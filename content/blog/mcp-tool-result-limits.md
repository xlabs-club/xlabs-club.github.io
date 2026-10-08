---
title: "MCP 工具返回值的两道隐藏边界：10MB 帧上限、outputSchema 校验（1.32.1 实测）"
description: "MCP 工具返回值实测（@modelcontextprotocol/sdk 1.32.1）：结果帧超 10MiB 直接断连、只报 Connection closed；outputSchema 校验失败被包成 isError，客户端还会抛异常。"
date: 2026-10-09T00:00:00+08:00
draft: false
categories: [AI, MCP]
tags: [MCP, outputSchema, structuredContent, stdio, TypeScript SDK, 断连排查, ReadBuffer]
contributors: []
---

上一篇 [MCP 2026-07-28 弃用扫描](/blog/mcp-2026-07-28-deprecation-sdk-lag/) 我 grep 的是 SDK 有没有跟上 spec。这篇 grep 另一件事：**我 server 返回的工具结果，在客户端那边会经历什么**。

四条结论都不在文档里，也不在类型定义里，跑出来才知道：

- stdio 下，结果帧超过 **10,485,760 字节** 就断连，调用方只看到 `MCP error -32000: Connection closed`，真实原因只在 `transport.onerror` 里。
- 这个上限属于**读的一方**（客户端）。服务端把 `maxBufferSize` 调多大都没用。
- 服务端 `outputSchema` 校验失败变成一个 `isError: true` 的**正常 result**，不是 JSON-RPC error，`try/catch` 抓不到。
- 客户端只在调过 `tools/list` 之后才校验 `structuredContent`；而且 `isError: true` 时它照校验不误，会把错误结果整个抛成异常。

## 环境

- `@modelcontextprotocol/sdk@1.32.1`（npm 当前 latest）+ `zod`
- Node v26.3.0，stdio transport，全部默认配置
- 每个用例开新客户端进程，避免上一轮的断连污染下一轮
- 单文件复现脚本在文末，`node mcp-result-limits.mjs` 直接跑

## 一、outputSchema：校验失败不是错误

工具声明 `outputSchema: { count: z.number() }`，handler 返回 `{ count: 'one' }`。服务端 `McpServer` 确实拦了，但拦下来的处理方式是这样：

```js
// node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:181
catch (error) {
  return this.createToolError(error instanceof Error ? error.message : String(error));
}
```

`createToolError` 返回 `{ content: [{type:'text', text: msg}], isError: true }`。抓包确认，线上是一个 `result` 帧，没有 `error` 键：

```json
{"jsonrpc":"2.0","id":4,"result":{
  "content":[{"type":"text","text":"boom"}],
  "structuredContent":{"count":"one"},
  "isError":true}}
```

三条失败路径的原话：

```
no_structured => MCP error -32602: Output validation error: Tool no_structured has an output schema but no structured content was provided
bad_type      => MCP error -32602: Output validation error: Invalid structured content for tool bad_type: Invalid input: expected number, received string at count
```

对调用方的直接影响是**没有异常可捕获**：包在 `try/catch` 里的 `callTool` 正常返回，业务代码拿到 `structuredContent: null`、`content` 是报错文案的结果。下游直接读 `structuredContent.count` 就是 `Cannot read properties of undefined`；下游要是把它喂给模型，模型看到的是 "Output validation error: ..." 这种它读不懂的字符串，然后开始猜——和我上一篇 [工具失败回灌实测](/blog/mcp-tool-failure-recovery/) 里 `empty_ok` 触发幻觉是同一类问题。

唯一可靠的观测点是 `isError`。但它同时承载了「业务失败」和「我 schema 写错了」两件事，监控上分不开。

### 客户端校验取决于调没调过 tools/list

同一个工具，客户端 `listTools` 之前和之后是两个世界：

| 工具返回值 | 未 listTools | 已 listTools |
|---|---|---|
| `no_structured`（有 schema 没给 structuredContent） | isError=true | isError=true |
| `bad_type`（structuredContent 类型错） | isError=true | isError=true |
| `extra_field`（多一个诊断字段） | OK，原样返回 | 抛 -32602 |
| `iserror_bad`（isError + 不合规 structuredContent） | OK，原样返回 | 抛 -32602 |
| `diverge`（text 说 5，structured 说 7） | OK | OK |

客户端在 `tools/list` 时缓存每个工具的 outputSchema validator（`client/index.js` 的 `cacheToolMetadata`），`callTool` 里再用它校验。所以只 `callTool` 从不 `listTools` 的客户端等于**完全没有返回值校验**。

而正常走 `listTools` 的客户端会拒绝多出来的字段，因为 Zod 转出来的 JSON Schema 带 `additionalProperties: false`：

```json
{"type":"object","properties":{"count":{"type":"number"}},
 "required":["count"],"$schema":"http://json-schema.org/draft-07/schema#",
 "additionalProperties":false}
```

```
extra_field / 已 listTools =>
MCP error -32602: Structured content does not match the tool's output schema: data must NOT have additional properties
```

「多给点信息」在这里会打断整个调用。这是最容易踩、也最难自己发现的一条——本地写 server 的调试客户端往往不调 `listTools`，你测不出来。

### isError 是双重标准

服务端遇到 `isError: true` 就跳过 outputSchema 校验（`validateToolOutput` 第一行 `if (result.isError) return;`），好让错误结果不必满足成功时的 schema。客户端不是这样。它的注释写着 `// Only validate structured content if present (not when there's an error)`（`client/index.js:493`），但代码只跳过了「structuredContent 缺失」那一种情况——**只要 structuredContent 存在就照样校验**。

于是：一个上报错误、顺手带了不合规 structuredContent 的工具，服务端放行，客户端抛异常。调用方拿到的是异常，不是那句错误文案。

```
iserror_bad / 未 listTools => {"isError":true,"structured":{"count":"one"},"text":"上游 502"}
iserror_bad / 已 listTools  => MCP error -32602: Structured content does not match the tool's output schema: data/count must be number
```

反过来，错误结果里**不放** structuredContent，两边都放行。这是错误返回唯一稳妥的形态。

### text 和 structuredContent 不一致，没人查

工具返回 `content: [{type:'text', text:'count=5'}]` 和 `structuredContent: {count: 7}`，服务端校验通过，客户端校验通过。模型读 text，程序读 structuredContent，拿到两个不同的数，四层实现里没有一层会发现。

同类的还有一个：声明 outputSchema、返回 `content: []` + 合法 structuredContent，也一路通过——TS 这个版本的高层 API **不会**自动补一份 text 序列化（Python SDK 文档写的是会自动填两个 channel，两者行为不一致）。只吃 text 的客户端拿到空结果，但代码里看不出任何异常。

## 二、10MB：结果帧超了就断连

真正把连接打死的是这个常量：

```js
// node_modules/@modelcontextprotocol/sdk/dist/esm/shared/stdio.js:2
export const STDIO_DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024;
```

`ReadBuffer.append` 累积超过它就 `throw`，抛出位置在 transport 的 ondata 回调里，冒泡上去的结果是 transport 关闭。逐个测：

```
text 9437184B   => OK，318ms
text 10485760B  => -32000: Connection closed / ReadBuffer exceeded maximum size of 10485760 bytes
text 12582912B  => -32000: Connection closed / ReadBuffer exceeded maximum size of 10485760 bytes
```

断连之后同一个 client 再调任何工具都是 `Error: Not connected`。**`Connection closed` 这个报错没有任何信息量**，真正的原因要去 `transport.onerror` 里捞；宿主客户端不一定会把它写进日志。

### 三个被低估的点

**1. 上限算字节，不算字符。** 换成中文：

```
cjk 3000000 字  => OK（9,000,000 字节）
cjk 3500000 字  => 断连（10,500,000 字节）
```

翻成中文以后，同样「三百万字」的摘要、diff、日志片段就撞墙。按字符数估容量必然翻车。

**2. base64 让二进制内容再打七五折。** 图片/音频走 `data` 字段 base64，膨胀 4/3：

```
blob 原始 7340032B => OK（base64 后 9,786,712 字符）
blob 原始 8388608B => 断连（base64 后 11,184,810 字符）
```

截图类工具实际能返回的图片上限约 7.5 MiB 原始字节，不是 10 MiB。

**3. 上限属于读的一方，服务端改不了。** 最反直觉的一条：

```
客户端 maxBuffer=1MiB，返回 1MiB            => 断连（ReadBuffer exceeded maximum size of 1048576 bytes）
客户端 maxBuffer=32MiB，返回 16MiB          => OK，768ms
服务端 maxBuffer=64MiB，客户端默认，返回 12MiB => 仍然断连（10485760 bytes）
```

服务端把 `StdioServerTransport` 的 `maxBufferSize` 调大，只影响它**读**客户端请求的能力，对「客户端能不能读下我的结果」毫无帮助。这不是服务端单方面能修的：宿主客户端（Claude Desktop 这类）用的就是默认值。

**它也不是协议限制。** 同一份 server 代码换 InMemory transport，32 MiB 用 1ms 过去；stdio 下连续三次返回 4 MiB 全部成功——上限按**单个未结束的帧**算，不累积。

## 为什么会这样

spec 把「谁校验输出」留给实现：server 声明 outputSchema 后 client SHOULD 校验，client 拿到不符的结果 SHOULD/MUST 报错。TS SDK 选了「服务端把失败包成 isError + 客户端校验时抛异常」这套组合，两种策略叠在一起就出现了「同一个错误，取决于是不是调过 tools/list，是异常还是结果」。

10 MiB 则是另一回事：它是 stdio 读取层防 OOM 的工程默认值，写在实现里，不在任何 spec、文档或类型里。没有文档的地方，失败模式就只能是静默。

## 落地清单

1. **给所有工具结果设自己可控的上限**，超了不回原文，回 `resource_link` 加摘要：

```js
const MAX_INLINE = 1 * 1024 * 1024; // 1 MiB，给 JSON framing 留足余量

function inlineResult(text, uri) {
  const bytes = Buffer.byteLength(text, 'utf8'); // 必须按字节，不是 text.length
  if (bytes <= MAX_INLINE) return [{ type: 'text', text }];
  return [
    { type: 'text', text: `结果 ${bytes} 字节，已截断，完整内容见 resource` },
    { type: 'resource_link', uri, name: 'full result', mimeType: 'text/plain' },
  ];
}
```

2. **错误结果不要带 structuredContent**，只给 text + `isError: true`（两边都放行的唯一形态）。
3. **outputSchema 只写会稳定返回的字段**。额外的诊断信息走 resource 或日志，否则被 `additionalProperties: false` 拒掉。
4. **返回 structuredContent 时自己再给一份 text 序列化**，别指望 SDK 补——只读 text 的客户端拿不到 structuredContent。
5. **自己先校验再返回**。服务端失败会变成 `isError`，客户端失败会变成异常，两种都不是你想看到的报错方式。
6. **客户端侧一定挂 `transport.onerror`**，否则 `-32000: Connection closed` 等于没信息。
7. **CI 加一条大结果回归**：造一个 12 MiB 返回值，断言 `callTool` 不抛异常、或断言错误文案含 `ReadBuffer exceeded`。别等用户报「工具偶尔没反应」。

## 边界

- 只测 `@modelcontextprotocol/sdk@1.32.1` + Node v26.3.0 + stdio + 默认配置。Streamable HTTP 不走 `shared/stdio.js` 这套 ReadBuffer，上限另说，未测。
- Python SDK 未测。它文档里写过「会同时填 content 和 structured_content」，与 TS 高层 API 不一致，不能互相套用结论。
- 10 MiB 是当前默认值，不是协议承诺，换版本可能就变。要长期依赖就自己定义上限，别依赖这个数。
- 断连后服务端进程状态未验证（stderr 为空、拿不到 exitCode），只确认客户端侧连接关闭、后续调用 `Not connected`。

## 复现脚本

单文件，`npm i @modelcontextprotocol/sdk@1.32.1 zod` 之后直接跑。

```js
// mcp-result-limits.mjs（节选）
// 1) 子进程 server：一台机器上放 3 类工具
fs.writeFileSync(CHILD, `
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
const s = new McpServer({ name: 'limits', version: '0.0.1' });
const Cout = { count: z.number() };
const reg = (name, cfg, fn) => s.registerTool(name, { description: name, inputSchema: {}, ...cfg }, fn);
reg('ok',            { outputSchema: Cout }, async () => ({ content: [{ type: 'text', text: 'count=1' }], structuredContent: { count: 1 } }));
reg('no_structured', { outputSchema: Cout }, async () => ({ content: [{ type: 'text', text: 'count=1' }] }));
reg('bad_type',      { outputSchema: Cout }, async () => ({ content: [{ type: 'text', text: 'count=one' }], structuredContent: { count: 'one' } }));
reg('extra_field',   { outputSchema: Cout }, async () => ({ content: [{ type: 'text', text: 'x' }], structuredContent: { count: 1, extra: 'x' } }));
reg('iserror_bad',   { outputSchema: Cout }, async () => ({ isError: true, content: [{ type: 'text', text: '上游 502' }], structuredContent: { count: 'one' } }));
reg('diverge',       { outputSchema: Cout }, async () => ({ content: [{ type: 'text', text: 'count=5' }], structuredContent: { count: 7 } }));
s.registerTool('text', { description: 'text', inputSchema: { bytes: z.number() } }, async (a) => ({ content: [{ type: 'text', text: 'A'.repeat(a.bytes) }] }));
s.registerTool('cjk',  { description: 'cjk',  inputSchema: { chars: z.number() } }, async (a) => ({ content: [{ type: 'text', text: '字'.repeat(a.chars) }] }));
s.registerTool('blob', { description: 'blob', inputSchema: { bytes: z.number() } }, async (a) => ({ content: [{ type: 'image', data: Buffer.alloc(a.bytes, 7).toString('base64'), mimeType: 'image/png' }] }));
await s.connect(new StdioServerTransport(process.env.MAXBUF ? { maxBufferSize: Number(process.env.MAXBUF) } : undefined));
`);

// 2) 每个用例开新客户端：list 决定校验开关，maxBufferSize 决定帧上限，onerror 留住真实报错
async function call(tool, args, { list = false, clientMaxBuf } = {}) {
  const t = new StdioClientTransport({ command: 'node', args: [CHILD], stderr: 'pipe',
    ...(clientMaxBuf ? { maxBufferSize: clientMaxBuf } : {}) });
  const transportErrors = [];
  t.onerror = (e) => transportErrors.push(String(e?.message ?? e));
  const client = new Client({ name: 'limits-client', version: '0.0.1' });
  await client.connect(t);
  if (list) await client.listTools();
  try {
    const res = await client.callTool({ name: tool, arguments: args ?? {} });
    return { ok: true, isError: res.isError ?? false, structured: res.structuredContent ?? null,
             text: res.content?.[0]?.text?.slice(0, 96) ?? null };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message, transportError: transportErrors[0] };
  } finally { await client.close(); }
}
```

完整文件（含 InMemory 对照与读者侧/服务端侧配置对比）我跑在这台机器上，输出就是上面各节的原始日志。想复用的话，把 `call()` 直接拿去做回归测试也行——第 7 条清单里的 12 MiB 用例就是这么写的。

---

MCP 的 server / client 实现和周边工具，可以顺着 [awesome-x-ops 的 AI Coding 分类](https://github.com/xlabs-club/awesome-x-ops#ai-coding)往下翻。同环境同 SDK 的前几篇：[版本协商实测](/blog/mcp-2026-07-28-version-negotiation/)、[Streamable HTTP 行为](/blog/mcp-streamable-http-sdk-behavior/)、[工具失败回灌](/blog/mcp-tool-failure-recovery/)。
