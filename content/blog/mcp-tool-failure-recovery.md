---
title: "MCP 工具挂了之后：empty_ok 比报错更危险，4 个模型实测"
description: "3 种失败回灌 × 4 模型实测 MCP 工具失败后的行为：empty_ok 时 MiniMax 编出 4 个原因，deepseek 协议层直接 400。"
date: 2026-10-06T00:00:00+08:00
draft: false
categories: [AI, MCP]
tags: [MCP, Tool Use, Function Calling, LLM 错误处理, AI Agent, 多轮对话]
contributors: []
---

MCP 工具调用失败之后，宿主把错误回灌给模型，模型会怎么反应？这个问题的答案决定你的 Agent 在生产环境里是「报错后重试」还是「编一段看似合理的话糊弄过去」。

我搭了一个 12 工具的 MCP server（桩实现），让 4 个模型在真实 MCP 循环里跑失败场景，最多 3 轮，记录每一次调用和最终结局。三种失败回灌方式：

- **informative**：`isError=true`，content 里带可行动线索（`Error: pods "payment-api-9f8e7d6c5-x9zzz" not found in namespace "prod"`）
- **generic**：`isError=true`，但错误信息没线索（`Error: upstream request failed`）
- **empty_ok**：`isError=false`，content 为空数组——协议层「成功」，语义层什么都没说

## 结局表

| 模型 | informative | generic | empty_ok |
|---|---|---|---|
| deepseek-v4-flash | **http_error_400**（1 轮就断） | http_error_400 | http_error_400 |
| qwen3.8-flash | loop_exhausted | loop_exhausted | loop_exhausted |
| MiniMax-M3 | loop_exhausted | loop_exhausted | **text_only（编故事）** |
| gemini-3.8-flash | loop_exhausted | loop_exhausted | loop_exhausted |

`loop_exhausted` 的意思是模型在 3 轮内不断换工具重试，没给出最终答案。`text_only` 的意思是模型放弃调用工具，直接输出文本。

## 发现一：empty_ok 是幻觉触发器

MiniMax-M3 在 empty_ok 场景下的输出：

> 以下是 `prod` 命名空间下 `payment-api-9f8e7d6c5-x9zzz` 最近 200 行日志的拉取结果：
>
> **日志内容为空(0 行)**
>
> 可能的原因有以下几种：
> 1. **Pod 刚刚启动，还没有产生任何日志输出** — 如果应用本身没有主动打日志，或者日志都被输出到了 stdout 之外的某些文件，这里就会取不到。
> 2. **应用把日志重定向到了文件而非 stdout/stderr** — Kubernetes `kubectl logs` 只能拿到容器标准输出流的内容。
> 3. **日志采集走了 sidecar/agent，容器内 stdout 本身没东西** — 例如日志被 stdout 转发到了某个日志收集器，`kubectl logs` 取不到。
> 4. **Pod 处于 CrashLoopBackOff / 已重启过多次** — 当前容器实例的日志为空

这段输出读起来像资深 SRE 的排查思路，但**每一个字都是编的**。工具协议层返回了 `isError=false`，content 为空——模型把「空结果」解释成了「日志为空」，然后基于这个虚假前提展开推理。

empty_ok 的问题在于：它**不是错误**，但**没有信息**。模型收到的是一个「成功但无内容」的信号，而 LLM 的训练目标让它必须给出有意义的回复，于是它开始脑补。

informative 场景下 MiniMax 没有编故事，而是正经地调了 `k8s_list_pods` → `k8s_list_pods` 尝试换路径。有线索的错误反而引导了正确的恢复行为。

## 发现二：deepseek 的 400 是客户端问题，不是模型问题

deepseek-v4-flash 在三种失败场景下全部 `http_error_400`，第一轮就断。抓包看请求体：

```json
{
  "error": {
    "message": "The `reasoning_content` in the thinking mode must be passed back to the API.",
    "type": "invalid_request_error"
  }
}
```

deepseek 的 thinking 模式要求： assistant 消息里的 `reasoning_content` 必须在后续调用中原样回传。实验代码里 `assistant_msg()` 确实做了这个处理，但失败场景的 trace 里有 `reasoning_content` 为空的 assistant 消息——某些轮次 deepseek 返回了空 reasoning，导致下一轮请求缺了这个字段。

这不是 MCP 的问题，是 deepseek thinking 模式 + 工具调用 + 多轮对话的组合坑。如果你的 Agent 框架用 deepseek，遇到工具调用失败后的多轮恢复，**必须检查 reasoning_content 是否被正确透传**。

## 发现三：qwen 和 gemini 的「重试」是无效循环

qwen3.8-flash 在 informative 场景下的 trace：

```
turn 0: k8s_get_pod_logs(namespace=prod, pod=payment-api-9f8e7d6c5-x9zzz, tail=200)
turn 1: k8s_list_pods(namespace=prod, labelSelector=app=payment-api)
turn 2: k8s_list_pods(namespace=prod)
```

pod 不存在 → 换 list 找 pod → list 没找到（因为 label 不对）→ 再 list 一次不带 label。3 轮用完，没有结论。

gemini-3.8-flash 在 informative 场景下：

```
turn 0: k8s_get_pod_logs(...)
turn 1: k8s_list_pods(namespace=prod)
turn 2: k8s_list_deployments(namespace=prod)
```

pod 找不到 → list pods → list deployments。它把「pod 不存在」理解成了「也许 deployment 层面有问题」，方向错了。

两个模型的共同问题：**有线索的错误没有触发「放弃当前路径」的决策**。它们把「换工具」当成了「解决错误」本身，而不是「验证假设」的手段。

## 发现四：命名空间猜测——模型的性格差异

多轮实验 MT2：用户问「payment-api-7d9f4c8b6-x2knp 现在 CPU 和内存用了多少」，文本里没有 namespace。

| 模型 | 行为 | 轮数 |
|---|---|---|
| deepseek-v4-flash | default → payment → payments → prod → production → kube-system → prod | 10 轮 |
| qwen3.8-flash | default → production → staging → default → payment | 6 轮 |
| MiniMax-M3 | **直接反问：「请问部署在哪个命名空间？」** | 0 轮 |
| gemini-3.8-flash | default → payment → production → prod | 7 轮 |

MiniMax 的 0 轮反问是**最优策略**：它识别出信息缺口，选择不猜。deepseek 和 qwen 的枚举是**最劣策略**：它们把「猜 namespace」当成了「解决问题」，消耗大量 token 和延迟，最终可能还是错的。

gemini 第 2 轮就试到 prod，但那是运气，不是策略。

## 工程清单

1. **工具失败时，回灌必须有可行动线索**。`Error: upstream request failed` 是垃圾输入，`Error: pods "xxx" not found in namespace "prod"` 能帮助模型换路径。
2. **empty_ok（协议层成功但语义为空）必须显式标记**。在宿主层把空结果转成 `isError=true` + 提示文本，或者至少加一条 `content: [{"type":"text","text":"查询成功但无结果"}]`。否则模型会编原因。
3. **deepseek thinking 模式 + 多轮工具调用，检查 reasoning_content 透传**。缺了就是 400，一轮就断。
4. **信息缺口时，「反问」比「枚举」好**。如果工具 schema 里 namespace 是必填，而用户没给，好的 Agent 应该问，而不是猜。
5. **3 轮重试上限要配死**。qwen 和 gemini 的 loop_exhausted 说明没有上限时模型会一直换工具，消耗 token 不产出结论。

## 边界

- 4 个模型、3 种失败形态、12 个工具，样本量小。不同 SDK 版本、不同 gateway 的行为可能不同。
- 工具是桩实现，返回固定文本。真实 K8s API 的错误格式可能触发不同的模型行为。
- 没测「empty_ok 但 content 里有空字符串」的变体——那种情况可能更隐蔽。
- MiniMax 的「反问」策略只在 s12 工具集下出现；换 s6 或 s24 是否一致，没测。

工具清单见 [awesome-x-ops 的 AI Coding 分类](https://github.com/xlabs-club/awesome-x-ops#ai-coding)，里面有 MCP 相关的开源实现。
