---
title: "MCP Streamable HTTP 实测：Accept 少一项就 406，第二次 initialize 会吃掉整个 Server"
description: "实测 MCP SDK 1.30.0：Accept 必须同时含 json 和 SSE；单 transport 只服务第一个客户端，第二个 initialize 被 -32600 拒掉。"
date: 2026-09-23T00:00:00+08:00
draft: false
categories: [AI, MCP]
tags: [MCP, Streamable HTTP, JSON-RPC, AI Agent]
contributors: []
---

MCP 把 SSE 改成 Streamable HTTP 之后，文档把 Accept、`Mcp-Session-Id`、DELETE、405、404 这一整套状态机讲了一遍。我把官方 SDK 1.30.0（Node 26）跑起来实际抓了一遍，结论先放在这里：

- **Accept 少一项就是 406**，错误码 `-32000`，但消息明确写「Client must accept both application/json and text/event-stream」——这是好事。
- **`Mcp-Session-Id` 只在 initialize 响应里下发一次**，之后每个请求/每条流都必须带；不带就是 400，带错/带旧就是 404，DELETE 之后也是 404。
- **会话模式下，`McpServer` 一个实例只接受一次 initialize**。第二个客户端的 initialize 拿到的是 400 + `-32600 "Only one initialization request is allowed"`——这是 SDK 层面的限制，不是协议的限制。
- **协议允许 JSON-RPC batch**，但 SDK 拒绝「一个 batch 里既有 initialize 又有别的方法」，错误消息是「Only one initialization request is allowed」。先把 initialize 单独发完，后续 batch `tools/call` 是正常 200 的。
- **`sessionIdGenerator: undefined` 是另一个世界**：无会话模式下 GET / DELETE 全部 500，连「不支持」都不愿意告诉你。

下面把每一组实验贴出来，curl 形态的你拿去就能复现。

## 环境

- `@modelcontextprotocol/sdk@1.30.0`，Node 26，`node:http` 起服务（不占端口时让内核分配，跑完即退）。
- 客户端就是 `fetch`，没引 `@modelcontextprotocol/client`——目的是看裸 HTTP 行为。
- 服务实现：

```js
const server = new McpServer({ name: "probe", version: "0.1.0" });
server.tool("echo", { text: z.string() }, async ({ text }) => ({
  content: [{ type: "text", text: `echo:${text}` }],
}));

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
});
await server.connect(transport);
createServer((req, res) => transport.handleRequest(req, res)).listen(0, "127.0.0.1");
```

## 实验一：Accept 是硬检查，不是建议

POST `/` 发 initialize，分别给四个不同的 Accept：

| Accept | 状态码 | 结果 |
|---|---|---|
| `application/json, text/event-stream` | 200 | 正常返回 SSE 帧 |
| `application/json` | **406** | `-32000 Not Acceptable: Client must accept both application/json and text/event-stream` |
| `text/event-stream` | **406** | 同上 |
| 缺省 | 500 | 空响应体，没错误消息 |

GET 同理，只是更狠：**GET 只接受 `text/event-stream`**——

```
GET /
Accept: application/json
Mcp-Session-Id: <sid>

HTTP/1.1 406
{"jsonrpc":"2.0","error":{"code":-32000,
 "message":"Not Acceptable: Client must accept text/event-stream"},
 "id":null}
```

所以 MCP client 不能写「Accept: application/json 就行」这种代码。两条 accept 都得列上。

Content-Type 也是硬检查：`text/plain` 拿到 415 `Unsupported Media Type: Content-Type must be application/json`。这一条符合常识，写出来是因为 500 和 406 的差距只在 SDK 里几行，不要把 500 当成「服务器内部错」。

## 实验二：`Mcp-Session-Id` 是单 transport 的生死状

initialize 响应：

```
HTTP/1.1 200
Content-Type: text/event-stream
Mcp-Session-Id: f3952143-bf9e-4507-b3b9-6a769d36b9c3

event: message
data: {"result":{"protocolVersion":"2025-03-26",...},"jsonrpc":"2.0","id":1}
```

之后每个请求的行为：

| 请求 | 状态码 | 说明 |
|---|---|---|
| POST 带正确 session | 200，SSE 帧 | 正常 |
| POST 缺 session | **400** | `-32000 Bad Request: Mcp-Session-Id header is required` |
| POST 带伪造 session | **404** | `-32001 Session not found` |
| POST 带 DELETE 过的 session | **404** | 同上 |
| GET 带 session（Accept: text/event-stream） | 200 | 打开 SSE 流 |
| GET 缺 session | **400** | 同 POST |
| GET 带伪造 session | **404** | 同上 |
| DELETE 带 session | 200 | 关闭会话 |
| DELETE 缺 session | 400 | 同一个 `-32000` |
| DELETE 重复一次 | 404 | 幂等失败语义 |

**DELETE 是真实的**：删完之后 session 立刻失效，再发任何东西都 404。规范里写「server MAY return 405」意思是「可以不支持 DELETE」，但 SDK 是支持 DELETE 的，所以 405 在这个实现里不会出现。

**`Mcp-Session-Id` 的大小写**：Node 的 HTTP 头不区分大小写，`mcp-session-id` 和 `Mcp-Session-Id` 等价。抓包时看到的是小写。

## 实验三：一个 `McpServer` 只接受一次 initialize

这是**坑**。

我用同一个 `McpServer` 实例、同一个 `StreamableHTTPServerTransport`，先让客户端 A initialize 拿到 `s1`，再让客户端 B initialize：

```
HTTP/1.1 400
{"jsonrpc":"2.0","error":{"code":-32600,
 "message":"Invalid Request: Server already initialized"},
 "id":null}
```

-32600 是 JSON-RPC 标准的 Invalid Request。文档里没写这一条，但 SDK 就是这么实现的——一个 server 实例只服务一个逻辑客户端。

**多客户端的正确姿势是给每个会话建一个 transport，挂到同一个 endpoint 上**：

```js
const transports = new Map();

createServer(async (req, res) => {
  const sid = req.headers["mcp-session-id"];
  let transport;

  if (sid && transports.has(sid)) {
    transport = transports.get(sid);
  } else if (!sid && req.method === "POST") {
    // 新会话
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => { transports.set(id, transport); },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    await buildServer().connect(transport);   // buildServer() 返回新实例
  } else {
    res.writeHead(400); res.end(/* Bad Request */);
    return;
  }
  await transport.handleRequest(req, res);
}).listen(...);
```

这是 TypeScript SDK `examples/` 里的标准模式。要点：

- **每个 transport 配一个独立的 `McpServer` 实例**，不是共享。
- `onsessioninitialized` 把新 session 注册进 Map，`onclose` 把它摘掉。
- **DELETE 触发 `onclose`**，Map 自动清，不需要手动管过期。

实测两个会话同时存在、互不影响：s1 DELETE 之后 s2 还能 `tools/call`。

## 实验四：无会话模式（`sessionIdGenerator: undefined`）是半成品

不设 `sessionIdGenerator` 时：

- initialize 200，`Mcp-Session-Id` 不下发（正确）；
- tools/list 200（正确）；
- **GET 直接 500**，没错误消息；
- **DELETE 直接 500**，没错误消息。

规范说 server 可以返回 405 表明不支持 SSE stream / 不支持 DELETE。SDK 没这么做，500 是字面意义的「Internal Server Error」，客户端无法区分「服务器崩了」和「无会话模式不支持」。

如果一定要做无会话 server（比如内部网关只做 tool proxy），**GET / DELETE 你自己在 HTTP 框架层面接住**，返回 405 + `Allow: POST`，别放给 SDK。

## 实验五：JSON-RPC batch 的隐藏约束

标准 JSON-RPC 支持 batch（一个数组里多个请求）。SDK 支持 batch，但**initialize 必须单独发**：

```
POST /
Content-Type: application/json
Accept: application/json, text/event-stream

[
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}},
  {"jsonrpc":"2.0","id":2,"method":"tools/list"}
]

HTTP/1.1 400
{"jsonrpc":"2.0","error":{"code":-32600,
 "message":"Invalid Request: Only one initialization request is allowed"},
 "id":null}
```

但同一个会话上，batch 两个 `tools/call` 是合法的：

```
HTTP/1.1 200
Content-Type: text/event-stream

event: message
data: {"result":{"content":[{"type":"text","text":"echo:a"}]},...,"id":10}

event: message
data: {"result":{"content":[{"type":"text","text":"echo:b"}]},...,"id":11}
```

两个 SSE `message` 事件按序返回。**这个行为对 client 有影响**：你得同时按 id 分发响应，而不是按行序列化处理。

## 实验六：协议版本协商——传一个未来版本会怎么样

发 `protocolVersion: "2999-01-01"` 给 SDK 1.30.0：

```
HTTP/1.1 200
event: message
data: {"result":{"protocolVersion":"2025-11-25",...}}
```

**不抛错，而是返回 server 支持的最新版本**（1.30.0 是 2025-11-25）。客户端要不要再连下去，是它的事——规范允许这么干，但绝大多数 client 拿到不匹配的版本会直接断开。

发老版本 `2024-11-05`：

```
HTTP/1.1 200
data: {"result":{"protocolVersion":"2024-11-05",...}}
```

**回的是老版本**——server 降级接受了。注意响应头里**没有** `Mcp-Protocol-Version`（这个头只对 2025-03-26 之后的版本才强制，老版本协商时不出现在响应头里）。

## 给 MCP Client 的五条硬规约

如果你要写一个能连上任意 MCP Server 的 client：

1. **永远发 `Accept: application/json, text/event-stream`**，少一项就 406。
2. **永远单独发 initialize**，不要 batch。
3. **initialize 响应里如果有 `Mcp-Session-Id`，之后每个请求都带上**（包括 GET、DELETE、notification）。
4. **`protocolVersion` 用 client 支持的版本，不要写「最新」**。server 可能接受也可能拒绝，看它版本新旧。
5. **DELETE 之后再发请求会 404**。client 应该捕获 404 + `-32001` 自动重新 initialize，不要让用户看见红色的错误。

## 给 MCP Server 的四条建议

1. **每个会话一个 transport**，每个 transport 一个 `McpServer` 实例——不要共享。
2. **`onsessioninitialized` / `onclose` 必须实现**，不然 session 表漏泄。
3. **`sessionIdGenerator` 用 `crypto.randomUUID()`**，不要自增。规范要求密码学安全。
4. **无会话模式自己处理 GET / DELETE**。SDK 默认 500 不友好，客户端会当故障处理。

## 边界

- 实验只测了 `@modelcontextprotocol/sdk@1.30.0` 的 Node 实现。Python SDK / Rust rmcp 行为不同（比如 rmcp 的 `SessionId` 是 UUID 类型，校验比 TS 严）。
- 没有测 SSE 流上的服务器主动推送（`notifications/*` 那条线）——本轮只用了 request/response，没有模拟 server 推送。
- 没有测 DNS rebinding / Origin 校验。SDK 有 `enableDnsRebindingProtection` 选项，默认开，但只在 stdio→HTTP 转发场景有意义。
- 错误消息可能随 SDK 版本变化。比如 `-32001 Session not found` 这个码不是 JSON-RPC 标准，是 SDK 自定义的——未来版本可能改。

更多 MCP / AI Agent 工具见 [awesome-x-ops 的 AI Infra 分类](https://github.com/xlabs-club/awesome-x-ops#ai-infra)。站内之前那篇 [MCP 2026-07-28 实测：initialize 握手没了](/blog/mcp-2026-07-28-version-negotiation/) 是从抓包看协议演进；这篇是从 SDK 行为看会话管理和状态机，两边对着看能拼出一个完整图景。
