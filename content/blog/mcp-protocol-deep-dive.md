---
title: "MCP 协议深度解析——AI 工具互联的 USB-C 时刻"
description: "MCP（Model Context Protocol）是什么？为什么它是 AI Agent 时代的通用接口标准？深度解析 MCP 架构、Server/Client 模式、资源/工具/提示三大原语，以及与 Function Calling 的本质区别。"
date: 2026-07-09T23:00:00+08:00
draft: false
categories: [AI, Architecture]
tags: [MCP, Model Context Protocol, AI Agent, Tool Integration, LLM, Anthropic]
contributors: []
---

2024 年底，Anthropic 发布了 **MCP（Model Context Protocol）**——一个让 AI 模型安全、标准化地访问外部工具和数据源的开放协议。用 Anthropic 的话说：**MCP 是 AI 应用的 USB-C 接口**。

六个月过去，MCP 已经从 Anthropic 的实验变成了整个 AI 生态的基础设施：OpenAI 发布了自己的 MCP 支持，Google 的 Gemini 接入，微软在 Copilot 生态中推广，开源社区贡献了 500+ MCP Server。

这篇文章不是翻译官方文档，而是我们从实现 MCP Server 和 Client 的过程中，对协议设计哲学的理解。

## 问题：Function Calling 不够吗？

在 MCP 之前，LLM 调用外部工具的标准方式是 **Function Calling**：

```json
// OpenAI 风格 Function Calling
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "search_database",
      "description": "查询用户数据库",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {"type": "string"},
          "limit": {"type": "integer"}
        }
      }
    }
  }]
}
```

这个模式的三个致命缺陷：

**1. Context Window 污染**

每个工具的定义（名称、描述、参数 schema）都要塞进 System Prompt。10 个工具 = 500+ tokens。100 个工具 = 5000+ tokens。而这些 tokens 在**每一轮对话中**都占据上下文窗口——即使用户这次只用了其中 2 个工具。

```
用户问："今天天气怎么样？"

LLM 实际收到的 Prompt：
"你是 AI 助手。你可以使用以下工具：
  1. search_database — 查询数据库 ...
  2. create_ticket — 创建工单 ...
  3. deploy_service — 部署服务 ...
  ... (95 个无关工具定义)
  
  用户：今天天气怎么样？"

浪费了 4500+ tokens 在无关工具上。
```

**2. 工具发现是静态的**

Function Calling 的工具列表在**对话开始时就固定了**。如果对话中间新增了一个数据源或工具——比如用户说「查一下我 GitHub 上的 PR 状态」——你只能让 LLM 返回「我没有这个工具」，然后应用层重新发起一次带新工具的调用。

**3. 安全和权限是「调用前」的**

Function Calling 只有「能调用」和「不能调用」两个状态。如果 LLM 可以调用 `deploy_service`，它就能部署任何服务。没有「需要用户确认」或「只读」的粒度。

## MCP 的设计哲学

MCP 不是 Function Calling 的替代品，它是一个**更高层次的抽象**。核心差异：

| 维度 | Function Calling | MCP |
|------|:---:|:---:|
| **工具注册** | 静态列表，全量注入 Prompt | 动态发现，按需加载 |
| **工具描述** | 文本参数 schema | 结构化 Resource/Tool/Prompt |
| **上下文管理** | LLM 负责 | MCP Client 负责 |
| **权限模型** | 调用前二态 | 资源级 + 操作级 + 人机审查 |
| **传输层** | HTTP/SSE | stdio / Streamable HTTP / WebSocket |
| **状态** | 无状态 | 有状态（Resource 订阅） |

MCP 把工具抽象成三个原语（Primitive）：

### 原语一：Resource（资源）

**Resource 是 LLM 可以读取的数据。** 它不只是「文件」，而是任何结构化或非结构化的数据源。

```json
// MCP Server 暴露的资源
{
  "resources": [
    {
      "uri": "db://users/active",
      "name": "活跃用户列表",
      "description": "过去 30 天内登录过的用户",
      "mimeType": "application/json"
    },
    {
      "uri": "docs://internal/security-policy",
      "name": "安全策略文档",
      "mimeType": "text/markdown"
    }
  ]
}
```

关键设计：**Resource 的 URI 是标准化的**——`protocol://path`。这让 LLM 可以用统一的语义引用任何数据源，而不是记住「用户列表是 `get_users()`，文档是 `read_file()`」。

### 原语二：Tool（工具）

**Tool 是 LLM 可以执行的操作。** 和 Function Calling 的 function 类似，但多了**服务器端描述**——Tool 的能力由 MCP Server 声明，Client 不需要硬编码。

```json
{
  "tools": [
    {
      "name": "create_issue",
      "description": "在 GitHub 仓库中创建 Issue",
      "inputSchema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "title": {"type": "string"},
          "body": {"type": "string"}
        }
      }
    }
  ]
}
```

和 Function Calling 的核心差异：**Tool 列表不在 Prompt 中，在 MCP Client 的内存中**。Client 负责在 LLM 需要时动态注入相关 Tool 的 schema，而不是全部塞进去。

### 原语三：Prompt（提示模板）

**Prompt 是预定义的交互模板。** 比如「帮我 Review 这个 PR」或「为这个函数写单元测试」。这些模板由 MCP Server 提供，确保 LLM 以正确的格式理解用户意图。

```json
{
  "prompts": [
    {
      "name": "code_review",
      "description": "审查 Pull Request",
      "arguments": [
        {"name": "pr_url", "description": "PR 链接", "required": true}
      ]
    }
  ]
}
```

Prompt 模板的好处：你不需要在每次对话中都告诉 LLM「请以这种格式审查代码，关注 1)安全性 2)性能 3)可读性」——这些规则被封装在 MCP Server 的 Prompt 模板中。

## MCP 的架构

```
┌──────────────────────────────────────────┐
│              MCP Host (应用)               │
│  ┌────────────────────────────────────┐   │
│  │        MCP Client (协议层)          │   │
│  │  • 管理多个 MCP Server 连接          │   │
│  │  • 动态发现 Resource/Tool/Prompt    │   │
│  │  • 按需注入上下文到 LLM             │   │
│  └──────┬──────────┬──────────┬───────┘   │
│         │          │          │           │
│    ┌────▼───┐ ┌───▼────┐ ┌──▼──────┐     │
│    │Server A│ │Server B│ │Server C │     │
│    │(GitHub)│ │(Slack) │ │(Database)│    │
│    └────────┘ └────────┘ └─────────┘     │
└──────────────────────────────────────────┘
```

**Client 是核心**。它不是简单的 proxy，而是**上下文管理器**：

1. 收到用户消息 → 分析意图
2. 从所有连接 Server 的 Tool 列表中匹配相关工具
3. 只将匹配的 Tool schema 注入 LLM 上下文
4. LLM 返回 Tool Call → Client 路由到对应 Server 执行
5. 结果返回 LLM → 生成最终回复

## MCP 的传输层

MCP 支持三种传输方式：

### stdio（标准输入输出）

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"]
    }
  }
}
```

MCP Client 以子进程方式启动 Server，通过 stdin/stdout 通信。**适合本地工具**。

### Streamable HTTP

MCP Server 作为 HTTP 服务运行，Client 通过 HTTP 请求获取工具列表、调用工具。支持 Server-Sent Events（SSE）推送。

```
Client ──GET /mcp/tools──▶ Server
Client ◀──200 [{tool1}, {tool2}]── Server

Client ──POST /mcp/call──▶ Server
         {tool: "create_issue", args: {...}}
Client ◀──200 {result}── Server
```

**适合公共服务**，任何支持 HTTP 的环境都可以对接。

### WebSocket（实验性）

双向实时通信，适合需要推送通知的场景。

## 实战：写一个 MCP Server

以下是一个完整的 MCP Server 示例——暴露一个「天气查询」工具：

```python
# weather_server.py
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationCapabilities
import httpx

server = Server("weather-server")

@server.list_tools()
async def list_tools():
    return [
        {
            "name": "get_weather",
            "description": "获取指定城市的当前天气",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称（中文，如 '北京'）"
                    }
                },
                "required": ["city"]
            }
        }
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "get_weather":
        city = arguments["city"]
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.weather.com/v1/current?city={city}",
                params={"apiKey": "YOUR_KEY"}
            )
            data = resp.json()
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"{city}当前温度 {data['temp']}°C，{data['condition']}"
                    }
                ]
            }

if __name__ == "__main__":
    server.run(transport="stdio")
```

启动：

```bash
python weather_server.py
```

然后在 Claude Desktop 的 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "weather": {
      "command": "python",
      "args": ["weather_server.py"]
    }
  }
}
```

Claude 就能查询天气了。

> **注意**：MCP Python SDK 仍在快速迭代。截至 2026 年 7 月，建议固定 SDK 版本。Server 端的异常处理要完善——任何未捕获的异常都会导致 stdio 连接断开。

## MCP vs Function Calling vs Plugin

| 维度 | Function Calling | ChatGPT Plugin | MCP |
|------|:---:|:---:|:---:|
| **标准化** | OpenAI 专有 | OpenAI 专有 | 开放标准 |
| **模型无关** | ❌ OpenAI only | ❌ | ✅ |
| **动态发现** | ❌ 静态列表 | ❌ | ✅ Resource/Tool/Prompt |
| **权限粒度** | 二态 | 二态 | 资源级 + 操作级 |
| **传输层** | API 注入 | HTTP | stdio / HTTP / WS |
| **生态** | OpenAI 生态 | 已弃用 | 开放生态（500+ Server） |

ChatGPT Plugin 被 MCP 取代几乎是必然——Plugin 是封闭生态，MCP 是开放标准。类似 W3C 和 Flash 的关系。

## MCP 的问题与陷阱

### 陷阱 1：Schema 膨胀

MCP Server 可以提供任意数量的 Tool。但如果你把 200 个 Tool 都注册到同一个 Server，Client 的匹配逻辑反而会退化——它不知道哪个 Tool 是相关的，只能把所有 Tool 的描述发给 LLM。

**最佳实践**：一个 MCP Server 暴露 **5-15 个 Tool**。超过 20 个就拆分成多个 Server。

### 陷阱 2：Tool 描述的语言差异

如果你的 MCP Client 是中文应用，但 Server 的 Tool 描述是英文——LLM 在匹配用户中文意图和英文 Tool 描述时会出现理解偏差。

**最佳实践**：Tool 描述和用户 prompt 使用同一语言。如果用户是中文，Tool 描述也用中文。

### 陷阱 3：资源泄露

MCP 使用 stdio 传输时，Server 是子进程。如果 Client 没有正确管理进程生命周期，每个对话都 spawn 一个新的 Server 进程 → 进程泄漏 → 内存耗尽。

**最佳实践**：Client 使用进程池，复用 Server 进程。

### 陷阱 4：Tool 调用依赖链

```
用户："部署最新版本到生产环境"
  → LLM 调用 list_services → 返回 50 个服务
  → LLM 调用 get_version("user-service") → 返回 v2.3.1
  → LLM 调用 deploy("user-service", "v2.3.1")
```

这个链路需要 3 次 Tool 调用。如果 `list_services` 返回超时，整个链路失败。MCP 目前没有内置的 retry 或 fallback 机制——这些需要应用层处理。

## MCP 的未来方向

1. **资源订阅（Resource Subscription）**：Server 推送资源变化（如「数据库有新记录」），Client 主动通知 LLM，而不是 LLM 每次轮询。

2. **Tool 组合（Tool Composition）**：声明式组合多个 Tool 为一个工作流——「部署」= build → test → deploy → health check，LLM 不再需要知道这 4 步的细节。

3. **跨会话记忆**：MCP Server 维护跨会话的状态，让 LLM 能「记住上次我们做到哪了」。

4. **MCP 网关**：统一的 MCP Server 管理和路由层，处理认证、限流、监控、多租户——企业 IAM 的典型能力。

MCP 正在成为 AI Agent 基础设施的**事实标准**——就像 HTTP 成为 Web 的标准、USB-C 成为设备的接口标准。它不是最完美的协议，但它在一个关键时间点出现：当所有人都开始把 LLM 连接到外部工具，但每个人都用不同的方式连接。

---

*协议需要实践检验。参考 [awesome-x-ops MCP 生态](https://github.com/xlabs-club/awesome-x-ops) 获取更多 MCP Server 和 Client 实现。*
