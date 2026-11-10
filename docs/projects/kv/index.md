---
title: 贯穿项目 · KV Server 五步演进
description: 用一个项目从内存版走到生产级服务，串起 trait、网络、TLS、异步、重构与 CI/CD。
---

<StageHeader stage="L5 · 贯穿项目总览" level="★★★☆☆ → ★★★★★" time="约 6～8 小时（可分多次）" goal="经历一个系统「一版一版长大」的完整过程" prereq="L3 / L4 全部" />

# 贯穿项目 · KV Server 五步演进

前面九个项目彼此独立，学的是「各种场景怎么做」。这个项目反过来：**只做一个系统，让它连续长大五次**。它模拟真实工作里最常见的情形 —— 需求不断加，架构跟着演，而你不能每次都推倒重来。

## 最终形态

一个支持 `GET / SET / DELETE / PUBLISH / SUBSCRIBE` 的内存 KV 服务：客户端通过 TLS 连接、用 protobuf 编解码、服务端基于 tokio 异步处理、支持多路复用与发布订阅，带配置、集成测试、压测、指标和 CI/CD。

<ConceptDiagram type="pipeline" title="协议层 → 服务层 → 存储层，三层各自用 trait 解耦" />

## 五步路线

| 步 | 主题 | 新增能力 | 主要用到的知识 |
| --- | --- | --- | --- |
| [第 1 步](/projects/kv/1-memory.md) | 内存版与 trait 抽象 | 命令模型、`Storage` / `CommandService` | L3 enum / trait / 测试 |
| [第 2 步](/projects/kv/2-network.md) | 网络与协议帧 | TCP、Frame 编解码、client/server 双二进制 | L3 trait + L4 线程 |
| [第 3 步](/projects/kv/3-async.md) | TLS 与异步 | x509 证书、tokio、Stream / Sink | L4 异步 |
| [第 4 步](/projects/kv/4-refactor.md) | 重构与 Pub/Sub | yamux 多路复用、事件通知、大重构 | trait object / channel |
| [第 5 步](/projects/kv/5-production.md) | 生产化 | 配置、集成测试、压测、监控、CI/CD | 工程化 |

<Callout type="idea" title="为什么这样切分" text="每一步只引入**一个新维度**：先有正确的数据模型，再加网络，再加安全与并发，再改架构，最后补工程化。这样出问题时你能立刻把范围缩小到「刚加的那一层」。" />

## 统一的项目结构

```text
kv/
├── Cargo.toml           # workspace
├── proto/
│   └── abi.proto        # 命令与响应的协议定义
├── src/
│   ├── lib.rs
│   ├── pb/              # 由 prost 生成的类型
│   ├── service/         # CommandService、事件通知
│   ├── storage/         # Storage trait 与实现
│   ├── network/         # Frame、Stream、TLS
│   └── config.rs
├── src/bin/
│   ├── kv-server.rs
│   └── kv-client.rs
├── tests/               # 集成测试
└── benches/             # 性能压测
```

<CodeTabs title="一条命令在各层里的形态" :tabs='[{"label":"协议层","code":"CommandRequest { cmd: Get, key: \"name\" }","note":"protobuf 定义的请求"},{"label":"服务层","code":"CommandService::execute(self, store) -&gt; CommandResponse","note":"trait 约定的处理入口"},{"label":"存储层","code":"Storage::get(&self, table, key) -&gt; Option&lt;Value&gt;","note":"trait 约定的数据访问"}]' />

## 三条贯穿始终的设计原则

1. **面向 trait 编程**：`Storage` 让内存表、Sled 持久化、测试 mock 可以互换；`CommandService` 让每条命令独立实现、独立测试。
2. **先让类型正确，再让代码跑通**：大量错误在编译期就被挡住，这是能放心做「大重构」的前提。
3. **每一步都留测试**：网络层、TLS、Pub/Sub 加上去之后，第 1 步的单元测试仍然必须全绿 —— 这就是回归保护。

<Quiz no="A-1" q="把 KV Server 拆成「协议 / 服务 / 存储」三层，主要收益是什么？" :options='["编译更快", "每层可独立替换和测试，加新能力时改动范围可控", "可以少写代码", "Rust 强制要求三层"]' answer="1" explain="解耦带来可替换性与可测试性，也是后面敢做 Pub/Sub 大重构的原因。" />

<CheckList id="kv-intro" title="开始之前" :items='["我熟悉 trait 与 impl", "我能读懂 Result 与 ? 的错误链", "我了解线程、channel 和 async 的基本概念", "我准备好分多次完成这个项目"]' />

[开始第 1 步：内存版与 trait 抽象 →](/projects/kv/1-memory.md)
