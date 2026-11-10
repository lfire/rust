---
title: 阶段四 · 并发与异步
description: 从线程与 Send、共享状态、channel 到 Future 与 async，理解 Rust 的「无畏并发」。
---

<StageHeader stage="L4 · 阶段导览" level="★★★★☆" time="约 120 分钟（8 讲）" goal="能写出并发安全且不会数据竞争的程序" prereq="L3 全部" />

# 阶段四 · 并发与异步

「无畏并发（fearless concurrency）」是 Rust 最响亮的招牌。它的底气还是 L3 那套机制：**所有权 + 借用规则 + 类型系统**，只不过把检查范围从「一个线程」扩展到了「多个线程」。

## 为什么其他语言的并发容易出错

两个线程同时改同一个计数器，实际发生的是「读 → 加一 → 写回」三步，交错执行就会丢数据。这类 bug 叫**数据竞争**，特点是难复现、难调试、上线才炸。

Rust 的两个标记 trait 从类型层面封死了它：

| trait | 含义 |
| --- | --- |
| `Send` | 这个类型的所有权可以**在线程间转移** |
| `Sync` | 这个类型的**引用**可以被多个线程同时持有 |

绝大多数类型自动实现这两个 trait；`Rc`、`RefCell`、`*mut T` 裸指针则没有。于是「把 `Rc` 送进新线程」直接编译不过 —— 错误发生在编译期，而不是压测现场。这两个标记 trait 的完整推导规则见 [第 31 讲](/concurrency/send-sync.md)。

<ConceptDiagram type="thread" title="Rust 更鼓励用消息传递，而不是多个线程抢一块可变内存" />

## 本阶段目录

| 讲 | 主题 | 核心工具 |
| --- | --- | --- |
| [31 数据竞争与 Send/Sync](/concurrency/send-sync.md) | 竞争三要素、可见性、标记 trait 推导 | `Send` / `Sync` |
| [32 线程与 move 闭包](/concurrency/threads.md) | 创建线程、JoinHandle、`'static` bound | `thread::spawn` |
| [33 共享状态 Arc + Mutex](/concurrency/shared-state.md) | 多线程共享可变数据 | `Arc` + `Mutex` |
| [34 Atomic、Condvar 与 RwLock](/concurrency/atomics.md) | 无锁计数、等待唤醒、读写锁 | 原子类型 / 条件变量 |
| [35 消息传递](/concurrency/channels.md) | 「通过通信共享内存」 | `std::sync::mpsc` |
| [36 Future 与 executor](/concurrency/future-executor.md) | 异步的底层骨架 | `poll` / `Waker` / `block_on` |
| [37 async/await、Waker 与 Pin](/concurrency/async.md) | 状态机、唤醒、自引用与 Send | `Pin` / `Waker` |
| [38 异步 IO、Stream / Sink 与 tokio](/concurrency/async-io.md) | 少量线程扛大量 IO | `AsyncRead` / `Stream` / `select!` |

<Callout type="idea" title="两条路线的取舍" text="共享状态（Arc + Mutex）适合「大家改同一份数据」；消息传递（channel）适合「流水线、生产者消费者」。L5 的 MPSC channel 项目和 KV Server 会分别把两条路线都走一遍。" />

<CodeTabs title="两种并发写法预览" :tabs='[{"label":"共享状态","code":"let c = Arc::new(Mutex::new(0));\n// 每个线程 clone 一份 Arc，\n// lock() 后再改计数器","note":"简单直接，但要注意锁的粒度"},{"label":"消息传递","code":"let (tx, rx) = mpsc::channel();\n// 多个 tx 各自 send，\n// 一个 rx 统一 recv","note":"职责清晰，天然避免竞争"}]' />

<Quiz no="A-1" q="`Rc&lt;T&gt;` 不能跨线程使用，根本原因是？" :options='["它太大了", "引用计数不是原子操作，多线程同时增减会出错", "它没有实现 Deref", "Rust 不允许任何引用计数类型"]' answer="1" explain="应改用 Arc（atomic reference counted），计数用原子操作保证线程安全。" />

<CheckList id="concurrency-intro" title="开始之前" :items='["我熟悉所有权与借用规则", "我知道 Rc 与 RefCell 的用途", "我能读写闭包和迭代器"]' />

[开始第 31 讲：数据竞争与 Send/Sync →](/concurrency/send-sync.md)
