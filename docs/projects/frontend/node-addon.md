---
title: 第 62 讲 · napi-rs 写 Node 原生插件
description: 用 N-API 把 Rust 模块暴露给 Node.js，理解 SWC / Rspack 一类前端工具链的底层形态与异步回调桥接。
---

<StageHeader stage="L5 · 第 62 讲" level="★★★★★" time="90 分钟" goal="写出可被 require/import 的 Rust 原生模块" prereq="L3 + L4 线程 + 基础 Node" />

# 第 62 讲 · napi-rs 写 Node 原生插件

**场景**：前端构建链路里有个计算很重的步骤（批量内容哈希、模板转换、路径解析），JS 实现成了 CI 瓶颈。用 Rust 写成一个 `.node` 原生模块，JS 侧像调用普通包一样 `require` 它 —— 这正是 SWC、Rspack、Biome、Oxc 等新一代前端工具的做法。

## 三条加速路线怎么选

| 路线 | 产物 | 能进浏览器 | 系统能力 | 分发复杂度 |
| --- | --- | --- | --- | --- |
| 纯 JS | `.js` | ✅ | 受沙箱限制 | 最低 |
| WASM（[第 58 讲](/projects/frontend/wasm.md)） | `.wasm` | ✅ | 受 WASI 能力限制 | 低（一份产物通用） |
| **N-API 原生插件** | `.node` | ❌ | **完整（文件 / 线程 / 网络）** | 高（按平台 × Node ABI 分别编译） |

<Callout type="idea" title="N-API 的关键价值" text="它是 Node 官方稳定的 C ABI：插件按 N-API 编译一次，就能跨多个 Node 大版本运行，不必随每个 Node 版本重编。`napi-rs` 帮你在 Rust 侧生成这层胶水，免得手写 unsafe FFI。" />

## 工具链与结构

```bash
node -v                        # 18+
npm install -g @napi-rs/cli
napi new hash-kit              # 或手动建下面结构
```

```toml
[package]
name = "hash-kit"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["napi6", "tokio_rt"] }
napi-derive = "2"
```

```json
// package.json（关键字段）
{
  "name": "@your-scope/hash-kit",
  "main": "index.js",
  "files": ["index.js", "index.d.ts"],
  "napi": { "name": "hash-kit", "triples": { "defaults": true } },
  "scripts": {
    "build": "napi build --platform --release",
    "build:debug": "napi build --platform"
  }
}
```

<StepBox title="分步实现" :steps='[{"title":"导出同步函数","body":"`#[napi] pub fn fnv1a(input: String) -&gt; u32`，先跑通 require 调用。","tip":"napi 会自动生成 .d.ts 类型声明。"},{"title":"导出 struct","body":"`#[napi] pub struct BatchHasher` 加 `#[napi] impl`，让 JS 能 new 出有状态的对象。","tip":"内部持有 Vec&lt;String&gt;，避免每次调用都跨边界传整批数据。"},{"title":"异步函数","body":"`#[napi] pub async fn hash_files(paths: Vec&lt;String&gt;) -&gt; napi::Result&lt;Vec&lt;String&gt;&gt;`，返回 Promise。","tip":"内部用 spawn_blocking 做 IO，别占用 Node 事件循环线程。"},{"title":"错误映射","body":"返回 `napi::Result&lt;T&gt;`，用 `napi::Error::from_reason(...)` 给出可读信息。","tip":"别让 panic 穿过 ABI 边界，那会直接终止 Node 进程。"},{"title":"生成类型与构建","body":"`napi build --platform --release` 产出 .node 与 index.d.ts，写个 JS 脚本验证。"},{"title":"多平台发布","body":"CI 用 matrix 分别构建 linux-x64-gnu / darwin-arm64 / win32-x64-msvc，并用 optionalDependencies 分发。"}]' />

## 完整代码：`src/lib.rs`

```rust
#![deny(clippy::all)]
use napi_derive::napi;

/// FNV-1a，简单但能说明「批量计算」的场景
fn fnv1a(bytes: &[u8]) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in bytes {
        h ^= *b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

#[napi]
pub fn hash_text(input: String) -> String {
    format!("{:08x}", fnv1a(input.as_bytes()))
}

/// 有状态对象：把一批数据留在 Rust 侧，减少跨边界往返
#[napi]
pub struct BatchHasher {
    items: Vec<String>,
}

#[napi]
impl BatchHasher {
    #[napi(constructor)]
    pub fn new() -> Self { Self { items: Vec::new() } }

    #[napi]
    pub fn push(&mut self, item: String) { self.items.push(item); }

    #[napi]
    pub fn finish(&self) -> Vec<String> {
        self.items.iter().map(|s| format!("{:08x}", fnv1a(s.as_bytes()))).collect()
    }

    #[napi(getter)]
    pub fn len(&self) -> u32 { self.items.len() as u32 }
}

/// async fn 会被包装成 JS Promise
#[napi]
pub async fn hash_files(paths: Vec<String>) -> napi::Result<Vec<String>> {
    tokio::task::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| {
                let bytes = std::fs::read(p)
                    .map_err(|e| napi::Error::from_reason(format!("读取 {} 失败：{}", p, e)))?;
                Ok(format!("{:08x}", fnv1a(&bytes)))
            })
            .collect()
    })
    .await
    .map_err(|e| napi::Error::from_reason(e.to_string()))?
}
```

## JS 侧调用

```javascript
const { hashText, BatchHasher, hashFiles } = require('@your-scope/hash-kit');

console.log(hashText('hello'));        // 同步

const h = new BatchHasher();
for (const s of ['a', 'b', 'c']) h.push(s);
console.log(h.len, h.finish());        // 3, [...]

hashFiles(['./package.json']).then(console.log).catch(console.error);
```

```typescript
// napi 自动生成的 index.d.ts（示意）
export declare function hashText(input: string): string
export declare function hashFiles(paths: Array<string>): Promise<Array<string>>
export declare class BatchHasher {
  constructor()
  push(item: string): void
  finish(): Array<string>
  get len(): number
}
```

<Callout type="warn" title="两个高频坑" text="1. **panic 穿过 ABI**：Rust 里 unwrap 炸了会直接干掉 Node 进程，所有对外函数都要返回 `napi::Result`。2. **在同步函数里做 IO**：会阻塞 Node 事件循环，让整个服务停摆；用 `async fn` + `spawn_blocking`，或 `AsyncTask` / `ThreadsafeFunction` 做回调式进度通知。" />

## 与 WASM 的量化对比

| 指标（10 万次短字符串哈希） | 纯 JS | WASM | N-API 插件 |
| --- | --- | --- | --- |
| 计算耗时 | 基准 | 通常更快 | 通常最快 |
| 单次调用边界成本 | 无 | 中（线性内存） | 低（N-API 值转换） |
| 大数组传入 | 无 | 需拷贝 | 需转换 |
| 首次加载 | 即时 | 下载 + 编译 WASM | 加载 .node |

结论和 [第 59 讲](/projects/frontend/wasm-practice.md) 的拷贝成本判断一致：**调用次数多且每次数据小，边界成本会主导结果**。所以上面的 `BatchHasher` 才把数据留在 Rust 侧，一次 `finish()` 拿全部结果。

## 类型映射速查

| Rust | JS / TS |
| --- | --- |
| `String` / `&str` | `string` |
| `i32` / `f64` | `number` |
| `bool` | `boolean` |
| `Vec<T>` | `Array<T>` |
| `Option<T>` | `T \| undefined`（可配置成 null） |
| `Result<T>` | `T` 或抛异常 |
| `async fn -> T` | `Promise<T>` |
| `#[napi] struct` | `class` |
| `HashMap` | `Record`（需 serde 辅助） |

<Quiz no="62-1" q="N-API 相比直接调用 V8 API 的主要好处是？" :options='["性能更高", "ABI 稳定，插件不必随每个 Node 大版本重编", "可以进浏览器", "不需要编译"]' answer="1" explain="N-API 是 Node 官方维护的稳定 C ABI，解决了原生模块长期以来的版本兼容痛点。" />

<Quiz no="62-2" q="为什么同步的 `#[napi]` 函数里不该做文件 IO？" :options='["Rust 不支持", "会阻塞 Node 事件循环，让整个进程停摆", "napi-rs 禁止", "会生成错误的 .d.ts"]' answer="1" explain="应改成 async fn + spawn_blocking，或用 AsyncTask / ThreadsafeFunction 通知进度。" />

<Exercise title="加一个进度回调" task="给 `hashFiles` 增加一个可选的 JS 回调，每处理完一个文件调用一次；提示：用 `ThreadsafeFunction` 或把函数改成接收 `Vec` 后返回带进度的结构体。先写出不改 ABI 的版本（返回每项结果对象），再说明 ThreadsafeFunction 的适用场景。" hints='["返回 Vec&lt;FileHash&gt; 结构体最简单，不需要回调", "ThreadsafeFunction 适合「长时间任务持续推送」", "回调在非 JS 线程调用时必须用 ThreadsafeFunction 而不能直接调 JS 函数"]' solution="#[napi(object)]\npub struct FileHash { pub path: String, pub hash: String, pub index: u32 }\n\n#[napi]\npub async fn hash_files_with_index(paths: Vec&lt;String&gt;)\n    -&gt; napi::Result&lt;Vec&lt;FileHash&gt;&gt; {\n    tokio::task::spawn_blocking(move || {\n        paths.into_iter().enumerate().map(|(i, p)| {\n            let bytes = std::fs::read(&amp;p)\n                .map_err(|e| napi::Error::from_reason(format!(&quot;读取 {} 失败：{}&quot;, p, e)))?;\n            Ok(FileHash { path: p, hash: format!(&quot;{:08x}&quot;, fnv1a(&amp;bytes)), index: i as u32 })\n        }).collect()\n    }).await.map_err(|e| napi::Error::from_reason(e.to_string()))?\n}" explain="先用「结构化返回值」满足需求，等确实需要实时进度条时再引入 ThreadsafeFunction —— 后者要处理背压与销毁时机，复杂度高得多。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `Cannot find module '*.node'` | 未针对当前平台构建；检查 `napi.triples` 与 CI matrix |
| Node 升级后模块加载失败 | 用了非 N-API 绑定；确认 `features = ["napi6"]` 之类 |
| 进程直接退出无报错 | Rust 侧 panic 穿透 ABI，改成 `napi::Result` |
| 调用后整个服务卡顿 | 同步函数做了重 IO / CPU，改异步或分批 |
| `.d.ts` 与实际不符 | 重新 `napi build`，把生成文件纳入构建产物而非手改 |

## 扩展挑战

- 用 GitHub Actions matrix 构建 linux/darwin/win32 多平台产物，配 `optionalDependencies` 发布。
- 给 `BatchHasher` 加 `#[napi(iterator)]` 或实现 `Symbol.iterator`。
- 用 `rayon` 并行处理 `hash_files`，对比单线程版吞吐。
- 阅读 SWC / Oxc 的 Rust 侧入口，看看真实工具链怎么组织 `#[napi]` 与异步任务。
- 对照 [第 59 讲 WASM 实战](/projects/frontend/wasm-practice.md)，把同一算法编译成两份产物并实测边界成本差异。

<CheckList id="napi-check" title="验收清单" :items='["napi build --platform --release 产出 .node 与 index.d.ts", "JS 能调用同步函数、class 与 async 函数", "所有对外函数返回 napi::Result 而非 panic", "能解释 ABI 稳定性的价值", "做过一次 JS / WASM / N-API 的耗时对比"]' />

[下一个项目：第 63 讲 全栈类型共享 →](/projects/frontend/fullstack.md)
