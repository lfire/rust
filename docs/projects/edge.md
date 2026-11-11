---
title: 第 65 讲 · 边缘与 Serverless
description: 把 Rust 编译到 WASI / 边缘运行时，理解冷启动、能力限制与和容器 Serverless 的取舍。
---

<StageHeader stage="L5 · 第 65 讲" level="★★★★☆" time="65 分钟" goal="部署一个跑在边缘节点的 Rust WASM 函数" prereq="L4 异步 + 第 58 讲 WASM 基础" />

# 第 65 讲 · 边缘与 Serverless

**场景**：给全球用户提供一个轻量的 API（短链跳转、图片元信息、A/B 分桶、请求签名校验）。用传统容器部署要在多个区域各起服务；用边缘运行时，同一份 WASM 会被调度到离用户最近的节点，冷启动成本极低。

## 三种部署形态对比

| 形态 | 启动 | 能力 | 分发 | 适合 |
| --- | --- | --- | --- | --- |
| 常驻容器 / K8s | 秒～分钟 | 完整 | 镜像 | 长连接、有状态、重计算 |
| 容器 Serverless（FaaS） | 数百 ms～数 s | 完整 | 镜像 / zip | 偶发任务、需要系统能力 |
| **边缘 WASM** | **通常 < 5 ms** | **受宿主能力集限制** | **一个 .wasm** | 请求改写、鉴权、轻量计算、全球低延迟 |

<Callout type="idea" title="和第 58 讲 WASM 的区别" text="浏览器里的 WASM 受 JS 宿主与 DOM API 约束，边缘 WASM 受 **WASI / 平台 SDK** 约束：没有本地文件系统、不能随便开 TCP socket、CPU 时间与内存有上限、但有平台提供的 KV / 缓存 / 定时触发器。同一个 `wasm32` 目标，宿主给的能力完全不同 —— 这正是本阶段强调「宿主维度」的原因。" />

## 两个 wasm 目标别混

| 目标 | 宿主 | 标准库能力 | 典型用途 |
| --- | --- | --- | --- |
| `wasm32-unknown-unknown` | 浏览器 / 自定义嵌入器 | 无系统 IO，靠 JS 胶水 | [第 58 讲 WASM 工具链](/projects/frontend/wasm.md) |
| `wasm32-wasip1` / `wasm32-wasip2` | WASI 运行时（Wasmtime、边缘平台） | 受 capability 约束的 fd / env / clock | 命令行工具、Serverless、插件系统 |

```bash
rustup target add wasm32-wasip1
cargo install wasmtime-cli      # 本地跑 WASI 模块
```

## 工具链与结构

```bash
npm install -g wrangler         # 以 Cloudflare Workers 为例
cargo install worker-build      # 或直接用 worker-rs 模板
```

```toml
[package]
name = "edge-guard"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
worker = { version = "0.5", features = ["http"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```text
edge-guard/
├── Cargo.toml
├── wrangler.toml
├── src/lib.rs
└── build/            # 构建产物
```

<StepBox title="分步实现" :steps='[{"title":"定义 fetch 入口","body":"用 `#[event(fetch)]` 标记 async 函数，接收 Request、返回 Result&lt;Response&gt;。","tip":"这是边缘运行时的 main，但每个请求都会触发一次。"},{"title":"读路由与请求头","body":"按 path 分发，从 headers 里取签名与时间戳。","tip":"边缘函数无状态，别用 static mut 存数据。"},{"title":"接平台 KV","body":"用 `env.kv(...)` 取绑定，读写短链映射或限流计数。","tip":"KV 是最终一致的，别当事务数据库用。"},{"title":"返回响应","body":"`Response::from_json(...)` 或 `Response::ok(...)`，记得设置 Cache-Control。","tip":"缓存头是边缘场景的性能关键。"},{"title":"本地预览与部署","body":"`npx wrangler dev` 本地跑，`npx wrangler deploy` 发布，用 curl 验证。","tip":"先在 dev 里测冷启动与错误分支。"}]' />

## 完整代码：`src/lib.rs`

```rust
use serde::Serialize;
use worker::*;

#[derive(Serialize)]
struct Info {
    path: String,
    country: String,
    cached: bool,
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    // 只允许 GET，其他方法直接 405
    if req.method() != Method::Get {
        return Response::error("Method Not Allowed", 405);
    }

    let path = req.path();
    let country = req
        .headers()
        .get("CF-IPCountry")?
        .unwrap_or_else(|| "unknown".into());

    // 短链跳转：从平台 KV 里查目标地址
    if let Some(slug) = path.strip_prefix("/s/") {
        let kv = env.kv("LINKS")?;
        return match kv.get(slug).text().await? {
            Some(target) => Response::redirect(target.parse()?),
            None => Response::error("短链不存在", 404),
        };
    }

    let info = Info { path, country, cached: false };
    let mut resp = Response::from_json(&info)?;
    resp.headers_mut()
        .set("cache-control", "public, max-age=30")?;
    Ok(resp)
}
```

```toml
# wrangler.toml
name = "edge-guard"
main = "build/worker/shim.mjs"
compatibility_date = "2025-01-01"

[[kv_namespaces]]
binding = "LINKS"
id = "<在控制台创建的 KV namespace id>"
```

```bash
npx wrangler dev                 # 本地：http://127.0.0.1:8787
npx wrangler deploy              # 发布到边缘网络
curl -i https://edge-guard.<你的子域>.workers.dev/hello
```

## WASI 版：同一份 Rust 逻辑换个宿主

如果不是边缘平台，而是通用 WASI 运行时，可以写一个标准的命令行模块：

```rust
// src/main.rs，目标 wasm32-wasip1
use std::{env, io::{self, Read}};

fn main() -> io::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let needle = env::args().nth(1).unwrap_or_default();
    let hits = input.lines().filter(|l| l.contains(&needle)).count();
    println!("{}", hits);
    Ok(())
}
```

```bash
cargo build --target wasm32-wasip1 --release
echo -e "rust\nrust\ngo" | wasmtime target/wasm32-wasip1/release/edge-guard.wasm rust
# 输出 2
```

<Callout type="warn" title="能力是显式授予的" text="WASI 模块默认拿不到任何目录、环境变量或网络能力，运行时启动时才通过参数授予。这比容器「默认全能、靠防火墙收口」安全得多，但也意味着本机跑通的代码到了平台可能因为缺少某个 capability 而失败 —— 部署前务必按平台文档核对能力清单。" />

## 冷启动与体积

| 指标 | 容器 Serverless | 边缘 WASM |
| --- | --- | --- |
| 冷启动 | 通常 200 ms – 数秒 | 常在 1–5 ms 量级 |
| 产物 | 镜像（几十～几百 MB） | `.wasm`（几百 KB 级） |
| 实例隔离 | 容器 / microVM | 每个请求独立沙箱 |
| 状态 | 可在实例内存缓一小会儿 | **无状态**，必须走平台 KV / Durable Object |

优化体积和第 58 讲一样：`opt-level = "s"`、LTO、`strip`、`wasm-opt -Oz`。边缘平台通常对产物大小有上限，引入重型依赖（正则引擎、完整 serde 生态）前先看打包结果。

<Quiz no="65-1" q="`wasm32-unknown-unknown` 与 `wasm32-wasip1` 的主要区别是？" :options='["前者更快", "前者面向浏览器 / JS 胶水，后者面向 WASI 运行时并受 capability 约束", "后者只能跑在浏览器", "两者完全一样"]' answer="1" explain="目标三元组决定了能调用哪套系统接口；同一个 crate 换目标后，IO 相关代码可能要改写。" />

<Quiz no="65-2" q="边缘函数为什么不应该用全局可变静态变量缓存数据？" :options='["Rust 不允许 static", "实例随时创建销毁、请求可能落在不同节点，状态不可靠", "会让产物变大", "编译器会报错"]' answer="1" explain="边缘是无状态、多实例模型，持久化状态必须交给平台 KV / 缓存 / Durable Object。" />

<Exercise title="加一个限流" task="用平台 KV 记录每个国家（CF-IPCountry）在 60 秒窗口内的请求数，超过 10 次返回 429；注意 KV 是最终一致的，说明这个方案的局限与更合适的替代。" hints='["key 可以用 country:window 组合，value 存计数字符串", "读 → 加一 → 写回三步不是原子的", "Durable Object 或平台原生 Rate Limiting API 才能保证强一致"]' solution="let key = format!(&quot;{}:{}&quot;, country, now / 60);\nlet kv = env.kv(&quot;RATE&quot;)?;\nlet count: u32 = kv.get(&amp;key).text().await?.and_then(|s| s.parse().ok()).unwrap_or(0);\nif count &gt;= 10 { return Response::error(&quot;Too Many Requests&quot;, 429); }\nkv.put(&amp;key, (count + 1).to_string())?.execute().await?;" explain="读改写非原子 + KV 最终一致 → 高并发下会超发；生产应换成平台限流 API 或单实例 Durable Object。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 本地 wasmtime 能跑、平台报错 | 平台能力集更窄，检查 fs / env / socket 是否被使用 |
| 冷启动变慢 | 产物过大、初始化里做了重计算；把工作挪到请求内并缓存 |
| 数据在节点间不一致 | 用了进程内状态；改用平台 KV / Durable Object |
| `wasm-opt` 后行为异常 | 检查是否用了依赖栈展开的 crate，降级优化等级 |
| 时间 / 随机数不可用 | 边缘沙箱可能限制 `SystemTime::now()` 与 getrandom，用平台注入的 API |

## 扩展挑战

- 用 `wasmtime` 在自己服务里嵌一个 WASI 沙箱，给第三方插件做隔离执行（可对照 [第 44 讲](/projects/image-server.md) 的 tower 中间件分层）。
- 把 [第 59 讲 前端 WASM 实战](/projects/frontend/wasm-practice.md) 与边缘 WASM 抽成共享 crate，体会「同一份逻辑、两种宿主」。
- 用 `wasm-component-model` / WIT 定义宿主与模块的接口契约。
- 加定时触发器（cron）与队列消费者，做完整的边缘数据管道。
- 在 CI 里检查 `.wasm` 体积，超过阈值就失败。

<CheckList id="edge-check" title="验收清单" :items='["npx wrangler dev 能本地响应请求", "短链跳转读到了平台 KV", "能说清 WASI 与浏览器 WASM 的能力差异", "知道边缘函数为什么必须无状态", "记录了冷启动 / 产物体积数据"]' />

[下一个场景：第 66 讲 嵌入式与图形 →](/projects/embedded.md) · [回到场景地图 →](/projects/)
