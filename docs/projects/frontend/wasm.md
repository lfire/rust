---
title: 第 58 讲 · WASM 工具链：wasm-bindgen 与 wasm-pack
description: 把 Rust 编译到浏览器所需的整条工具链讲透：target、wasm-bindgen 胶水、wasm-pack 四种 target、类型映射与调试测试。
---

<StageHeader stage="L5 · 第 58 讲" level="★★★☆☆" time="45 分钟" goal="能独立搭起 WASM 工具链、选对 target 并说清各工具分工" prereq="L3 全部 + 基础 JS / Node" />

# 第 58 讲 · WASM 工具链：`wasm-bindgen` 与 `wasm-pack`

想让 Rust 代码跑在浏览器里，光有 `rustc` 不够 —— 编译产物只认整数和一段线性内存，而 JS 世界里有字符串、数组、对象和 Promise。这一讲专门讲**中间那层工具链**：谁负责编译、谁负责翻译、谁负责打包。下一篇 [第 59 讲](/projects/frontend/wasm-practice.md) 再用它做完整的图像加速实战。

<Callout type="idea" title="先记住一句话" text="rustc 只负责编译成 .wasm；wasm-bindgen 负责生成 JS 胶水代码、把 JS 值搬进搬出线性内存；wasm-pack 把这两步串起来并补齐 npm 包元数据。" />

## 你会练到什么

- `wasm32-unknown-unknown` 目标与一个可构建的 `Cargo.toml`
- 三个工具各自的分工，以及「谁生成了那个 `.js` 文件」
- `#[wasm_bindgen]` 的导出侧与导入侧分别做了什么
- `--target` 四种模式怎么选、选错会报什么
- JS ↔ Rust 类型映射、panic 与错误如何传到 JS
- 构建产物结构、体积优化与浏览器内测试

## 一、工具链与项目结构

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
node -v          # 需要 Node 18+ 来跑示例页面
```

```toml
[package]
name = "image-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"

[profile.release]
opt-level = "s"     # 体积优先；CPU 密集场景可用 3
lto = true
codegen-units = 1
strip = true
```

```text
image-wasm/
├── Cargo.toml
├── src/lib.rs
├── index.html       # JS 侧调用示例
└── pkg/             # wasm-pack 生成，不要手改
```

`crate-type` 里必须有 `cdylib` —— 浏览器要的是一个动态库格式的 `.wasm`，而不是普通的 Rust 静态库。`rlib` 留着是为了让本地 `cargo test` 能照常跑纯 Rust 逻辑。

## 二、三个工具各管一段

初学者最容易搞混的是「谁生成了那个 `.js` 文件」：

| 工具 | 负责什么 | 产出 |
| --- | --- | --- |
| `rustup target add wasm32-unknown-unknown` | 让 rustc 能编译出 WASM 字节码 | 一个编译目标，不含运行时 |
| `wasm-bindgen` | 生成 JS ↔ Rust 胶水代码、做类型与内存转换 | `.js` 包装 + 处理过的 `.wasm` |
| `wasm-pack` | 把上面两步串起来，补 npm 元数据、调用优化器 | `pkg/`，可直接引入或发布 |
| `wasm-opt`（Binaryen） | 体积与速度后优化 | 更小的 `.wasm` |

<Callout type="idea" title="为什么要胶水" text="WASM 的函数签名只能传整数和浮点。一个 JS 字符串要交给 Rust，得先按 UTF-8 编码进 WASM 的线性内存，再把「起始地址 + 长度」这两个整数传过去。wasm-bindgen 生成的 .js 包装就是干这件事的 —— 这也是第 59 讲要讨论的拷贝成本来源。" />

### `#[wasm_bindgen]` 做了什么

```rust
use wasm_bindgen::prelude::*;

// 导出侧：生成 JS wrapper，把 JS 参数转成 WASM 能接收的形式
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 { a + b }

// 导入侧：声明 JS 那边的函数，供 Rust 直接调用
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}
```

再往外一层是 `js-sys`（封装 JS 内置对象，如 `Uint8Array`、`Promise`）与 `web-sys`（封装 DOM / 浏览器 API，按 feature 开启）。三者关系是：**wasm-bindgen 是机制，js-sys / web-sys 是现成的绑定库** —— 别把 `web-sys` 全量打开，体积会暴涨。

## 三、`--target` 四种模式怎么选

| target | 产物给谁用 | 加载方式 |
| --- | --- | --- |
| `web` | 原生 ES Module、无打包器的页面 | `import init from './pkg/x.js'` + `await init()` |
| `bundler` | Vite / webpack / Rollup | `import * as wasm from 'pkg'`，由打包器处理 |
| `nodejs` | Node.js（CommonJS） | `require('./pkg')` |
| `no-modules` | 老式页面、不能用 ES Module 的环境 | 全局 `wasm_bindgen` 对象 |

本教程的示例用 `web`，因为不需要额外工具就能看到链路；做 SPA 或前端工程时（[第 60 讲](/projects/frontend/leptos.md)、[第 63 讲](/projects/frontend/fullstack.md)）通常用 `bundler`；要在 Node 里跑测试或工具链插件（[第 62 讲](/projects/frontend/node-addon.md)）则选 `nodejs`。选错 target 的典型症状是「`init is not a function`」或打包器找不到 `.wasm`。

## 四、JS ↔ Rust 类型映射速查

| JS 侧 | Rust 侧 | 注意 |
| --- | --- | --- |
| `number` | `i32` / `u32` / `f64` | 超过 2³² 的整数要用 `BigInt`，别静默截断 |
| `string` | `String` / `&str` | 按 UTF-8 拷进线性内存，长文本有成本 |
| `Uint8Array` | `&[u8]` / `Vec<u8>` / `js_sys::Uint8Array` | 大数组必经拷贝，是第 59 讲性能分析的主角 |
| `Object` | `JsValue` / `serde_wasm_bindgen` | 结构化数据建议显式序列化，别手搓字段 |
| `Promise` | `wasm_bindgen_futures::JsFuture` | 需要 async 导出与 futures 支持 |
| `throw` | `Result<T, JsValue>` 的 `Err` | 比 panic 可读得多 |

<Quiz no="58-1" q="关于 wasm-bindgen 与 wasm-pack，哪个说法正确？" :options='["wasm-pack 负责把 Rust 源码编译成 WASM 字节码", "wasm-bindgen 负责生成 JS 胶水代码并处理类型转换", "rustc 会自动把 JS 字符串转成 Rust String", "web-sys 应该全量开启才能用 console.log"]' answer="1" explain="编译靠 rustc + wasm32 target，胶水与类型映射靠 wasm-bindgen，wasm-pack 只是把流程串起来并打包。" />

<Quiz no="58-2" q="用 Vite 做前端工程、希望打包器处理 .wasm，应该选哪个 target？" :options='["web", "bundler", "nodejs", "no-modules"]' answer="1" explain="bundler 产出的包由 Vite / webpack / Rollup 接管；web 适合无打包器的原生 ES Module 页面。" />

<Quiz no="58-3" q="关于 crate-type 与依赖，哪些说法正确？" :options='["浏览器产物需要 cdylib", "保留 rlib 便于本地 cargo test", "web-sys 应按 feature 按需开启以控制体积", "wasm-bindgen 版本可以随便选，与 wasm-pack 无关"]' answer="0,1,2" multi="true" explain="wasm-bindgen 与 wasm-pack 的版本需要匹配，否则会出现 generated glue version mismatch。" />

## 五、构建与产物

```bash
wasm-pack build --target web --release
wasm-opt -Oz pkg/image_wasm_bg.wasm -o pkg/image_wasm_bg.wasm   # 可选，进一步压体积
python3 -m http.server 8080     # 打开 index.html
```

`pkg/` 里通常有四样东西：

| 文件 | 作用 |
| --- | --- |
| `xxx_bg.wasm` | 真正的 WASM 字节码 |
| `xxx.js` | 胶水代码，负责实例化与类型转换 |
| `xxx.d.ts` | TypeScript 类型声明 |
| `package.json` | npm 包元数据，`wasm-pack publish` 会用到 |

产物体积参考：`opt-level = "s"` + LTO + strip 后，一个只导出几个函数的小模块约 20–40 KB（gzip 后更小）；引入 `web-sys` 全量 feature 会显著变大，应只开启需要的部分。

## 六、调试与测试

```bash
cargo test                              # 纯 Rust 计算逻辑照常单测
wasm-pack test --headless --firefox     # 在真实浏览器里跑 wasm-bindgen-test
```

```rust
// 让 panic 在浏览器控制台里显示可读堆栈，而不是一句 unreachable
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}
```

<Callout type="warn" title="先装 panic hook" text="WASM 里 panic 默认只表现为 `RuntimeError: unreachable`，几乎没法定位。开发期加上 `console_error_panic_hook`，发布前再评估是否保留；错误路径仍优先用 `Result&lt;T, JsValue&gt;` 返回可读信息。" />

<Predict no="58-4" q="没有调用 `await init()` 就直接调用导出的函数，会怎样？" :options='["正常执行", "报错：WASM 尚未实例化", "自动同步初始化", "返回 undefined 但不报错"]' answer="1" explain="web target 的胶水代码必须先异步实例化 .wasm；顶层 await 或放在 async 初始化流程里。" />

<Exercise title="搭起最小闭环" task="按本讲的结构建一个 crate：Cargo.toml 里配置 cdylib + rlib 和 wasm-bindgen 依赖，src/lib.rs 里用 #[wasm_bindgen] 导出一个 add(a: i32, b: i32) -> i32，再用 wasm-pack build --target web --release 产出 pkg/。写出关键命令即可。" hints='["crate-type 需要 cdylib 与 rlib", "别忘了 rustup target add", "构建命令带 --target web"]' solution="rustup target add wasm32-unknown-unknown\ncargo install wasm-pack\nwasm-pack build --target web --release\n\n# src/lib.rs\nuse wasm_bindgen::prelude::*;\n#[wasm_bindgen]\npub fn add(a: i32, b: i32) -&gt; i32 { a + b }" explain="先跑通一个整数函数，确认链路通了，再写复杂参数和图像逻辑。" />

## 常见坑

| 现象 | 原因 / 处理 |
| --- | --- |
| `init is not a function` | target 选错，或用了 web 产物却按 CommonJS 引入 |
| JS 侧看到 `RuntimeError: unreachable` | Rust 里 panic 了；装 panic hook，改用 `Result<T, JsValue>` |
| 包体积突然几 MB | 引入了 `web-sys` 全量 feature，只开启需要的 |
| `generated glue version mismatch` | wasm-bindgen 与 wasm-pack 版本不匹配，统一升级 |
| `wasm-pack build` 找不到 target | 先 `rustup target add wasm32-unknown-unknown` |

## 扩展挑战

- 用 `wasm-bindgen-test` 在无头浏览器里跑集成测试。
- 试一遍四种 `--target`，对比 `pkg/` 里的文件差异。
- `wasm-pack publish` 发布到 npm，在 Vite 项目里用 `vite-plugin-wasm` 引入。

## 小结

- 编译靠 `rustc` + `wasm32-unknown-unknown`，**胶水靠 `wasm-bindgen`**，打包靠 `wasm-pack`。
- `#[wasm_bindgen]` 既能导出 Rust 函数给 JS，也能声明 JS 函数给 Rust 调用。
- `web` / `bundler` / `nodejs` / `no-modules` 对应四种宿主，选错会直接报错。
- 字符串与数组要搬进线性内存，**拷贝成本**是下一讲性能分析的核心。
- 开发期装 panic hook，用 `cargo test` 与 `wasm-bindgen-test` 分两层测试。

<CheckList id="wasm-toolchain-check" title="学完本讲，你应该能…" :items='["说清 rustc / wasm-bindgen / wasm-pack / wasm-opt 各管什么", "写出可用的 Cargo.toml 并解释 cdylib 的作用", "按使用场景选出 web / bundler / nodejs / no-modules", "看懂 JS ↔ Rust 类型映射表", "成功产出 pkg/ 并知道里面四个文件是什么", "给开发期接上 panic hook 与测试"]' />

[上一讲：Rust × 前端场景总览 →](/projects/frontend/) · [下一讲：第 59 讲 实战：Rust 计算模块加速前端 →](/projects/frontend/wasm-practice.md)
