---
title: "Grafana k6 性能测试入门：编写、运行和分析负载测试"
description: "使用 Grafana k6 进行 API 性能测试和负载测试的完整指南，涵盖脚本编写、场景配置和 CI 集成。"
summary: ""
date: 2024-03-06T14:07:29+08:00
lastmod: 2024-03-06T14:07:29+08:00
draft: false
weight: 999
toc: true
seo:
  title: "Grafana k6 性能测试入门与实践指南"
  description: "使用 Grafana k6 进行 API 性能测试和负载测试的完整指南，涵盖脚本编写、场景配置和 CI 集成。"
  canonical: ""
  noindex: false
---

[k6](https://k6.io/) 是 Grafana 旗下开源的性能测试工具，使用 JavaScript 编写测试脚本，轻量、CLI 友好、易于集成 CI/CD。它专注于开发者体验和自动化测试，相比 JMeter 更现代化。

## 安装

```bash
# macOS
brew install k6

# Linux
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

## 编写测试脚本

k6 脚本就是一个 JavaScript 文件，包含 `export default function()` 作为每个 VU（Virtual User）的执行体：

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    vus: 10,            // 10 个虚拟用户
    duration: '30s',    // 持续 30 秒
};

export default function () {
    const res = http.get('https://api.example.com/users');
    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });
    sleep(1);
}
```

### 常用内置指标

k6 自动收集以下指标，无需额外配置：

| 指标 | 说明 |
|---|---|
| `http_req_duration` | HTTP 请求总耗时（含 DNS、连接、TLS、响应） |
| `http_req_failed` | 请求失败率 |
| `http_reqs` | 请求总数和速率 |
| `vus` | 活跃虚拟用户数 |
| `iterations` | 迭代次数 |
| `checks` | 自定义检查通过率 |

## 场景配置

k6 支持多种负载模型（Executor），可根据测试目的组合使用：

```javascript
export const options = {
    scenarios: {
        // 阶梯式增加负载
        ramp_up: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 20 },  // 30s 内升至 20 VU
                { duration: '1m', target: 20 },   // 维持 1 分钟
                { duration: '30s', target: 0 },   // 30s 内降至 0
            ],
        },
        // 恒定吞吐量
        constant_rate: {
            executor: 'constant-arrival-rate',
            rate: 50,           // 每秒 50 个请求
            timeUnit: '1s',
            duration: '1m',
            preAllocatedVUs: 20,
        },
    },
};
```

### 执行器选型指南

| 执行器 | 用途 |
|---|---|
| `shared-iterations` | 固定总迭代次数，所有 VU 共享 |
| `per-vu-iterations` | 每个 VU 执行固定次数 |
| `constant-vus` | 固定 VU 数，持续指定时长 |
| `ramping-vus` | 阶段性增加/减少 VU 数 |
| `constant-arrival-rate` | 固定请求速率（吞吐量优先） |

## 自定义指标

```javascript
import { Trend, Counter, Gauge } from 'k6/metrics';

const loginDuration = new Trend('login_duration');
const loginFailures = new Counter('login_failures');

export default function () {
    const res = http.post('https://api.example.com/login', {
        username: 'user',
        password: 'pass',
    });

    loginDuration.add(res.timings.duration);
    if (res.status !== 200) {
        loginFailures.add(1);
    }
}
```

## 断言与阈值

通过 `thresholds` 在命令行输出中直接看到测试通过/失败：

```javascript
export const options = {
    thresholds: {
        http_req_duration: ['p(95)<500'],     // P95 延迟 < 500ms
        http_req_failed: ['rate<0.01'],       // 失败率 < 1%
        'login_duration': ['p(99)<1000'],     // 自定义指标 P99 < 1s
        checks: ['rate>0.95'],                // Check 通过率 > 95%
    },
};
```

阈值不满足时，k6 以非零状态码退出——CI 可直接根据退出码判断测试是否失败。

## 输出与可视化

### 控制台输出

```bash
k6 run --summary-trend-stats="avg,min,med,max,p(95),p(99)" script.js
```

### 输出到 Grafana Cloud

```bash
k6 run --out cloud script.js
# 或使用环境变量
K6_CLOUD_TOKEN=<token> k6 run --out cloud script.js
```

### 输出到 InfluxDB / Prometheus

```bash
# InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 script.js

# Prometheus Remote Write
k6 run --out experimental-prometheus-rw script.js
```

## CI/CD 集成

```yaml
# GitHub Actions 示例
- name: Run k6 test
  uses: grafana/k6-action@v0.3
  with:
    path: tests/k6/load-test.js

# 或直接在容器中运行
- name: k6 load test
  run: |
    k6 run tests/k6/load-test.js
```

### 性能回归检测

结合阈值和 CI，可在每次 PR 中运行基准测试，拦截性能回归：

```javascript
export const options = {
    thresholds: {
        // 与基准对比（需 k6 Cloud 或 xk6-benchmark）
        'http_req_duration{endpoint:/api/search}': ['p(95)<baseline*1.1'],
    },
};
```

## 常用模式

### 参数化数据

```javascript
const users = JSON.parse(open('./users.json'));

export default function () {
    const user = users[__VU % users.length]; // 每个 VU 使用不同的用户
    http.post('https://api.example.com/login', JSON.stringify(user));
}
```

### 请求间依赖（提取 Token）

```javascript
export default function () {
    const loginRes = http.post('https://api.example.com/login', { ... });
    const token = loginRes.json('token');

    const params = {
        headers: { Authorization: `Bearer ${token}` },
    };
    http.get('https://api.example.com/protected', params);
}
```

## 总结

k6 的优势在于脚本即代码（可直接存入 Git）、CLI 友好（CI 零成本集成）、内置丰富的指标和阈值机制。对于 API 性能测试和负载测试场景，是取代 JMeter 的优秀选择。当前限制是 k6 基于 Go+JS 架构，不支持真实浏览器渲染——如需前端性能测试需配合 Grafana Faro 或 Playwright。
