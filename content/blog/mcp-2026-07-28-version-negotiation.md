---
title: "MCP 2026-07-28 实测：initialize 握手没了，老客户端还能连吗"
description: "实测 MCP 2026-07-28：initialize 握手被移除，改为每请求用 _meta 声明版本并强制 server/discover。用官方 v1/v2 SDK 与 mcporter 抓包看两代客户端如何协商，附 dual-era Server 实现与 tools/list 缓存字段报错。"
date: 2026-09-15T00:00:00+08:00
draft: false
categories: [AI, Architecture]
tags: [MCP, Model Context Protocol, Protocol Version, server/discover, AI Agent, Node.js]
contributors: []
---

2026-07-28 这一版 MCP 把 `initialize` 握手删了。协议版本不再是"协商一次、存在连接里"的状态，而是每个请求自己在 `_meta` 里声明；server 则必须实现 `server/discover`。

实测下来四件事：

- 老客户端（官方 v1 SDK `@modelcontextprotocol/sdk@1.29.0`，`LATEST_PROTOCOL_VERSION = '2025-11-25'`）不做探测，首包永远是 `initialize`。
- 新客户端（`mcporter@0.13.10`，依赖 v2 的 `@modelcontextprotocol/client@2.0.0`）先发 `server/discover`，拿到非 modern 错误就回退 `initialize`。**只认老协议的 server 不用改，照样能被新客户端用。**
- 老客户端撞上只支持 2026-07-28 的 server 会直接失败。它没有"向前兼容"机制，只能人肉改。
- 最容易翻车的不是版本号，是缓存字段：`tools/list` 漏 `ttlMs` / `cacheScope`，v2 客户端直接判定整个结果非法。

## 先确认手上的包属于哪一代

```bash
# v1 线：还是 initialize 握手
node -p "require('@modelcontextprotocol/sdk/package.json').version"
node -p "require('@modelcontextprotocol/sdk/dist/cjs/types.js').LATEST_PROTOCOL_VERSION"

# v2 线：实现 2026-07-28
node -p "require('@modelcontextprotocol/server/package.json').version"
```

本机实测值（Node 26.3.0）：

| 包 | 版本 | 协议 |
|----|------|------|
| `@modelcontextprotocol/sdk` | 1.29.0 | `LATEST_PROTOCOL_VERSION = '2025-11-25'`，SUPPORTED 一路到 `2024-10-07` |
| `@modelcontextprotocol/core` / `server` / `client` | 2.0.0 | 2026-07-28，v2 是官方 README 里写明的 stable release line |
| `mcporter` | 0.13.10 | 依赖 `@modelcontextprotocol/client@^2.0.0` |

同一台机器上两代 SDK 并存，这就是断层。

## 协议到底改了什么

| | legacy（≤ 2025-11-25） | modern（2026-07-28） |
|---|---|---|
| 版本声明 | `initialize` 协商一次，结果算连接状态 | 每个请求 `_meta["io.modelcontextprotocol/protocolVersion"]` |
| 能力 | 握手时交换一次 | 每个请求带 `clientCapabilities`（MUST） |
| 开场 | `initialize` → `notifications/initialized` | 可选 `server/discover`，但 server MUST 实现 |
| 结果结构 | `{content, isError}` | `resultType: "complete"`，且 `*/list`、`resources/read` 必须带 `ttlMs` + `cacheScope` |
| 版本不匹配 | 协商降级 | `-32022` 附 `data.supported` 列表，客户端换版本重试 |

**为什么要这么改**：握手把"我们说的是哪个协议"变成了连接状态，于是任何要水平扩展的部署都得处理会话粘滞——多副本、serverless、中间的负载均衡和代理都得记住"这条连接协商过什么"。改成每请求自带元数据后，请求可以落在任意副本上；规范还明确允许 tools 集合随请求里的授权上下文变化（同一台 server 对不同 token 返回不同工具集），因为授权本来就是请求级输入，不是连接级状态。代价是所有实现方都得改一遍。

## 抓包：真实客户端到底发什么

MCP Inspector 只能当客户端用，看不到真实客户端的报文。写一个三十行的 stdio 透传代理就能抓：

```js
// tap.mjs —— node tap.mjs --log /tmp/x.ndjson -- <server-cmd> [args...]
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

const argv = process.argv.slice(2);
const log = createWriteStream(argv[argv.indexOf('--log') + 1], { flags: 'w' });
const sep = argv.indexOf('--');
const [cmd, ...args] = argv.slice(sep + 1);
const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] }); // stderr 透传，别吞
const meta = (dir) => (msg) => log.write(JSON.stringify({ dir, msg }) + '\n');
const safe = (line) => { try { return JSON.parse(line); } catch { return { _raw: line }; } };

process.stdin.on('data', (c) => {
  c.toString().split('\n').filter(Boolean).forEach((l) => meta('c2s')(safe(l)));
  child.stdin.write(c);
});
process.stdin.on('end', () => child.stdin.end());
child.stdout.on('data', (c) => {
  c.toString().split('\n').filter(Boolean).forEach((l) => meta('s2c')(safe(l)));
  process.stdout.write(c);
});
child.on('exit', (code) => process.exit(code ?? 0));
```

两个细节：`stderr: 'inherit'` 让 server 的日志照常输出但不进协议通道；解析不了的行记成 `_raw`，脏输出不会静默丢掉。

用法是把客户端配置里的 command 指向代理，server 端一行都不用改：

```json
{
  "mcpServers": {
    "era-lab": { "command": "/tmp/mcp-era-lab/tapped-dual.sh" }
  }
}
```

新客户端连一台只认老协议的 server，抓到的就是这套流程（报文截断显示）：

```
c2s {"jsonrpc":"2.0","id":"server-discover-probe-1","method":"server/discover",
     "params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28", ...}}}
s2c {"jsonrpc":"2.0","id":"server-discover-probe-1",
     "error":{"code":-32601,"message":"method not found: server/discover"}}
c2s {"method":"initialize","params":{"protocolVersion":"2025-11-25", ...},"jsonrpc":"2.0","id":0}
s2c {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2025-11-25",
     "capabilities":{"tools":{}},"serverInfo":{"name":"era-legacy","version":"1.0.0"}}}
c2s {"jsonrpc":"2.0","method":"notifications/initialized"}
c2s {"method":"tools/list","jsonrpc":"2.0","id":1}
s2c {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"echo", ...}]}}
```

探测请求的 id 是 `server-discover-probe-1`，回退规则照规范实现：`DiscoverResult` → 认定 modern；`-32022` 这类已定义的 modern 错误 → 认定 modern，用 `supported` 里的版本重试，**不回退** `initialize`；其他错误或超时 → 认定 legacy，回退握手。

这里最反直觉的是回退判据：**不能只认某个错误码**。老 server 对未知方法回的是实现自定义的错误（常见 `-32601` / `-32602`），也可能干脆不回复。判错一次，你就把"版本不匹配"误当成"这是一台老 server"，然后在一个只支持新协议的 server 上反复发 `initialize`。

同一台新客户端连 dual-era server，`initialize` 在抓包里出现 0 次：

```
c2s server/discover  (_meta: 2026-07-28)
s2c result {resultType:"complete", supportedVersions:["2026-07-28"],
            capabilities:{tools:{}}, ttlMs:3600000, cacheScope:"public"}
c2s tools/list       (_meta: 2026-07-28)
s2c result {resultType:"complete", tools:[...], ttlMs:3600000, cacheScope:"public"}
```

而 v1 SDK 写的客户端连同一台 server，首包永远是 `initialize`，没有任何探测：

```
c2s {"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},
     "clientInfo":{"name":"legacy-client","version":"1.0.0"}},"jsonrpc":"2.0","id":0}
s2c {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{}},
     "serverInfo":{"name":"era-dual","version":"1.2.0"}}}
c2s {"method":"notifications/initialized","jsonrpc":"2.0"}
c2s {"method":"tools/list","jsonrpc":"2.0","id":1}
s2c {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"echo", ...}]}}   ← 注意：没有 resultType
```

两代客户端的开场方式不同，server 端必须两种都认。

## dual-era Server 的分流规则

只有一条规则：客户端怎么开场，就按哪一代语义服务。

```js
if (method === 'initialize') {
  // legacy 开场：协商出协议版本，本进程后续按 legacy 语义回复
  // （结果不带 resultType，也不带缓存字段）
  return legacyResult(id, {
    protocolVersion: pick(params.protocolVersion),
    capabilities: { tools: {} },
    serverInfo: SERVER,
  });
}

const metaVersion = params._meta?.['io.modelcontextprotocol/protocolVersion'];
if (metaVersion !== undefined) {
  if (!MODERN_SUPPORTED.includes(metaVersion)) {
    return fail(id, -32022, 'Unsupported protocol version',
      { supported: MODERN_SUPPORTED, requested: metaVersion });
  }
  if (params._meta['io.modelcontextprotocol/clientCapabilities'] === undefined) {
    return fail(id, -32602,
      'missing required _meta field: io.modelcontextprotocol/clientCapabilities');
  }
}
```

两个我实际写错过的地方：

**`clientCapabilities` 是 MUST。** 第一版我只校验了 `protocolVersion`，一个只有版本字段的请求本该被拒：

```
{"jsonrpc":"2.0","id":2,"error":{"code":-32602,
 "message":"missing required _meta field: io.modelcontextprotocol/clientCapabilities"}}
```

**legacy 分支的结果别带 modern 字段。** 我实测老客户端对多余字段是宽容的：在 legacy 结果里混入 `resultType`，v1 SDK 照常解析出 `callTool = {"content":[...],"isError":false}`。但那是运气不是保证，按分支给对应结构更省事。

`initialize` 的拒绝方式也有讲究。modern-only server 收到 `initialize`，规范建议把支持的版本写进错误信息——老客户端没有 fall-forward 机制，错误文本是用户唯一能看到的诊断：

```
{"jsonrpc":"2.0","id":3,"error":{"code":-32601,
 "message":"initialize is not supported by this server; supported protocol versions: 2026-07-28"}}
```

v1 SDK 客户端拿到后原样抛出：

```
FAILED: McpError | MCP error -32601: initialize is not supported by this server; supported protocol versions: 2026-07-28
```

## 真正会卡住你的坑：`*/list` 必须带缓存字段

dual-era server 跑通了，但 v2 客户端一上来就把 `tools/list` 判成非法：

```
"error": "Invalid result for tools/list: [
  {\"expected\":\"number\",\"code\":\"invalid_type\",\"path\":[\"ttlMs\"],
   \"message\":\"Invalid input: expected number, received undefined\"},
  {\"code\":\"invalid_value\",\"values\":[\"public\",\"private\"],\"path\":[\"cacheScope\"],
   \"message\":\"Invalid option: expected one of \\\"public\\\"|\\\"private\\\"\"}
]"
```

规范原文的要求是：`server/discover`、`tools/list`、`prompts/list`、`resources/list`、`resources/templates/list`、`resources/read` 返回的 `resultType: "complete"` 结果 **MUST** 带 `ttlMs` 和 `cacheScope`，后者只能是 `"public"` 或 `"private"`。

我一开始只在 `server/discover` 里带了这两个字段——它们语义上属于"缓存协商"，直觉上只跟发现阶段有关。补到每个 list 结果之后，v2 客户端立刻 `"status": "ok"`，`tools/call` 也正常返回。

这里没有渐进降级：字段缺失等于整个结果被拒，现象是"客户端拿不到工具列表"，而 **server 日志里一行错误都没有**。要定位这种问题，只能从客户端侧看原始错误。

顺带一句，`cacheScope` 不是随手填的值。`"public"` 意味着结果可能被客户端或共享网关跨授权上下文复用。`tools/list` 如果按调用者权限过滤过，必须 `"private"`——否则不同 token 之间会互相看到工具集。

## 一个被说反了的常识：脏 stdout

"MCP server 往 stdout 写一行日志就会崩"——我实测没崩。让 server 启动时先 `console.log("era-legacy 启动中，正在加载配置...")`，v1 SDK 客户端和 mcporter（v2 客户端）**都忽略了这行脏数据**，照常连接、列工具、调用工具。在 tap 的原始记录里它就是一条解析失败的行：

```
{"dir":"s2c","msg":{"_raw":"era-legacy 启动中，正在加载配置..."}}
```

正确的结论不是"可以往 stdout 写日志"，而是**别指望客户端替你兜住**。规范写得很直白：stdout 只允许出现合法的 MCP 消息，stderr 才是日志通道（`MAY write UTF-8 strings to stderr for any logging purposes`）。我这台机器上的两代 SDK 恰好都跳过了脏行，但社区里已经有宿主因为 server 的 stdout 噪音直接报 `Invalid JSON-RPC messages`。把日志写 stderr，成本是零。

## 边界

- 全部在 stdio 传输下实测。Streamable HTTP 的版本协商走 `MCP-Protocol-Version` 请求头，回退判据是 `400 Bad Request` 响应体里有没有 modern 错误——我没有部署 HTTP server，这部分只读了规范，未实测。
- 客户端侧只覆盖了官方 v1/v2 SDK 和 mcporter 0.13.10。Claude Code、Claude Desktop 这类宿主没在本机验证；规范对探测与回退用的是 SHOULD / RECOMMENDED，不是 MUST，各家实现可能有差异。
- 缓存字段我按规范填的是保守值，没有做缓存命中率或 TTL 的实测。

## 所以现在怎么做

1. **server 端写 dual-era**：`initialize` 和每请求 `_meta` 都认，直到确认所有客户端都能说 modern。分流成本就是一次判断，不需要维护会话状态。
2. **升级 SDK 前先抓一次真实流量**：一个透传代理比读文档快得多——你的客户端发不发 `server/discover`、协商到哪个版本，抓一次就有答案。
3. **别依赖会话状态**：modern 语义下版本、能力、授权上下文都随请求走。任何"握手时记住的东西"，在切到 modern 的那天都会失效。

MCP 的分层结构与三大原语见站内早前的 [MCP 协议深度解析](https://www.xlabs.club/blog/mcp-protocol-deep-dive/)；MCP Server 与 Agent 工作流相关工具清单在 [awesome-x-ops](https://github.com/xlabs-club/awesome-x-ops#agentic-workflow)。
