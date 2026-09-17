---
title: "Prompt 回归测试实测：同一份 prompt 在两个模型上错得不一样"
description: "11 条告警用例、4 个 prompt 版本、2 个模型共 198 次调用：JSON 合法但契约合规 0/33，temperature=0 判决仍翻转。"
date: 2026-09-18T00:00:00+08:00
draft: false
categories: [AI, DevOps]
tags: [Prompt Engineering, 回归测试, LLM 评测, 结构化输出, AIOps, Python]
contributors: []
---

「prompt 改好了」这句话，通常来自一次运行、一个模型、肉眼看输出。

我搭了一个 11 条告警日志的回归台，同一批用例跑 4 个 prompt 版本、2 个模型，共 198 次调用。主表是 `deepseek-v4-flash`，temperature=0.7，每题 3 次重复：

| prompt 版本 | 调用 | 裸输出能 `json.loads` | 满足契约 | 四字段全对 |
|---|---|---|---|---|
| v1：只说「提取字段，用 JSON 输出」 | 33 | 31 | 0 | 0 |
| v1b：v1 + error_type/severity 枚举取值域 | 11 | 11 | 2 | 2 |
| v1c：v1 + 禁止 markdown 包裹 | 11 | 11 | 0 | 0 |
| v2：工程化（取值域 + 类型 + 反例 + null 规则） | 33 | 32 | 32 | 28（85%） |

v1 是最常见的写法：31/33 次输出了合法 JSON，看着挺好。但没有一次满足下游契约——JSON 合法不等于能被消费。

（v1、v2 各 3 次重复；v1b、v1c 是消融版本，单轮 11 个样本。）

## 实验怎么搭的

任务：从告警日志里抽 4 个字段，契约长这样：

```json
{"service": "payment-api", "error_type": "OOM", "error_code": 137, "severity": "P1"}
```

`service` 是字符串或 null，`error_type` 限 7 个枚举值，`error_code` 是 `int|null`，`severity` 限 `P0`–`P3`。

11 条用例覆盖 OOMKilled exit 137、Metaspace 溢出、MySQL 死锁 1213、JWT 过期 401、上游 429、DNS `no such host`、gRPC DeadlineExceeded、ENOSPC errno 28、readiness 探针 503 等，期望值都是在日志文本里能定位的客观事实。

断言分三层，分别统计：

- 格式层：对原始输出做 `json.loads`，不先剥 markdown 代码块——下游解析器也不会剥。
- 契约层：字段名、类型、枚举值。
- 语义层：字段值是否等于期望。

控制变量：v1 与 v2 都是单条 user message，不动 system prompt，温度、max_tokens、模型固定。实验台只用 Python 标准库（`urllib` + `ThreadPoolExecutor`），先把数字算出来，再谈要不要上评测平台。

限流是设计的一部分：网关 30 req/min，本地把最小间隔设成 2.3 秒、并发 4，避免 429 重试拿回空输出——这类脏数据会记到 prompt 的账上，必须先按调用层噪声剔除。

## 发现一：两个模型的头号失败模式完全不同

同一份 v1 prompt 换模型：

| | `deepseek-v4-flash` | `glm-5.3-flash` |
|---|---|---|
| v1 输出被 markdown 包裹 | 2/33 | 11/11 |
| v1 能 parse | 31/33 | 0/11 |
| v1b（只加枚举取值域）能 parse | 11/11 | 0/11 |
| v1c（只禁 markdown 包裹）能 parse | 11/11 | 11/11 |

`glm-5.3-flash` 的 v1 输出每一条都以 ```` ```json ```` 开头，deepseek 只有 2/33 这样。加一句「不要用 markdown 代码块包裹」，GLM 从 0/11 变 11/11；同一句话对 deepseek 几乎无事发生——它本来只有 2/33 被包裹，加完规则的 11 次里是 0 次。

反过来，只加枚举取值域（v1b），deepseek 的 `error_type` 准确率从 0/33 到 11/11；GLM 还是 0/11，因为输出仍被包裹，改的那部分根本没机会生效。

同一句话在两个模型上的边际收益差 100%。所以「优化 prompt」之前先做一件事：按失败模式分类统计现有输出，再决定改哪一句。

顺带一个反例：GLM 的 v1b 有 1 次在 JSON 前加了一行 `## 分析结果`（包裹率 10/11，不是 11/11）。用宽松正则清洗模型输出只能对付已知模式；真正的护栏是让模型不产生这类输出。

## 发现二：修好一处，弄坏另一处

v1b 把 `error_type` 修到 11/11，同时把 `error_code` 从 v1 的 13/33 打到 2/11。

原因不在枚举，在类型。契约要求 `int|null`，v1 的 c01 输出数字 `137`，v1b 输出字符串 `"137"`。同一模型、同一用例，只多了一条枚举约束。

v1b 的 11 次 `error_code` 实际输出：

```
c01 "137"  c05 "1213"  c06 "401"  c10 "28"  c11 "503"    ← 数字被序列化成字符串
c02 "java.lang.OutOfMemoryError: ..."   c03 "Metaspace"   ← 文本塞进数值字段
c08 "NO_SUCH_HOST"  c09 "DeadlineExceeded"
c04 null   c07 429                                         ← 只有这两次满足契约
```

契约写的是 `int|null`，`"137"` 就是违约。判定在 Python 侧做（`isinstance(obj["error_code"], int)`），强类型客户端我没跑——但 JSON 契约里的类型不是可以商量的事。

而只看「模型答得对不对」，这 11 次里 `service`、`error_type` 几乎全对，很容易签字通过。

这就是 prompt 变更必须过回归的原因：**改动的副作用不是局部的**。模型的注意力是共享资源，你在「枚举值必须从这 7 个里选」上加了约束，它就可能把这份「照规矩输出」的理解挪到别的字段上，顺手把数字加了引号。单看一遍输出发现不了，因为两边的输出都很「像样」。

## 发现三：temperature=0 不代表可复现

v2 在 temperature=0 下每题采样 4 次，temperature=0.7 下每题 3 次（P=通过，F=失败）：

| 用例 | T=0（4 次） | T=0.7（3 次） |
|---|---|---|
| c04 JDBC 连接失败 | P F P P | P F P |
| c05 MySQL 死锁 1213 | F P P F | F P P |
| c07 上游 429 | F F P F | F F F |
| 其余 8 条 | 4/4 全过 | 3/3 全过 |

temperature=0 下依然有 3 题判决翻转，但原因各不相同，不能都算在模型头上：

- c04 在 T=0.7 的那次 F 是 `content` 为空、`finish_reason=length`——输出被 max_tokens 截断，调用层噪声。
- c04 在 T=0 的那次 F 是正常结束（`stop`），模型把 DB 连接失败判成了 `TIMEOUT`——模型自身的不确定性，同时暴露用例有歧义：`Communications link failure` 读成超时也说得通，期望值是按「根因是数据库连接」写死的。
- c05 的 F 是漏取 1213，`error_code` 填了 `null`。
- c07 是**我的用例写错了**。日志里同时写了 `upstream search-api returned 429` 和 `client search-web 触发限流`，两种理解都成立，期望值只认 `search-api`；默认 max_tokens 下 7 次采样里 6 次判给了 `search-web`。

处理方式是改用例文本、把服务归属写死，不是放宽断言。放宽断言就是把门禁改成常绿——它从此再也拦不住真的回归。

## 发现四：推理模型的思维链也算在 max_tokens 里

同一批用例、同一份 v2 prompt，把 `max_tokens` 从 8192 降到 2048 再跑 11 次：

```
finish_reason=length  6/11，这 6 次 content 全是空字符串
reasoning token 其中 5 次恰好停在 2048 上限，1 次 2047
通过 5/11：截断的 6 题全挂，没截断的 5 题全过（同批单轮基线 9/11）
```

不是模型不会答，是思维链把预算吃完了。默认 8192 下的 143 次 deepseek 调用，平均每次 2398 token，其中思维链 2029，占 84.6%，平均延迟 9.6 秒。4 个字段的抽取任务，钱主要花在推理上。

这也直接给出回归频率的算法：一轮 11 题 × 3 次 = 33 次调用、约 7.9 万 token，进 CI 不心疼；用例集涨到 200 条就是 600 次调用、约 144 万 token 一轮，那时要决策的不是跑不跑，是多长时间跑一次。

排错顺序记住一条：`content` 为空先看 `finish_reason`，别先怀疑 prompt。

顺带一个观测口径的坑：同一个网关下 `glm-5.3-flash` 的 44 次调用里 `reasoning_tokens` 字段完全缺失（不是 0），平均 1352 token。拿 deepseek 的口径去套 GLM 的成本估算会错。

## 落地：一个最小回归台

```
prompt-regression-lab/
├── cases.py          # 用例：日志文本 + 期望值（客观事实）
├── prompts/
│   ├── v1.txt        # 每个版本一个文件，Git 就是 prompt 的版本历史
│   └── v2.txt
├── plan.json         # 跑哪些 (model, version, temperature, repeats)
├── run.py            # 执行 + 限流 + 判定
└── analyze.py        # 按层聚合：parse / 契约 / 语义 / 漂移
```

`run.py` 判定部分的精简版：

```python
def judge(raw, case):
    r = {"parse_ok": False, "schema_ok": False, "pass": False}
    try:
        json.loads(raw.strip())        # 不剥 markdown 包裹
    except Exception:
        return r                       # 格式层直接判负
    obj = json.loads(raw.strip())
    r["parse_ok"] = True
    r["schema_ok"] = (
        set(obj) == {"service", "error_type", "error_code", "severity"}
        and obj["error_type"] in {"OOM", "DB", "AUTH", "NETWORK", "TIMEOUT", "RATE_LIMIT", "OTHER"}
        and (obj["error_code"] is None or isinstance(obj["error_code"], int))
        and obj["severity"] in {"P0", "P1", "P2", "P3"}
    )
    r["pass"] = r["schema_ok"] and obj["service"] == case["service"] \
        and obj["error_type"] == case["error_type"] and obj["error_code"] == case["error_code"]
    return r
```

v2 里真正干活的是两段规则（节选，示例部分省略）：

```
# 取值规则
- service：出错服务的名字。pod 名要去掉 ReplicaSet hash 后缀（payment-api-7d9f4c8b6-x2knp → payment-api）
- error_type 只能取以下之一：OOM | DB | AUTH | NETWORK | TIMEOUT | RATE_LIMIT | OTHER
- error_code：只填日志中明确出现的 HTTP 状态码、进程 exit code 或 errno 数值；没有就填 null
  端口号、耗时毫秒数、行号、重试次数都不是 error_code
- 一条日志里出现多个错误时，填离根因最近的那个

# 硬性约束
- 回复的第一个字符必须是 {，最后一个字符必须是 }
- 不要用 markdown 代码块包裹，不要输出解释、注释或任何前后缀
```

这些规则不是凑数：v1 的 33 次里 `severity` 出现过 7 种写法（critical 17 / warning 8 / WARN 3 / ERROR 2 / CRITICAL 1 / error 1 / high 1），0/33 命中 `P0`–`P3`；v1 有 2/33 次把 StatefulSet 的 `log-collector-0` 原样返回；`error_code` 在 v1 和 v1b 里都出现过用文本填数值字段（`GC overhead limit exceeded`、`no such host`、`DeadlineExceeded`）。规则不写死，模型就按自己的常识补。

v2 是「一次改到位」的版本，我只对枚举取值域、禁 markdown 包裹做了单条消融，其余几段的收益没有单独归因——把它们从 v2 里拆出来再跑一遍才知道谁在干活。

## 断言分层与门禁

| 字段类型 | 断言方式 | 失败时先改什么 |
|---|---|---|
| 格式层（能否 parse） | 严格 | prompt：禁 markdown 包裹、禁前后缀 |
| 契约层（类型、枚举） | 严格 | prompt：写死取值域，写明类型 |
| 自由文本（`service`） | 严格，但期望值必须无歧义 | 先用例文本，再 prompt |
| 主观字段（`severity`） | 只校验枚举，不做精确断言 | 不进门禁 |

门禁三条：

1. **单次运行不下结论。** 看「k 次重复全过」的题数，不看单次 pass 率。本次 v2 在 T=0 和 T=0.7 下都是 11 题里 8 题全过，两个温度的数字一样，而中间有 3 题在翻转。
2. **锁定子集零容忍。** 挑 5–8 条确定性最强的用例，任何一次失败就拦；其余用例看 k 次全过率。规则简单到没人会想去绕过它。
3. **失败分类先于归因。** 把 `finish_reason=length`、空 `content`、限流失败先归成调用层噪声，再统计 prompt 指标。

## 边界

- 只测了两个模型、一类任务（日志字段抽取）。跨任务、跨模型的推广是推测，不是结论。
- v1b、v1c 各只跑了 1 轮（11 个样本）；GLM 每个版本也只有 1 轮，只能看模式差异（包裹率 11/11 与 0/11），看不出漂移。但 parse 0/11 与 11/11、`error_code` 13/33 与 2/11 这种量级的差别，不需要统计检验。
- T=0 的 4 次采样跨了两个批次（1 + 3），批次间波动没能单独分离。
- 没测 `seed` 参数；没有验证同一模型名背后被换版本造成的漂移。
- 11 条用例的规模测不出 3 个百分点级别的改进——那需要上百条用例和更多重复次数。
- 全部调用走同一个 OpenAI 兼容网关，自部署推理栈的数值不确定性未验证。

## 结论

prompt 变更的风险不在「这次改得对不对」，在「这次改动的影响是不是局部的」。v1b 修好 `error_type` 的同时打断 `error_code`，单次目测看不出来——只有 k 次重复的分层回归能把它变成一条红色断言。

站内早前的 [AI Code Review 横评](https://www.xlabs.club/blog/ai-code-review-tools-comparison/) 有一致的坑：AI 审查输出的格式漂移比判断错误更难发现。prompt 版本管理、评测集与回归门禁的工具清单，见 [awesome-x-ops 的 LLM and Agent Observability 分类](https://github.com/xlabs-club/awesome-x-ops#llm-and-agent-observability)。
