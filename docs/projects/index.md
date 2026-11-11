---
title: 工程实战 · 场景地图
description: 九类工程场景、类内按难度递进的实战项目体系，含 Rust × 前端与桌面、云原生边缘、嵌入式，以及一条贯穿式 KV Server 演进线。
---

<StageHeader stage="L5 · 场景总览" level="★★★☆☆ ~ ★★★★★" time="按项目自选" goal="把零散知识变成能跑的工程" prereq="L2～L4 对应章节" />

# 工程实战 · 场景地图

学语法和做工程是两件事。真实项目要处理的是：需求怎么拆、模块怎么分、依赖怎么选、错误怎么传、怎么测、怎么上线。这一阶段共 **28 讲**，按九类工程场景归类、类内由易到难，另有 KV Server 贯穿线与 Rust × 前端专题线。完整 66 讲索引见 [课程总目录](/guide/curriculum.md)。

## 三条组织逻辑（重要）

**横向：按工程场景归类，共 9 类。** 先问「我在做什么样的软件」，而不是「我今天学了哪个语法」。首字母 A–I 是[总目录](/guide/curriculum.md)与侧栏共用的分类编号，用来定位各类的讲次范围（A 为 39–43，I 为 66）：

| 场景 | 你会关心的典型问题 | 运行宿主 |
| --- | --- | --- |
| <span class="rb-scene-badge">A</span> 命令行工具 | 参数解析、文件读写、退出码、stderr | 本机进程 |
| <span class="rb-scene-badge">B</span> 网络服务 | 请求响应、路由、协议帧、并发连接 | 服务器 |
| <span class="rb-scene-badge">C</span> 数据处理 | 结构化 / 半结构化数据、查询抽象、序列化 | 服务器 / 本机 |
| <span class="rb-scene-badge">D</span> 并发系统 | 队列、锁粒度、背压、任务分发 | 服务器 |
| <span class="rb-scene-badge">E</span> 跨语言与底层 | FFI、ABI、类型映射、给别的语言加速 | 宿主进程内 |
| <span class="rb-scene-badge">F</span> 架构与生产化 | 分层、配置、测试、监控、CI/CD | 任意 |
| <span class="rb-scene-badge">G</span> Rust × 前端与桌面 | WASM 内存边界、JS 类型映射、WebView IPC、Node N-API、前后端类型共享 | 浏览器 / WebView / Node |
| <span class="rb-scene-badge">H</span> 云原生与边缘 | protobuf 契约、流式 RPC、WASI、冷启动 | 容器 / 边缘节点 |
| <span class="rb-scene-badge">I</span> 嵌入式与图形 | no_std、交叉编译、HAL、渲染管线、ECS | 裸机 / GPU |

G–I 三类不只是把 demo 换个名字，而是引入了一条**宿主维度**：同样是 Rust，跑在浏览器里要处理线性内存与 JS GC 的边界，跑在 Node 里要处理 N-API 与线程安全回调，跑在边缘节点要处理冷启动与 WASI 能力限制，跑在裸机上连标准库都用不了。理解「宿主给了你什么、拿走了什么」，是从写玩具进阶到写工程的关键。

**纵向：每类内部由易到难。** 从只有一个 `main.rs` 的小工具，到需要 trait 抽象、网络协议、异步与监控的完整服务。每个项目都标了星级和建议前置，可以顺着走，也可以挑工作里最接近的场景切入。

**贯穿线与专题线**：KV Server 用同一个项目分 5 步演进，把 L3 的 trait、L4 的网络与异步、L5 的工程化串成完整时间线；Rust × 前端则单独成一组，从 [场景总览与选型](/projects/frontend/) 出发，五条路径各自给出可运行工程。

<ScenarioMatrix />

<ConceptDiagram type="pipeline" title="贯穿项目会反复用到的三层架构：协议 / 服务 / 存储" />

## 建议路线

<StepBox title="四种走法，选一种" :steps='[{"title":"稳妥路线（推荐零基础）","body":"先做第 39 讲 猜数字 → 第 40 讲 mini-grep → 第 41 讲 网页抓取 → 第 42 讲 待办清单，把 L2/L3 的语法、错误处理、serde 用熟。","tip":"每个项目都能在一两个小时内跑通，成就感很重要。"},{"title":"网络与系统方向","body":"之后跳到第 44 讲 图片服务器 → KV Server 第 1～5 步（分布在第 45/46/47/55/56 讲，中间 48–54 是其他场景），理解协议帧、TLS、异步、重构与生产化。","tip":"可按贯穿线连读五步，或按讲次顺序走完 48–54 再回来，两条路都通。"},{"title":"前端方向","body":"先看 Rust × 前端场景总览，再按第 58 讲 WASM 工具链 → 第 59 讲 实战加速 → 第 60 讲 Leptos → 第 61 讲 Tauri → 第 62 讲 Node 原生插件 → 第 63 讲 全栈类型共享 顺序走。","tip":"需要 Node.js 与 wasm-pack，不必先学完 KV Server。"},{"title":"多宿主方向","body":"第 64 讲 gRPC 微服务 → 第 65 讲 边缘 WASM → 第 66 讲 嵌入式与图形，体会同一门语言在不同宿主上的取舍。"}]' />

<Callout type="tip" title="每个项目都按同一个结构写" text="场景与目标 → 选型对比 → 完整依赖与项目结构 → 分步实现（可逐步展开） → 可运行代码 → 构建/运行验证 → 宿主边界与常见坑 → 量化对比 → 扩展挑战。所有场景一律从「工程可用」级起步，不停留在玩具 demo。" />

## 关于代码

页面里的代码都尽量自洽可运行。Rust 代码块右上角有「在线运行」按钮，但**带外部依赖的项目在 Playground 里跑不了**（Playground 只有少量常用 crate），这类项目请在本地 `cargo run`。每篇都会给出完整的 `Cargo.toml` 片段。

G–I 三类还需要额外工具链，各篇开头会列出：

| 场景 | 额外工具 |
| --- | --- |
| WebAssembly / Leptos | `wasm-pack`、目标 `wasm32-unknown-unknown`、Node.js |
| Tauri | Node.js、系统 WebView 运行时、Tauri CLI |
| Node 原生插件 | Node.js、`@napi-rs/cli` |
| gRPC | `protoc`（protobuf 编译器） |
| 边缘 WASM | `worker-rs` / `cargo install workers` 一类工具 |
| 嵌入式 | 交叉编译工具链、`probe-rs` 或厂商烧录工具 |

<Quiz no="A-1" q="这套实战教程的组织逻辑是什么？" :options='["按语法点出现顺序排列", "先按工程场景分类（共九类），每类内部再按难度递进，并用一条贯穿线串起完整演进", "按代码行数从少到多", "随机排列的独立 demo"]' answer="1" explain="九类场景 + 难度递进 + KV Server 贯穿线，另外还有一条宿主维度（服务器 / 浏览器 / 边缘 / 裸机）。" />

<Quiz no="A-2" q="Rust 代码编译到浏览器（WASM）时，最需要额外注意什么？" :options='["Rust 语法要换一套写法", "线性内存与 JS 之间的数据拷贝边界、类型映射", "浏览器里不能用了 panic", "必须改用 Python 写前端"]' answer="1" explain="宿主边界是 WASM 场景的核心：JS 与 Rust 各自管理内存，传大数组时要考虑拷贝成本与所有权归属。" />

<CheckList id="projects-intro" title="开始之前" :items='["我能说出九类工程场景分别指什么", "我理解「宿主维度」为什么重要", "我知道 Rust × 前端有哪五条主要路径", "我理解 KV Server 为什么是「贯穿项目」", "我准备好在本地建项目跑代码了"]' />

[从第 39 讲开始：猜数字游戏 →](/projects/guess-number.md) · [直接看 Rust × 前端专题 →](/projects/frontend/)
