---
title: 第 52 讲 · Actor 模型与任务分发
description: 用 tokio channel 实现最小 Actor、worker pool 与监督重启，对比共享状态方案。
---

<StageHeader stage="L5 · 第 52 讲" level="★★★★☆" time="65 分钟" goal="用消息驱动替代共享可变状态" prereq="第 51 讲 手写 MPSC + L4 并发" />

# 第 52 讲 · Actor 模型与任务分发

[第 51 讲 手写 MPSC channel](/projects/mpsc-channel.md) 造了消息传递的「管道」，这一讲用它来组织**程序结构**：把状态关进一个任务里，外部只能通过消息与它交互 —— 这就是 Actor 模型。

## 为什么需要它

| 方案 | 状态在哪 | 风险 |
| --- | --- | --- |
| `Arc<Mutex<T>>` | 共享内存，各处加锁 | 锁粒度、死锁、忘记加锁 |
| **Actor** | **单个任务私有**，外部发消息 | 邮箱积压、消息设计成本 |

Actor 的好处是**状态天然单线程**：任务内部顺序处理消息，不需要任何锁。代价是所有交互都得先定义消息类型，且要注意邮箱背压。

<ConceptDiagram type="thread" title="多个生产者 → 有界 mailbox → 单个 Actor 任务顺序处理私有状态" />

<Callout type="idea" title="和前面知识的联系" text="Actor 就是「一个持有私有状态的循环 + 一个 mpsc::Receiver」。[第 44 讲 图片服务器](/projects/image-server.md) 的缓存若改成 Actor，就不需要 `Mutex<HashMap>`；[KV 第 4 步 Pub/Sub](/projects/kv/4-refactor.md) 的事件总线也可以用同样的骨架。" />

## 依赖

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
anyhow = "1"
```

<StepBox title="分步实现" :steps='[{"title":"定义消息","body":"用 enum 表达所有请求；需要回复的消息带一个 oneshot::Sender。","tip":"ask 模式（要回复）与 tell 模式（不要回复）分开。"},{"title":"Actor 循环","body":"`while let Some(msg) = rx.recv().await { ... }`，状态是循环内的局部变量。","tip":"没有 Arc、没有 Mutex，状态只属于这个任务。"},{"title":"封装句柄","body":"`struct CounterHandle { tx: mpsc::Sender&lt;Msg&gt; }`，对外只暴露方法。","tip":"调用方完全不知道内部是 Actor。"},{"title":"有界邮箱与背压","body":"`channel(64)`；send 等待即天然限速，或用 try_send 返回「忙」。","tip":"容量按业务容忍延迟定，别用无界通道。"},{"title":"worker pool","body":"起 N 个 worker 共享一个 receiver（需 Arc&lt;Mutex&lt;Receiver&gt;&gt;）或改用一个分发 Actor。","tip":"任务数远大于 CPU 核数时收益有限。"},{"title":"监督与重启","body":"用 JoinHandle 监控 panic，失败后重建 Actor 并迁移可恢复状态。"}]' />

## 完整代码：最小 Actor

```rust
use anyhow::Result;
use tokio::sync::{mpsc, oneshot};

enum Msg {
    Inc(u32),
    Get { reply: oneshot::Sender<u32> },
    Reset,
}

#[derive(Clone)]
struct CounterHandle {
    tx: mpsc::Sender<Msg>,
}

impl CounterHandle {
    /// tell：不关心回复
    async fn inc(&self, n: u32) -> Result<()> {
        self.tx.send(Msg::Inc(n)).await?;
        Ok(())
    }

    async fn reset(&self) -> Result<()> {
        self.tx.send(Msg::Reset).await?;
        Ok(())
    }

    /// ask：带 oneshot 回复通道
    async fn get(&self) -> Result<u32> {
        let (reply, rx) = oneshot::channel();
        self.tx.send(Msg::Get { reply }).await?;
        Ok(rx.await?)
    }
}

fn spawn_counter() -> CounterHandle {
    let (tx, mut rx) = mpsc::channel::<Msg>(64);   // 有界邮箱
    tokio::spawn(async move {
        let mut value: u32 = 0;                    // 私有状态，无需锁
        while let Some(msg) = rx.recv().await {
            match msg {
                Msg::Inc(n) => value += n,
                Msg::Reset => value = 0,
                Msg::Get { reply } => {
                    // 调用方可能已取消，发送失败忽略即可
                    let _ = reply.send(value);
                }
            }
        }
        tracing::info!("所有句柄已释放，Actor 退出");
    });
    CounterHandle { tx }
}

#[tokio::main]
async fn main() -> Result<()> {
    let counter = spawn_counter();
    let mut tasks = tokio::task::JoinSet::new();

    for _ in 0..8 {
        let c = counter.clone();
        tasks.spawn(async move {
            for _ in 0..1000 {
                c.inc(1).await.unwrap();
            }
        });
    }
    while tasks.join_next().await.is_some() {}
    println!("最终计数：{}", counter.get().await?);   // 8000
    Ok(())
}
```

<Callout type="warn" title="句柄全部 drop 后 Actor 会退出" text="`mpsc::Receiver::recv()` 在发送端全被丢弃时返回 None，循环结束。这是特性不是 bug：Actor 生命周期跟着句柄走。需要常驻服务时，请显式持有一个「管理员句柄」或用 CancellationToken 控制关停。" />

## worker pool

```rust
async fn worker(id: usize, mut rx: mpsc::Receiver<Job>) {
    while let Some(job) = rx.recv().await {
        tracing::info!(id, "处理任务 {}", job.id);
        // 处理逻辑；重 CPU 任务应 spawn_blocking
    }
}

#[tokio::main]
async fn main() {
    let (tx, rx) = mpsc::channel::<Job>(256);
    // 多个 worker 共享同一个 receiver：用 Arc<Mutex<Receiver>> 包装
    let rx = std::sync::Arc::new(tokio::sync::Mutex::new(rx));
    for id in 0..4 {
        let rx = rx.clone();
        tokio::spawn(async move {
            loop {
                let job = rx.lock().await.recv().await;
                match job { Some(j) => handle(id, j).await, None => break }
            }
        });
    }
    for j in jobs { tx.send(j).await.unwrap(); }   // 满时阻塞 = 背压
    drop(tx);
}
```

更地道的做法是用 `tokio_util::sync::PollSender` 或专门的 `async-channel`（MPMC），避免 `Mutex<Receiver>` 成为瓶颈；也可以让一个「分发 Actor」持有 receiver，再按负载把任务转派给各个 worker。

## 共享状态 vs Actor

| 维度 | `Arc<Mutex<T>>` | Actor |
| --- | --- | --- |
| 状态访问 | 任意线程加锁 | 只有 Actor 任务能碰 |
| 组合多个状态 | 容易死锁（加锁顺序） | 消息顺序天然确定 |
| 读多写少 | 快（RwLock） | 每次读都要一次消息往返 |
| 崩溃隔离 | 一处 panic 可能污染共享数据 | 任务 panic 只影响一个 Actor |
| 调试 | 难复现的竞态 | 消息日志可重放 |

<Quiz no="52-1" q="Actor 里的状态为什么不需要 Mutex？" :options='["Rust 编译器自动加了锁", "状态是单个任务内的局部变量，消息被顺序处理", "tokio 禁止在 Actor 里用锁", "状态被编译成常量"]' answer="1" explain="消息串行处理保证同一时刻只有一个执行流访问状态，这是模型本身提供的保证。" />

<Quiz no="52-2" q="ask 模式里的 oneshot::Sender 作用是？" :options='["广播消息", "给单条消息带回一次回复", "限制邮箱容量", "替代 mpsc"]' answer="1" explain="请求消息自带回复通道，Actor 处理完把结果 send 回去，调用方 await 那个 oneshot。" />

<Exercise title="加一个监督者" task="给 spawn_counter 加一个 `JoinHandle`，另起一个监控任务：Actor 因 panic 退出时打印日志并重新 spawn 一个计数器（状态从 0 开始），同时说明生产环境如何持久化状态以便恢复。" hints='["tokio::spawn 返回 JoinHandle，await 得到 Result&lt;_, JoinError&gt;", "JoinError::is_panic() 判断是否为 panic", "恢复状态需要事件溯源或快照，不能只靠内存"]' solution="let handle = tokio::spawn(actor_loop(rx));\ntokio::spawn(async move {\n    if let Err(e) = handle.await {\n        if e.is_panic() { tracing::error!(&quot;Actor panic，准备重启&quot;); }\n        // 重建：spawn_counter() 并从快照 / 事件日志恢复 value\n    }\n});" explain="内存状态 panic 后不可恢复，生产要么持久化事件日志重放，要么把状态放外部存储 —— 这是 Actor 模型最常被忽略的一环。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| Actor 莫名退出 | 所有句柄被 drop；显式持有管理员句柄 |
| `get()` 永久挂起 | Actor 崩溃导致 oneshot 发送端被丢弃，用 timeout 包住 |
| 邮箱无限增长 | 用有界 channel；满时 send 等待或返回「忙」 |
| 死锁 | ask 消息的回复通道被 Actor 自己等待；避免 Actor 内同步等另一个 Actor 的回复 |
| CPU 密集任务卡住邮箱 | 用 `spawn_blocking` 把重活移出 Actor 循环 |

## 扩展挑战

- 用 `actix` / `riker` / `kameo` 框架重写，对比手写版少了什么、多了什么。
- 实现「按 key 分片」的 Actor 组，把单邮箱热点打散。
- 加事件溯源：每条 Inc 先写日志再改状态，重启时重放。
- 把 [KV 第 4 步 Pub/Sub](/projects/kv/4-refactor.md) 的 TopicBus 换成 Actor，比较广播实现。
- 用 `tokio::time::timeout` 给所有 ask 加超时，并统计超时率。

<CheckList id="actor-check" title="验收清单" :items='["Actor 状态是任务内局部变量、无锁", "tell 与 ask 两种消息都实现", "邮箱有界且能形成背压", "知道句柄全 drop 会导致 Actor 退出", "能说出与 Arc&lt;Mutex&gt; 的取舍"]' />

[上一讲：第 51 讲 手写 MPSC →](/projects/mpsc-channel.md) · [下一讲：第 53 讲 unsafe Rust 与 FFI →](/projects/ffi.md)
