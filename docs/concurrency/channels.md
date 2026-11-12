---
title: 第 35 讲 · 消息传递：Channel
description: mpsc 多生产者单消费者模型、send/recv 的所有权语义与典型并发架构。
---

<StageHeader stage="L4 · 第 35 讲" level="★★★☆☆" time="15 分钟" goal="能用 channel 搭出生产者消费者流水线" prereq="线程 / Arc" />

# 第 35 讲 · 消息传递：Channel

Go 有句名言：**「不要通过共享内存来通信，而要通过通信来共享内存。」** Rust 标准库提供了同款工具：`std::sync::mpsc`（multi-producer, single-consumer）。

<ConceptDiagram type="thread" title="多个 tx 往队列里发，唯一一个 rx 按顺序收" />

## 最小示例

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let msg = String::from("你好");
        tx.send(msg).unwrap();
        // println!("{}", msg);  // ❌ msg 已被 send 移走
    });

    let received = rx.recv().unwrap();
    println!("收到：{}", received);
}
```

三件事值得注意：

1. `send` **拿走值的所有权** —— 发送后原变量不能再用。编译器借此保证「不会有一边发、一边改」的竞争。
2. `recv()` 会阻塞直到有消息；`try_recv()` 不阻塞，返回 `Result`。
3. `tx` 全部被丢弃（或 `rx` 被丢弃）时，通道关闭，`recv` 返回 `Err`。

把一次 send / recv 画成时序图，就容易看清「值什么时候归谁」：

<SequenceDiagram title="一次 mpsc 收发的完整链路" caption="点图可放大：send 转移所有权，recv 阻塞等待，所有 tx 被丢弃后通道关闭。" :actors='["生产者","通道","消费者"]' :steps='[{"from":"生产者","to":"通道","label":"send(msg)","note":"值的所有权交给通道","kind":"call"},{"from":"生产者","to":"生产者","label":"msg 此后不可再用","note":"编译器保证无并发修改","kind":"self"},{"from":"消费者","to":"通道","label":"recv() 阻塞等待","note":"也可用 try_recv 不阻塞","kind":"call"},{"from":"通道","to":"消费者","label":"返回 msg","note":"所有权再转给接收方","kind":"return"},{"from":"生产者","to":"通道","label":"drop(tx)","note":"所有发送端都释放后关闭","kind":"call"},{"from":"通道","to":"消费者","label":"recv() 返回 Err","note":"据此退出消费循环","kind":"return"}]' />

## 多个生产者

`tx` 可以克隆，每个生产者拿一份：

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel();

    for id in 0..3 {
        let t = tx.clone();
        thread::spawn(move || {
            for i in 1..=2 {
                t.send(format!("任务 {}-{}", id, i)).unwrap();
                thread::sleep(Duration::from_millis(5));
            }
        });
    }
    drop(tx);   // 重要：丢掉原始的 tx，否则循环不会结束

    for msg in rx {          // rx 本身可以当迭代器用
        println!("收到 {}", msg);
    }
}
```

<Callout type="warn" title="新手最常见的死循环" text="忘了 `drop(tx)`：主线程自己还持有一个发送端，通道永远不会关闭，`for msg in rx` 就一直等下去。记住把不用的发送端丢掉。" />

## `sync_channel`：带背压的通道

```rust
let (tx, rx) = mpsc::sync_channel(2);   // 容量为 2
```

普通 `channel()` 是无界队列，生产者发太快会吃内存；`sync_channel(n)` 队列满了会让 `send` 阻塞，形成**背压（backpressure）**。这在真实服务里很重要，L5 手写 MPSC channel 时会实现这个语义。

## 什么时候选 channel，什么时候选锁

| 场景 | 建议 |
| --- | --- |
| 流水线：抓取 → 解析 → 入库 | channel 串起来，每段职责单一 |
| 任务分发：多个 worker 领任务 | channel（配合 Arc&lt;Mutex&lt;Receiver&gt;&gt; 或现成 crate） |
| 全局配置、计数器、缓存 | `Arc<Mutex<_>>` 更直接 |
| 事件广播给多个订阅者 | 用 `tokio::sync::broadcast`（L5 Pub/Sub） |

<Callout type="idea" title="和 L5 的连线" text="本节的 mpsc 是「用现成的」；第 51 讲会从零手写一个 MPSC channel（Mutex + Condvar），KV Server 第 4 步还会加 Pub/Sub。学到这里你已经具备读懂它们的前置知识了。" />

<Quiz no="35-1" q="`tx.send(msg)` 之后，原变量 msg 还能用吗？" :options='["能，send 只是复制一份", "不能，所有权被移到通道里", "能，但要加 clone", "取决于 msg 的类型"]' answer="1" explain="send 拿走所有权，这正是消息传递不产生数据竞争的原因。" />

<Quiz no="35-2" q="`for msg in rx` 一直不结束，最可能的原因是？" :options='["rx 被 drop 了", "还有发送端 tx 没有被丢弃", "消息类型不对", "生产者线程 panic 了"]' answer="1" explain="只要还有任何一个 tx 存活，通道就没关闭，迭代会一直等新消息。" />

<Predict no="35-3" q="所有 tx 都被 drop 之后，再调用 `rx.recv()` 会得到？" :options='["永久阻塞", "Err(RecvError)", "Ok(空值)", "panic"]' answer="1" output="Err(RecvError)" explain="通道关闭且队列已空时 recv 返回 Err，这常被用来优雅退出消费者循环。" />

<Exercise title="并行单词统计流水线" task="用 channel 搭两段流水线：一个线程把句子按空格切分后逐词 send，主线程用 for 接收并统计每个词出现次数，最后打印 HashMap。" hints='["用 mpsc::channel() 和 move 闭包", "发送完让 tx 自然离开作用域即可关闭通道", "HashMap 的 entry API 在集合那节讲过"]' solution="use std::collections::HashMap;\nuse std::sync::mpsc;\nuse std::thread;\n\nfn main() {\n    let (tx, rx) = mpsc::channel();\n    thread::spawn(move || {\n        for w in &quot;rust rust go rust&quot;.split_whitespace() {\n            tx.send(w.to_string()).unwrap();\n        }\n    });\n\n    let mut counts = HashMap::new();\n    for w in rx { *counts.entry(w).or_insert(0) += 1; }\n    println!(&quot;{:?}&quot;, counts);\n}" explain="发送端随闭包结束被 drop，for 循环自然收尾，不需要显式 drop。" />

## 小结

- `mpsc::channel()` 返回 `(tx, rx)`，多生产者、单消费者。
- `send` 转移所有权，`recv` 阻塞，`for msg in rx` 迭代到通道关闭。
- 记得 drop 不用的 `tx`；`sync_channel(n)` 提供背压。
- 流水线优先用 channel，共享状态优先用锁。

<CheckList id="channels-check" title="学完本节，你应该能…" :items='["写出多个生产者一个消费者的程序", "解释 send 为什么转移所有权", "说明通道何时关闭、recv 何时返回 Err", "知道 sync_channel 的背压作用"]' />

[下一讲：Future 与 executor（第 36 讲）→](/concurrency/future-executor.md)
