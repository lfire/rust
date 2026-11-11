---
title: 66 讲完整目录
description: 六阶段递进 + 九类工程场景的完整 66 讲目录，含难度、对应页面与落地状态。
pageClass: curriculum-page
---

# 66 讲完整目录

这是整套教程的**总索引**：L0–L4 共 38 讲打基础，L5 共 28 讲工程实战，合计 66 讲（其中 58–66 是扩展新增的 9 讲场景）。纵向六阶段递进，L5 横向按九类工程场景分类、类内由易到难，另有 KV Server 贯穿线与 Rust × 前端专题线。

<Callout type="tip" title="怎么用这份目录" text="66 讲全部独立成页，每讲都能点进对应页面学习，也都配了随堂练习。学习顺序建议按编号走，L5 可按自己工作最接近的场景切入。" />

| 阶段 | 讲次 | 讲数 | 说明 |
| --- | --- | --- | --- |
| L0 导学 | 01–03 | 3 | 建立信心，跑起第一行代码 |
| L1 编程地基 | 04–08 | 5 | 补齐零基础词汇 |
| L2 Rust 语法 | 09–15 | 7 | 写得出几十行小程序 |
| L3 核心机制 | 16–30 | 15 | 全书重点，所有权体系拆到最细 |
| L4 并发异步 | 31–38 | 8 | 线程、共享、消息、Future |
| L5 工程实战 | 39–66 | 28 | 九类场景 + 贯穿线 + 前端专题 |

**状态图例**：✅ 独立成页。**66 讲已全部一讲一页**，每讲都有独立页面、随堂练习与前后讲衔接。第 30 讲由上下两篇组成；第 57 讲是 A–F 类（服务器 / 本机进程主线）的阶段收束，**第 66 讲才是整套教程的最后一讲**。

## L0 · 导学（01–03）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 01 | 开篇：为什么是 Rust，这门课怎么走（基础概念串讲） | ★ | [第 01 讲 开篇](/guide/opening.md) | ✅ |
| 02 | 装好环境：rustup、cargo 与 Playground | ★ | [装好你的 Rust 环境](/guide/setup.md) | ✅ |
| 03 | 第一行代码：fn main 与 println! | ★ | [第一行 Rust 代码](/guide/hello.md) | ✅ |

## L1 · 编程地基（04–08）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 04 | 程序、数据、值与类型 | ★ | [程序、数据、值与类型](/foundation/concepts.md) | ✅ |
| 05 | 栈与堆：数据住在哪 | ★★ | [栈与堆](/foundation/memory.md) | ✅ |
| 06 | 指针、引用与地址 | ★★ | [指针、引用与地址](/foundation/pointers.md) | ✅ |
| 07 | 函数、方法、闭包与表达式 | ★★ | [函数、方法、闭包与表达式](/foundation/callables.md) | ✅ |
| 08 | 为什么值得学 Rust | ★ | [为什么值得学 Rust](/foundation/why-rust.md) | ✅ |

## L2 · Rust 语法（09–15）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 09 | 变量、可变性与类型推导 | ★★ | [变量、可变性与类型推导](/basics/variables.md) | ✅ |
| 10 | 字符串：&str 与 String | ★★ | [字符串 &str 与 String](/basics/strings.md) | ✅ |
| 11 | 函数、语句与表达式 | ★★ | [函数、语句与表达式](/basics/functions.md) | ✅ |
| 12 | 控制流：if / loop / while / for | ★★ | [控制流 if / loop / while / for](/basics/control-flow.md) | ✅ |
| 13 | match 与模式匹配入门 | ★★ | [match 与模式匹配入门](/basics/match-basics.md) | ✅ |
| 14 | Cargo、模块与第一个依赖 | ★★ | [Cargo 与项目结构](/basics/cargo.md) | ✅ |
| 15 | 阶段综合：写一个成绩统计程序 | ★★ | [阶段综合](/basics/capstone.md) | ✅ |

## L3 · 核心机制（16–30）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 16 | 所有权三法则与 Move | ★★★ | [所有权三法则与 Move](/core/ownership.md) | ✅ |
| 17 | Copy、Clone 与自动 drop | ★★★ | [Copy、Clone 与自动 drop](/core/copy-drop.md) | ✅ |
| 18 | 借用与引用 &T | ★★★ | [借用与引用 &T](/core/borrowing.md) | ✅ |
| 19 | 可变借用 &mut 与借用规则 | ★★★★ | [可变借用与借用规则](/core/mutable-borrow.md) | ✅ |
| 20 | 切片 &str / &[T] 再认识 | ★★★ | [切片 &str 与 &[T]](/core/slices.md) | ✅ |
| 21 | 生命周期：引用不能比活得更久 | ★★★★ | [生命周期直觉](/core/lifetime.md) | ✅ |
| 22 | 生命周期标注与省略规则 | ★★★★ | [生命周期标注与省略规则](/core/lifetime-annotations.md) | ✅ |
| 23 | struct、impl 与方法 | ★★★ | [struct、impl 与方法](/core/struct-enum.md) | ✅ |
| 24 | enum、Option 与 Result | ★★★ | [enum、Option 与 Result](/core/enums.md) | ✅ |
| 25 | 模式匹配进阶 | ★★★ | [模式匹配进阶](/core/patterns.md) | ✅ |
| 26 | 集合容器：Vec / HashMap | ★★★ | [集合容器 Vec / HashMap](/core/collections.md) | ✅ |
| 27 | 错误处理：Result、? 与错误类型 | ★★★ | [错误处理](/core/error-handling.md) | ✅ |
| 28 | trait：定义、实现与常用 trait | ★★★★ | [Trait：定义与实现](/core/traits.md) | ✅ |
| 29 | 泛型、trait bound 与 trait object | ★★★★ | [泛型与 trait bound](/core/generics.md) | ✅ |
| 30 | 智能指针、闭包与迭代器（阶段收束，上下两篇） | ★★★★ | [上篇 智能指针](/core/smart-pointers.md) · [下篇 闭包与迭代器](/core/closures-iterators.md) | ✅ |

## L4 · 并发与异步（31–38）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 31 | 并发为什么难：数据竞争与 Send/Sync | ★★★ | [数据竞争与 Send/Sync](/concurrency/send-sync.md) | ✅ |
| 32 | 线程、move 闭包与 JoinHandle | ★★★ | [线程与 Send](/concurrency/threads.md) | ✅ |
| 33 | 共享状态：Arc + Mutex | ★★★★ | [共享状态](/concurrency/shared-state.md) | ✅ |
| 34 | Atomic、Condvar 与 RwLock | ★★★★ | [Atomic、Condvar 与 RwLock](/concurrency/atomics.md) | ✅ |
| 35 | Channel：通过通信共享内存 | ★★★ | [消息传递 Channel](/concurrency/channels.md) | ✅ |
| 36 | Future 与 executor：异步的底层 | ★★★★★ | [Future 与 executor](/concurrency/future-executor.md) | ✅ |
| 37 | async/await、Waker 与 Pin | ★★★★★ | [async/await、Waker 与 Pin](/concurrency/async.md) | ✅ |
| 38 | 异步 IO、Stream / Sink 与 tokio | ★★★★★ | [异步 IO、Stream / Sink 与 tokio](/concurrency/async-io.md) | ✅ |

## L5 · 工程实战（39–66，九类场景）

### A 命令行工具（39–43）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 39 | 猜数字游戏 | ★ | [猜数字游戏](/projects/guess-number.md) | ✅ |
| 40 | mini-grep 文件搜索 | ★★ | [mini-grep](/projects/mini-grep.md) | ✅ |
| 41 | 网页抓取转 Markdown | ★★ | [网页抓取转 Markdown](/projects/scrape-url.md) | ✅ |
| 42 | 待办清单：serde 持久化 | ★★★ | [待办清单](/projects/todo-cli.md) | ✅ |
| 43 | CLI 工程化：子命令、退出码与集成测试 | ★★★ | [CLI 工程化](/projects/cli-engineering.md) | ✅ |

### B 网络服务（44–48，含 KV 第 1–3 步）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 44 | 图片服务器 | ★★★ | [图片服务器](/projects/image-server.md) | ✅ |
| 45 | KV 第 1 步 内存版与 trait 抽象 | ★★★ | [KV 第 1 步](/projects/kv/1-memory.md) | ✅ |
| 46 | KV 第 2 步 网络与协议帧 | ★★★★ | [KV 第 2 步](/projects/kv/2-network.md) | ✅ |
| 47 | KV 第 3 步 TLS 与异步 | ★★★★ | [KV 第 3 步](/projects/kv/3-async.md) | ✅ |
| 48 | 网络编程进阶：连接管理与优雅关闭 | ★★★★ | [网络编程进阶](/projects/network-advanced.md) | ✅ |

### C 数据处理（49–50）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 49 | SQL / CSV 查询工具与 AST | ★★★ | [SQL / CSV 数据工具](/projects/sql-data-tool.md) | ✅ |
| 50 | 数据工程：sqlx、DataFusion 与半结构化分析 | ★★★★ | [数据工程](/projects/data-engineering.md) | ✅ |

### D 并发系统（51–52）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 51 | 手写 MPSC channel | ★★★★ | [手写 MPSC channel](/projects/mpsc-channel.md) | ✅ |
| 52 | Actor 模型与任务分发 | ★★★★ | [Actor 模型与任务分发](/projects/actor.md) | ✅ |

### E 跨语言与底层（53–54）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 53 | unsafe Rust 与 FFI | ★★★★★ | [unsafe Rust 与 FFI](/projects/ffi.md) | ✅ |
| 54 | 用 PyO3 写 Python 扩展 | ★★★★ | [PyO3 扩展](/projects/pyo3.md) | ✅ |

### F 架构与生产化（55–57，含 KV 第 4–5 步）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 55 | KV 第 4 步 大重构与 Pub/Sub | ★★★★★ | [KV 第 4 步](/projects/kv/4-refactor.md) | ✅ |
| 56 | KV 第 5 步 配置、测试、压测、监控与 CI/CD | ★★★★★ | [KV 第 5 步](/projects/kv/5-production.md) | ✅ |
| 57 | 软件架构、生态与持续精进 | ★★★★★ | [软件架构、生态与持续精进](/projects/production.md) | ✅ |

### G Rust × 前端与桌面（58–63，扩展新增）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 58 | WASM 工具链：wasm-bindgen 与 wasm-pack | ★★★ | [WASM 工具链](/projects/frontend/wasm.md) | ✅ |
| 59 | 实战：Rust 计算模块加速前端 | ★★★★ | [Rust 计算模块加速前端](/projects/frontend/wasm-practice.md) | ✅ |
| 60 | Leptos / Yew：纯 Rust 写前端 SPA | ★★★★ | [Leptos 写前端 SPA](/projects/frontend/leptos.md) | ✅ |
| 61 | Tauri：Rust 后端 + WebView 桌面应用 | ★★★★ | [Tauri 桌面应用](/projects/frontend/tauri.md) | ✅ |
| 62 | napi-rs：Node 原生插件与前端工具链 | ★★★★★ | [Node 原生插件](/projects/frontend/node-addon.md) | ✅ |
| 63 | 全栈同构：axum + 前端 + 类型共享 | ★★★★ | [全栈类型共享](/projects/frontend/fullstack.md) | ✅ |

### H 云原生与边缘（64–65，扩展新增）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 64 | tonic gRPC 微服务 | ★★★★ | [tonic gRPC 微服务](/projects/grpc.md) | ✅ |
| 65 | Serverless 与边缘 WASM | ★★★★ | [边缘与 Serverless](/projects/edge.md) | ✅ |

### I 嵌入式与图形（66，扩展新增）

| # | 讲名 | 难度 | 对应页面 | 状态 |
| --- | --- | --- | --- | --- |
| 66 | no_std 嵌入式与 wgpu / Bevy 概览 | ★★★★★ | [嵌入式与图形](/projects/embedded.md) | ✅ |

## 两条贯穿线

| 线 | 涉及讲次 | 作用 |
| --- | --- | --- |
| KV Server 五步演进 | 45、46、47、55、56 | 用一个项目串起 trait → 网络 → TLS/异步 → 重构 → CI/CD |
| Rust × 前端专题 | 58–63 | 五条宿主路径，从 [场景总览](/projects/frontend/) 出发 |

<ConceptDiagram type="pipeline" title="知识主线：地基 → 语法 → 所有权 → 并发 → 九类工程场景"
  labels="编程地基::值 / 内存|Rust 语法::变量 / 函数|核心机制::所有权 / trait|工程实战::并发 / 九类场景"
  caption="地基 → 语法 → 核心机制 → 并发 → 工程：一条不能跳的依赖链" />

<Quiz no="A-1" q="这套 66 讲目录的组织逻辑是？" :options='["按语法点出现顺序", "六阶段递进 + L5 九类场景分类、类内难度递进，另有两条贯穿线", "按代码行数排序", "按原始教材讲次原样搬过来"]' answer="1" explain="v1 的 57 讲是重编后的顺序，v2 又新增 9 讲补上前端/边缘/嵌入式场景，不是原教材顺序。" />

<Quiz no="A-2" q="这份目录里每一讲标 ✅ 是什么意思？" :options='["内容还没写", "该讲已有独立页面，内容与练习完整", "仅对付费用户开放", "需要额外安装工具"]' answer="1" explain="66 讲全部一讲一页，每讲都能点进对应页面；第 30 讲由上下两篇组成。" />

<ProgressTracker />

<CheckList id="curriculum-check" title="使用这份目录" :items='["我知道六个阶段的讲次范围", "我能按自己的方向从 L5 挑场景切入", "我理解 KV Server 与 Rust × 前端两条贯穿线", "我知道每节可以打卡并查看总进度"]' />

[从第 01 讲开始 →](/guide/opening.md) · [如何使用这套教程 →](/guide/index.md) · [直接看工程场景地图 →](/projects/)
