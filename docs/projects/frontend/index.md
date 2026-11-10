---
title: Rust × 前端与桌面 · 场景总览
description: 五条 Rust 落地前端的路径（WASM、Rust SPA、Tauri、Node 插件、全栈类型共享）与宿主边界选型指南。
---

<StageHeader stage="L5 · 前端专题总览" level="★★☆☆☆" time="12 分钟" goal="知道自己该走五条路径中的哪一条" prereq="L3 全部 + 基础前端概念" />

# Rust × 前端与桌面 · 场景总览

Rust 不只是服务端语言。今天前端工程里到处是 Rust 的影子：SWC / Rspack / Biome 用 Rust 重写了构建链路，Figma 的图像管线跑在 WASM 里，Tauri 用 Rust 替代了 Electron 的 Node 后端，Leptos 让人可以用纯 Rust 写 SPA。

这一组之所以单独成类，不是因为语法不同，而是因为**宿主变了**。在服务器上你几乎不用担心「内存谁分配」「类型怎么跨语言映射」「产物多大」；一旦代码跑进浏览器、Node 或 WebView，这三件事就会变成每天要处理的问题。

## 四条宿主边界问题

<ConceptDiagram type="pipeline" title="Rust 模块 ← 边界 → 宿主（浏览器 / Node / WebView / 边缘）"
  labels="Rust 模块::.wasm / .node|宿主边界::内存 / 类型 / 异步|宿主能力::DOM / KV / IO|调用方::JS / WebView"
  caption="跨宿主时真正要处理的是「边界」：内存、类型、异步与产物体积" />

| 问题 | 为什么在前端特别麻烦 |
| --- | --- |
| 内存谁分配 | JS 有 GC、Rust 有所有权，两边各自管理内存；WASM 里还要经过一层线性内存 |
| 类型怎么映射 | `String` / `Vec<u8>` / `Result` 到 JS 的 string / Uint8Array / 异常，都不是零成本 |
| 异步怎么跨运行时 | tokio 的 Future 和 JS 的 Promise 不是一回事，需要显式桥接 |
| 产物多大 | 浏览器要下载，边缘节点有冷启动，桌面包要分发；`wasm-opt`、LTO、strip 都影响体验 |

<Callout type="idea" title="一句话记住这类场景" text="服务端 Rust 关心「数据怎么流动」，前端 / 桌面 Rust 还要多关心一层「数据怎么跨过宿主边界」。后者才是这类项目的真正难点。" />

## 五条路径对比

| 路径 | 产物 | 宿主 | 最适合 | 不适合 | 代表工具 |
| --- | --- | --- | --- | --- | --- |
| **1. WASM 计算模块** | `.wasm` + JS 胶水 | 浏览器 / Node | 把一段已有 Rust 算法移植给前端调用、CPU 密集计算 | 频繁小调用（边界开销吃掉收益） | `wasm-bindgen` / `wasm-pack` |
| **2. 纯 Rust 前端框架** | `.wasm` 驱动的 SPA | 浏览器 | 前后端同一语言、强类型组件、团队全 Rust | 需要大量现成 JS 组件生态 | Leptos / Yew / Dioxus |
| **3. Tauri 桌面应用** | 原生二进制 + 系统 WebView | 桌面 | 本地文件处理、开发工具、需要小体积 | 要求完全一致的内嵌 Chromium | Tauri |
| **4. Node 原生插件** | `.node` 动态库 | Node.js | 给构建工具 / 后端服务加速、复用系统能力 | 要同时发布到浏览器 | `napi-rs` |
| **5. 全栈类型共享** | 生成的 `.d.ts` / `.ts` | 前后端 | Rust 后端 + TS 前端、DTO 频繁变动 | 纯前端项目 | `ts-rs` / `typeshare` / `utoipa` |

<Compare title="WASM 与 Node 原生插件怎么选" :panels='[{"label":"WASM 模块","code":"浏览器 + Node 都能跑\n沙箱内执行，能力受限\n跨边界需拷贝数据","note":"适合分发给任意 JS 环境"},{"label":"napi-rs 插件","code":"只在 Node 跑\n可访问完整系统能力\n按平台分别编译二进制","note":"适合构建工具 / 服务端加速"}]' note="判断标准很简单：产物要不要进浏览器？要就选 WASM，不要且追求极致性能就选 N-API。" />

## 五条路径，对应五个方向

WASM 这条路径由两讲组成：先搭工具链（第 58 讲），再做完整实战（第 59 讲）。

| 项目 | 你会做出什么 | 难度 |
| --- | --- | --- |
| [第 58 讲 WASM 工具链](/projects/frontend/wasm.md) · [第 59 讲 实战加速](/projects/frontend/wasm-practice.md) | 搭好工具链，再做一个 Rust 写的图像灰度滤镜给 JS 调用，附量化对比 | ★★★★☆ |
| [第 60 讲 Leptos 写前端 SPA](/projects/frontend/leptos.md) | 纯 Rust 的待办应用，理解 signal 与组件 | ★★★★☆ |
| [第 61 讲 Tauri 桌面应用](/projects/frontend/tauri.md) | Rust 命令 + WebView 的本地笔记工具 | ★★★★☆ |
| [第 62 讲 Node 原生插件](/projects/frontend/node-addon.md) | 给 Node 写的哈希模块，理解 SWC 一类工具链 | ★★★★★ |
| [第 63 讲 全栈类型共享](/projects/frontend/fullstack.md) | axum 后端自动生成 TS 类型，前后端不写重复 DTO | ★★★★☆ |

<StepBox title="建议学习顺序" :steps='[{"title":"先做第 58 讲工具链，再做第 59 讲实战","body":"先搭起工具链，再亲手跨一次 JS ↔ Rust 边界，把线性内存、类型转换、两次拷贝体验一遍。","tip":"这是理解其余几条路径的基础。"},{"title":"再做第 63 讲 全栈类型共享","body":"成本最低、收益最直接：后端加几个 derive，前端就再也不用手写接口类型。"},{"title":"然后按方向二选一","body":"想做界面 → 第 60 讲 Leptos 或 第 61 讲 Tauri；想做工具链 → 第 62 讲 napi-rs。","tip":"Tauri 与 Leptos 可以组合：Tauri 管壳，Leptos 管界面。"},{"title":"最后回头看性能与发布","body":"补 wasm-opt、CI 多平台构建、npm 发布、自动更新。"}]' />

## 常见误区

<Callout type="warn" title="三个常见误判" text="1. 「Rust 一定比 JS 快」—— 跨边界调用很便宜是假的：小函数高频调用时，序列化/拷贝成本会盖过计算收益，应该批量传数据。2. 「WASM 能操作 DOM」—— 不能直接操作，要通过 web-sys / js-sys 调 JS API，每次都有边界开销。3. 「Tauri 就是套壳浏览器」—— 它复用系统 WebView，所以体积远小于 Electron，但不同系统的渲染差异需要测试。" />

<Quiz no="A-1" q="项目要给一个 React 应用里的图像批处理加速，且代码也可能在 Node 端复用，最合适的路径是？" :options='["napi-rs 原生插件", "WASM 计算模块", "Tauri 桌面应用", "直接用 PyO3"]' answer="1" explain="要同时覆盖浏览器与 Node，且是 CPU 密集的批量计算，WASM 是标准选择；napi-rs 不能进浏览器。" />

<Quiz no="A-2" q="下面哪些属于「宿主边界」带来的额外成本？" :options='["JS 与 Rust 之间拷贝大数组", "把 Rust 的 Result 映射成 JS 异常或返回值", "把 tokio Future 桥接成 JS Promise", "Rust 编译器检查所有权"]' answer="0,1,2" multi="true" explain="所有权检查是编译期的事，跟宿主无关；前三项都是跨边界才出现的问题。" />

<CheckList id="frontend-intro" title="开始之前" :items='["我能说出五条路径各自的宿主与产物", "我理解四条宿主边界问题", "我知道 WASM 与 Node 原生插件怎么选", "我装好了 Node.js（后续项目需要）"]' />

[从第 58 讲开始：WASM 工具链 →](/projects/frontend/wasm.md)
