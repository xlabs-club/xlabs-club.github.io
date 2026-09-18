---
title: "LLM 可观测性实测：OpenAI 兼容网关的 usage 靠不靠得住"
description: "5 个模型实测同一台 OpenAI 兼容网关：include_usage 空操作、MiniMax 回传全 0 usage、断连丢 token、prompt_tokens 差 6.8 倍。"
date: 2026-09-19T00:00:00+08:00
draft: false
categories: [AI, DevOps]
tags: [LLM 可观测性, Token 统计, OpenAI 兼容, 成本归因, 流式输出, AI Gateway]
contributors: []
---

把 LLM 成本看板建在客户端拿到的 `usage` 上，会错多少？我在这台内网 OpenAI 兼容聚合网关上跑了约 80 次调用，答案不是"有点误差"，而是字段缺失和语义不一致。

环境：一个 `/v1/chat/completions` 后面挂着多家的模型，2026-09-19 实测，`temperature=0`。同一个 20 字中文问题，非流式 `max_tokens=256` 打 5 个模型；流式另有 3 个模型 × 2 种参数 × 2 次重复的配对调用。全部用标准库 `urllib` 直连，限速 2.3s 避免打限流。

## 一、usage 里能拿到什么，5 个模型给出 5 套字段

| 请求模型 | prompt_tokens | completion_tokens | 其中 reasoning | 正文长度 | finish_reason |
|---|---|---|---|---|---|
| deepseek-v4-flash | 55 | 133 | 108 | 35 字 | stop |
| qwen3.8-flash | 87 | 268 | 251 | 22 字 | stop |
| glm-5.3 | 34 | 256 | 254 | 1 字 | **length** |
| gpt-5.6-luna | 29 | 68 | 38 | 33 字 | stop |
| MiniMax-M3 | 198 | 256 | 256 | **0 字** | **length** |

三字段（prompt / completion / total）是唯一的不变量。其余全按供应商各自的习惯：

- 缓存命中：deepseek 报 `prompt_tokens_details.cached_tokens`，同时另报一组 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`；qwen 在 `prompt_tokens_details` 里给 `cached_tokens` 和 `text_tokens`；MiniMax 只有 `cached_tokens`；gpt-5.6-luna 连 `prompt_tokens_details` 都没有。
- 推理 token 全都计入 `completion_tokens`。所以"输出 token"这个指标跨供应商不可比：同一句话 completion 从 68 到 268，其中 38～256 是推理。
- MiniMax 额外回传 `input_sensitive` / `output_sensitive` / `base_resp`，还带一个 `total_characters` 字段——实测恒为 0，别拿它算字数。

glm-5.3 那一行值得单独看：256 token 预算里 254 个花在推理上，正文只出了 1 个字，`finish_reason=length`。它在 HTTP 层是 200 成功。

## 二、同一句话的 prompt_tokens 差 6.8 倍

上表第一列就是答案：gpt-5.6-luna 29，MiniMax-M3 198。

你没法用一个 tokenizer 离线估算全站成本。同一段文本的输入 token 数取决于路由到哪个供应商，还可能包含供应商自己追加的提示词（MiniMax 那 198 里，有 156 是服务端缓存命中，第一轮真实未命中约 42）。这也解释了为什么"按字符数估成本"在聚合网关下必然偏。

## 三、`stream_options.include_usage` 在这台网关上是个空操作

OpenAI 文档和各家云厂商文档的写法都是：流式下要加 `stream_options: {"include_usage": true}` 才能拿到 usage。

实测 12 次配对调用（deepseek-v4-flash / glm-5.3 / MiniMax-M3 × 加与不加 × 各 2 次），`usage` 块的个数、位置、内容完全一致。不加也一样有。

所以这段配置在这台网关上既没有收益也没有副作用。但结论不要外推：换成直连 OpenAI 或别家的网关，行为可能相反。判断方法是抓一次 SSE 流，数一下 `usage` 非 null 的块有几个，而不是读文档。

## 四、usage 出现在哪个块，4 种形态

| 模型 | 流式块数 | 前序块 | usage 块 |
|---|---|---|---|
| deepseek-v4-flash | 66 | 65 块 `usage: null` | 第 66 块，与 `finish_reason` 同块，没有独立 usage 块 |
| qwen3.8-flash | 31 | 30 块 `usage: null` | 第 31 块，`choices: []`；`finish_reason` 在第 30 块 |
| glm-5.3 | 19 | 18 块 `usage: null` | 第 19 块，`choices: []`；`finish_reason` 在第 18 块 |
| gpt-5.6-luna | 38 | 37 块**连 `usage` 键都没有** | 第 38 块，`choices: []`；`finish_reason` 在第 37 块 |
| MiniMax-M3 | 5 | 4 块 `usage: {"total_tokens":0,"total_characters":0}` | 第 5 块是真值，并带 `finish_reason` |

同一批条件（`max_tokens=64`，`temperature=0`）。块数随生成长度变化，看的是 usage 落在哪里。

deepseek 把 usage 和 `finish_reason` 挤在同一块；另外三家在 `finish_reason` 之后再补一个 `choices` 为空的块。MiniMax 最阴：前面每一块都回传一个**非 null、但全为 0** 的 usage 对象。

这意味着"取第一个非空 usage"和"见到 usage 就认为请求结束"这两种常见写法，在 MiniMax 这条路径上记录下来的 token 数是 0。同时也不能把多块 usage 累加——那是把一次请求记成多次。

正确写法只有一条：取最后一份非空 usage。

```python
usage, finish, content = None, None, []
for line in resp:                     # SSE 逐行
    if not line.startswith(b"data:"):
        continue
    payload = line[5:].strip()
    if payload == b"[DONE]":
        break
    d = json.loads(payload)
    u = d.get("usage")
    if u and u.get("total_tokens"):    # 跳过 MiniMax 的全 0 占位块
        usage = u                      # 只保留最后一份，不累加
    for ch in d.get("choices") or []:
        finish = ch.get("finish_reason") or finish
        content.append((ch.get("delta") or {}).get("content") or "")
```

## 五、客户端断连，这条请求的 token 就消失了

流式下收到 3 个内容块后客户端断开（模拟用户取消、前端切页、超时重试）：

```
deepseek-v4-flash: content 块 3 个, usage 块 0 个
qwen3.8-flash:     content 块 3 个, usage 块 0 个
```

本地一行 token 数都拿不到，而网关侧已经消耗了 prompt token 并生成了一部分内容。把成本真源放在应用日志上，误差就和"用户耐心"正相关——取消得越多，你看到的成本越低。

边界说明：我没有网关侧日志权限，无法验证这些断连请求在服务端是否照常计费。要验证得看网关自己的记账。

## 六、200 成功 + 空正文

把 `max_tokens` 压到 16：

```
deepseek-v4-flash: 正文 0 字, completion_tokens=16 (全为 reasoning), finish_reason=length
MiniMax-M3:        正文 0 字, completion_tokens=16 (全为 reasoning), finish_reason=length
```

MiniMax-M3 在 `max_tokens=256` 下也给出 `content: ""` 的 200 响应（推理吃光预算）。如果监控只有 HTTP 状态码和延迟，这一档请求全是"健康"的。

站内上一篇 [Prompt 回归测试](https://www.xlabs.club/blog/prompt-regression-testing/) 踩过同一颗雷：`content` 为空先看 `finish_reason`，别先怀疑 prompt。那次是回归台，这次是生产网关——同样的判断顺序。

## 七、前缀缓存按前缀失效，改开头等于全价

长 prompt（约 1122 token），同一模型连发 4 次：

| 变体 | prompt_tokens | cached_tokens |
|---|---|---|
| 原样第 1 次 | 1122 | 896 |
| 原样第 2 次 | 1122 | 896 |
| 只改结尾加一句 | 1140 | 896 |
| 只改开头加一个标记 | 1127 | **0** |

缓存是服务端自动做的，客户端不需要传任何参数。命中粒度是前缀长度，不是比例。

表里"第 1 次"其实已经不冷了——同一段前缀在前面的调用里出现过，缓存早已建立，所以第一次就是 896 命中。真正有信息量的是最后一行：改开头一个标记，命中归零。

工程含义直接：稳定内容（system prompt、长文档、规则）放前面，变量放后面。把动态内容拼在开头，等于每次全价。

## 八、响应体里的 model 不是请求的模型

```
请求 deepseek-v4-flash   → 响应 model: deepseek-flash
请求 deepseek-v4.1-flash → 响应 model: deepseek-flash
请求 deepseek-v4-pro     → 响应 model: deepseek-flash
```

三个不同价位的请求名，在响应体里合并成同一个字符串。按响应体 `model` 做成本归因，这条曲线就没有意义了——必须记请求侧的模型名，或者要求网关回传实际路由。

`system_fingerprint` 只有 deepseek 回传，qwen、glm、gpt-5.6-luna、MiniMax 都没有。想靠它检测"后端静默换版本"，在这台网关上不可行。

## 落地清单

1. 流式取**最后一份非空 usage**，不累加、不用第一份，显式跳过全 0 占位块。
2. usage 缺失记 `unknown`，不要记 0。0 会把"断连"和"免费"混为一谈。
3. 成本真源放网关或代理侧；应用日志只作参考，用来看影响面而不是算钱。
4. 输出 token 拆成 reasoning / text 两个指标，跨供应商先分组再比。
5. `finish_reason`（尤其 length 占比）和空正文率进同一张看板。
6. 成本归因按请求侧模型名，不按响应体。

## 边界

- 一台网关、5 个模型、约 80 次调用（含踩到 403 和解析 bug 的重跑）。不同网关的实现差异可能覆盖以上全部结论。
- 没测非 200 响应（429、超时）是否扣 token。
- 缓存命中只报了 token 数，没有代入单价，所以算不出省了多少钱。
- MiniMax 的 prompt_tokens 偏高一部分来自供应商内部链路，具体构成拆不出来。
- 全部为单次观测加少量重复，没有做统计检验；上面的差异都是量级差异。

工具清单见 [awesome-x-ops 的 LLM and Agent Observability 分类](https://github.com/xlabs-club/awesome-x-ops#llm-and-agent-observability)，那里面有采集和评测两端的开源选项。
