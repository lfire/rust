---
title: 关于本站与内容来源
description: 这套教程与 rust-coding 原始教材的关系、内容映射、技术栈与交互组件说明。
---

# 关于本站

**Rust 零基础通关** 是一套为**完全没有 Rust 基础**的学习者重新编撰的交互式中文教程，部署在 GitHub Pages 上，源码与内容都在当前仓库中。

## 为什么要重新编，而不是直接搬

仓库里的 `rust-coding/` 是《Rust 编程第一课》（陈天，极客时间）的课程材料，共 57 讲、8 个篇章，覆盖内存、所有权、类型系统、网络、并发、异步、KV Server 与生产化，内容非常扎实。

但它是写给**已有编程经验**的开发者的：开篇第三讲就让你用 `reqwest` + `html2md` 写一个 HTTP 抓取工具，紧接着做图片服务器和 SQL 解析工具。对零基础学习者来说，这会同时撞上「语法」「所有权」「依赖管理」「网络 IO」四堵墙。

所以本站做了三件事：

1. **重排顺序**：先补 L1 编程地基（栈/堆、值和类型、指针与引用），再进入 Rust 语法，把最难的所有权单独拆成 L3 的 15 讲。
2. **降低起点**：把原课程的实战项目改造成「先跑通最小版本 → 逐步加能力」的形式，并补上被省略的错误处理、边界检查与测试。
3. **加入交互**：随堂检测、结果预测、代码填空、分步实现、所有权实验台、在线运行、学习打卡，让「看懂」变成「做对」。

<Callout type="warn" title="原始材料保持原样" text="构建本教程时，`rust-coding/` 目录下的全部 HTML / PDF / 音频文件**只被读取、未被修改或移动**。新站的所有文件都在 `docs/`、`package.json`、`.github/` 等独立位置。" />

## 内容映射

| 原始篇章（`rust-coding/`） | 本站对应内容 |
| --- | --- |
| 01 开篇词 / 02 前置篇（内存、基本概念、为什么学） | L0 导学、[L1 编程地基](/foundation/) |
| 03 基础篇 03 讲（第一个 Rust 程序、语法速览） | L0 第一行代码、[L2 语法入门](/basics/) |
| 03 基础篇 07～11（所有权、借用、Rc、生命周期、内存） | [L3 所有权 / 借用 / 生命周期](/core/) |
| 03 基础篇 12～19（类型系统、trait、智能指针、集合、错误、闭包） | L3 后半 + [闭包与迭代器](/core/closures-iterators.md) |
| 04 期中周（grep 命令行） | [第 40 讲 mini-grep](/projects/mini-grep.md) |
| 03 基础篇 04/05/06（CLI、图片服务器、SQL 工具） | [第 41 讲 网页抓取](/projects/scrape-url.md)、[第 44 讲 图片服务器](/projects/image-server.md)、[第 49 讲 数据工具](/projects/sql-data-tool.md) |
| 05 进阶篇 27～29（生态、网络开发） | [Cargo 与项目结构](/basics/cargo.md)、[KV 第 2 步 网络](/projects/kv/2-network.md) |
| 05 进阶篇 30～32（Unsafe、FFI、PyO3） | [第 54 讲 PyO3 扩展](/projects/pyo3.md) |
| 06 并发篇 33～42（atomic、Mutex、MPSC、Future、KV 网络/TLS/异步/重构） | [L4 并发与异步](/concurrency/)、[第 51 讲 手写 MPSC](/projects/mpsc-channel.md)、[KV 第 3 / 4 步](/projects/kv/3-async.md) |
| 07 实战篇 43～46（生产环境、数据处理、配置测试监控 CI/CD、架构） | [KV 第 5 步 生产化](/projects/kv/5-production.md)、[第 57 讲 软件架构、生态与持续精进](/projects/production.md) |
| 08 结束语（如何持续精进） | [综合自测](/practice/) 与首页学习路线 |
| 03 基础篇 20 讲（如何读源码）/ 加餐·期中参考实现 / 加餐·愚昧之巅 | [阶段综合](/basics/capstone.md)、[模式匹配进阶](/core/patterns.md)、[CLI 工程化](/projects/cli-engineering.md)、[网络编程进阶](/projects/network-advanced.md)、[数据工程](/projects/data-engineering.md)、[Actor 模型](/projects/actor.md)、[unsafe 与 FFI](/projects/ffi.md) |
| **原教材未覆盖，本站补充编撰** | 见下表 ↓ |

### 超出原教材的补充场景

原教材成书于 2021 年，覆盖到 FFI 与 PyO3，但没有涉及浏览器、Node、WebView、边缘计算与裸机这些宿主。以下内容是**参考各项目官方公开资料重新编撰**的，不是对 `rust-coding/` 的改写：

| 本站补充场景 | 主要参考资料 |
| --- | --- |
| [Rust × 前端场景总览](/projects/frontend/) | Rust and WebAssembly Book、wasm-bindgen、Leptos、Tauri、napi-rs 官方文档 |
| [第 58 讲 WASM 工具链](/projects/frontend/wasm.md) · [第 59 讲 前端加速实战](/projects/frontend/wasm-practice.md) | wasm-bindgen / wasm-pack / web-sys / js-sys |
| [第 60 讲 Leptos 写前端 SPA](/projects/frontend/leptos.md) | Leptos Book、Yew 文档 |
| [第 61 讲 Tauri 桌面应用](/projects/frontend/tauri.md) | Tauri 官方指南 |
| [第 62 讲 Node 原生插件](/projects/frontend/node-addon.md) | napi-rs 文档、Node-API 规范；SWC / Rspack 的工程思路 |
| [第 63 讲 全栈类型共享](/projects/frontend/fullstack.md) | axum、ts-rs、typeshare、utoipa |
| [第 64 讲 tonic gRPC 微服务](/projects/grpc.md) | tonic、prost、gRPC 规范 |
| [第 65 讲 边缘与 Serverless](/projects/edge.md) | WASI、Cloudflare Workers / worker-rs |
| [第 66 讲 嵌入式与图形](/projects/embedded.md) | Embedded Rust Book、wgpu、Bevy 官方资料 |

完整的 66 讲索引（含难度、状态与页面链接）见站内 [66 讲完整目录](/guide/curriculum.md)；规划过程见仓库内 `plan/57-lessons-plan.md`（v1，57 讲）与 `plan/course-plan-v2.md`（v2，扩展为 66 讲）。

<ConceptDiagram type="pipeline" title="知识主线：地基 → 语法 → 所有权 → 并发 → 工程（九类场景）"
  labels="编程地基::值 / 内存|Rust 语法::变量 / 函数|核心机制::所有权 / trait|工程实战::并发 / 九类场景"
  caption="知识主线：地基 → 语法 → 所有权 → 并发 → 九类工程场景" />

## 技术栈

| 项 | 选择 | 原因 |
| --- | --- | --- |
| 站点框架 | VitePress 1.x | Markdown 写作、内置搜索/侧栏/深色模式、可嵌入 Vue 组件 |
| 交互 | Vue 3 SFC（17 个自定义组件） | 题库、实验台、进度等都运行在浏览器端，静态站即可 |
| 样式 | 自定义 CSS 设计系统 | 暖白纸张底色 + Rust 橙，浅色/深色双主题 |
| 代码运行 | 官方 Rust Playground | 每个 Rust 代码块自动生成「在线运行」链接 |
| 进度 | localStorage | 不登录、不上传，只保存在学习者自己的浏览器 |
| 部署 | GitHub Actions → GitHub Pages | 推送即构建，无需手工上传产物 |

## 交互组件一览

| 组件 | 用途 |
| --- | --- |
| `Quiz` / `Predict` | 单选多选检测、预测程序输出，答错给解释 |
| `FillBlank` | 代码填空，支持多空与多种可接受的写法 |
| `StepBox` | 分步揭示实现过程，适合跟着做项目 |
| `OwnershipLab` | 逐语句演示栈、堆、Move、借用冲突、作用域释放 |
| `ConceptDiagram` | 十种内联 SVG 概念图（栈堆、所有权、trait、异步…） |
| `Compare` / `CodeTabs` | 与其他语言对照、错误/正确写法切换 |
| `Callout` / `Term` | 提示卡片与术语悬浮解释 |
| `Exercise` | 折叠式练习，逐级给提示与参考实现 |
| `CheckList` / `ProgressTracker` | 每节清单与全站学习进度 |
| `PathMap` / `ScenarioMatrix` | 六阶段路线图与可筛选的工程场景地图 |
| `StageHeader` | 每节难度、时长、目标、前置与打卡 |
| 全局代码栏 | 每个 Rust 代码块自动加「在线运行」按钮 |

## 使用与许可

本站为个人学习用途编撰的教程内容，代码与讲解均可自由用于学习。原始课程的著作权归原作者及极客时间所有；`rust-coding/` 中的材料仅作为本地参考资料保留，本站不重新分发其中的 PDF、音频与图片。

如果你发现讲解有误、代码跑不通、或某个交互不好用，欢迎在仓库提 issue —— 这本来就是一份应该被不断修正的教程。

[本地运行与 Pages 部署 →](/about/deploy.md)
