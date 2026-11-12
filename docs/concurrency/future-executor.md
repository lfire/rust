---
title: 第 36 讲 · Future 与 executor：异步的底层
description: 手写最小 Future 与 block_on 执行器，理解 poll、Pending、Waker 与协作式调度。
---

<StageHeader stage="L4 · 第 36 讲" level="★★★★★" time="35 分钟" goal="能说清 Future 为什么惰性、executor 如何驱动它" prereq="第 35 讲 Channel / L3 trait" />

# 第 36 讲 · Future 与 executor：异步的底层

前面几讲用**线程**做并发。但当程序要同时照看成千上万个网络连接时，线程就太贵了：每个线程自带栈（默认 2 MB）、切换要陷内核。异步用**任务（task）**替代线程：一个小得多的状态机，由少量工作线程轮流推进。这一讲把这个机制从零搭出来。

> `async/await` 的语法与编译器生成的状态机留到 [第 37 讲](/concurrency/async.md)，异步 IO 与 Stream/Sink 见 [第 38 讲](/concurrency/async-io.md)。本讲只看底层契约。

## 一、Future 是一个「还没完成的值」

```rust
pub trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
}

pub enum Poll<T> {
    Ready(T),
    Pending,
}
```

三个要点：

1. **Future 本身什么都不做**。它只是一台状态机，有人调 `poll` 才往前走一步。
2. `Ready(v)` 表示完成；`Pending` 表示「还没好，别占着线程，先去忙别的」。
3. `Context` 里带着 **`Waker`**：Future 需要在「条件就绪」时调用 `wake()`，通知执行器「可以再 poll 我一次了」。

<ConceptDiagram type="async" title="Future 交给 executor 轮询，IO 就绪时由 Waker 唤醒" />

<Callout type="idea" title="和 JS Promise 的关键差别" text="Promise 创建后立刻开始执行（内部会自己推进）；Rust 的 Future 是**惰性**的，不 poll 就一步不走。所以 `let f = fetch();` 单独一行什么都不会发生，必须 `.await` 或交给 executor。这个差别决定了 Rust 需要一个显式运行时（tokio / async-std）。" />

## 二、手写一个最小 Future

```rust
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};

struct Delay {
    until: Instant,
    started: bool,
}

impl Future for Delay {
    type Output = ();

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        if Instant::now() >= self.until {
            Poll::Ready(())
        } else {
            // 到点后唤醒自己，否则 executor 不知道何时该再问一次
            let waker = cx.waker().clone();
            let until = self.until;
            std::thread::spawn(move || {
                std::thread::sleep(until.saturating_duration_since(Instant::now()));
                waker.wake();
            });
            self.started = true;
            Poll::Pending
        }
    }
}

fn delay(d: Duration) -> Delay {
    Delay { until: Instant::now() + d, started: false }
}
```

⚠️ 上面每次 poll 都 spawn 一个线程只是**教学简化**，真实实现会把定时器注册到 Reactor，由事件循环统一唤醒，绝不会一个 Future 一个线程。

刚才那段最小 Future 信息密度有点高，点左边任意一行，看它在整个 poll 流程里负责什么：

<LineByLine title="最小 Future 逐行讲解" code="struct Delay { until: Instant, started: bool }
impl Future for Delay {
  type Output = ();
  fn poll(self: Pin&lt;&amp;mut Self&gt;, cx: &amp;mut Context) -&gt; Poll&lt;()&gt; {
    if Instant::now() &gt;= self.until { return Poll::Ready(()) }
    let waker = cx.waker().clone();
    thread::spawn(move || waker.wake());
    Poll::Pending
  }
}" :notes='["状态里只存「等到什么时候」和「有没有启动过定时器」，Future 本身不推进自己", "给 Delay 实现 Future，等于告诉执行器：这个值以后会就绪", "关联类型写定这个 Future 完成时产出什么，这里是「没有值」", "poll 是整个异步机制的唯一入口；Pin 保证 self 不会被移动，Context 提供唤醒器", "时间到了就直接返回 Ready，执行器会把这个任务标为完成", "先克隆一份 Waker：线程醒来后要靠它通知执行器「可以再 poll 一次」", "教学简化版用线程睡到点再 wake，真实实现交给 Reactor 统一注册定时器", "返回 Pending 不是失败，而是「现在没好，好了我会叫你」—— 这一步最容易被误读"]' />

## 三、手写一个单线程 executor（block_on）

```rust
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};
use std::collections::VecDeque;

struct Task {
    future: Mutex<Pin<Box<dyn Future<Output = ()> + Send>>>,
}

impl Wake for Task {
    fn wake(self: Arc<Self>) { READY.with(|q| q.borrow_mut().push_back(self.clone())); }
    fn wake_by_ref(self: &Arc<Self>) { READY.with(|q| q.borrow_mut().push_back(self.clone())); }
}

thread_local! {
    static READY: std::cell::RefCell<VecDeque<Arc<Task>>> = Default::default();
}

fn block_on<F: Future<Output = ()> + Send + 'static>(future: F) {
    let task = Arc::new(Task { future: Mutex::new(Box::pin(future)) });
    READY.with(|q| q.borrow_mut().push_back(task.clone()));
    let waker = Waker::from(task.clone());

    loop {
        let Some(task) = READY.with(|q| q.borrow_mut().pop_front()) else {
            // 队列空：真实 executor 会在这里等 IO 事件，而不是忙等
            std::thread::yield_now();
            continue;
        };
        let mut cx = Context::from_waker(&waker);
        let mut fut = task.future.lock().unwrap();
        if fut.as_mut().poll(&mut cx) == Poll::Ready(()) {
            println!("任务完成");
            return;
        }
        // Pending：等 Waker 把它重新放回队列
    }
}
```

这段约 30 行代码就是所有异步运行时的骨架：

| 部件 | 职责 |
| --- | --- |
| **Future** | 状态机，被 poll 时推进一步 |
| **Waker** | 就绪时把任务重新放回就绪队列 |
| **就绪队列** | 待 poll 的任务集合 |
| **Executor** | 循环取任务 → poll → 处理 Ready/Pending |
| **Reactor** | 监听 IO / 定时器事件，触发 Waker（tokio 提供） |

<Compare title="三种并发模型" :panels='[{"label":"线程","code":"thread::spawn(move || { ... })","note":"内核调度，抢占式，栈开销大，数量有限"},{"label":"回调","code":"on_ready(|data| { ... })","note":"无栈但回调地狱，错误与生命周期难管"},{"label":"Future + executor","code":"async { io.await; }","note":"协作式调度，状态机极轻，可撑百万任务"}]' note="异步的价值不在单次更快，而在同样资源能服务更多并发等待。" />

## 四、协作式调度的含义

为什么等 I/O 时不能一直占着线程？看看各个层级之间的数量级差就明白了。

<ConceptDiagram type="io-latency" title="CPU 与 I/O 的速度鸿沟" />

任务只有在 `.await` 处才会让出执行权。如果某个 `async` 块里跑了 500 ms 的纯 CPU 计算且没有 await，它会**独占整个 worker 线程**，其它任务全部饿死。

```rust
// ❌ 在异步任务里做重 CPU 计算
// async fn bad() { heavy_compute(); }

// ✅ 交给阻塞线程池
async fn good() {
    tokio::task::spawn_blocking(|| heavy_compute()).await.unwrap();
}
```

<Callout type="warn" title="两条实战纪律" text="1. **异步函数里不要持锁跨 `.await`**（`std::sync::MutexGuard` 不是 Send，编译器会拒绝；`tokio::sync::Mutex` 能跨但会拉长临界区）。2. **CPU 密集任务用 `spawn_blocking`**。这两条是异步服务最常见的高延迟来源。" />

## 五、`tokio` 在这套模型里的位置

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
```

```rust
#[tokio::main]
async fn main() {
    // spawn 把任务交给运行时调度，而不是交给 OS 线程
    let h = tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        "done"
    });
    println!("{}", h.await.unwrap());
}
```

| 概念 | 手写版 | tokio |
| --- | --- | --- |
| executor | `block_on` 循环 | 多线程 work-stealing 调度器 |
| Waker | `thread_local` 队列 | 高效的任务队列 |
| Reactor | 无（用线程 sleep 模拟） | epoll / kqueue / IOCP |
| 定时器 | 手写 `Delay` | `tokio::time` |

<Predict no="36-1" q="`let f = async { println!(&quot;hi&quot;) };` 单独一行会输出什么？" :options='["立即输出 hi", "什么都不输出", "编译失败", "运行时 panic"]' answer="1" output="（无输出）" explain="Future 是惰性的，必须 .await 或交给 executor 才会被 poll。这也是 Rust 需要显式运行时的根本原因。" />

<Quiz no="36-2" q="`poll` 返回 `Pending` 时，Future 必须做什么？" :options='["自旋等待直到完成", "安排好 Waker，在条件就绪时调用 wake()", "立即返回结果", "创建新线程"]' answer="1" explain="不注册 Waker 的话 executor 永远不知道该何时再 poll，任务就永久挂起。" />

<Quiz no="36-3" q="关于 executor 与 Reactor，哪些说法正确？" :options='["executor 负责轮询 Future", "Reactor 监听 IO 事件并触发 Waker", "Waker::wake 会把任务重新放回就绪队列", "一个 Future 一定对应一个 OS 线程"]' answer="0,1,2" multi="true" explain="Future 是轻量状态机，多个任务复用少量 worker 线程，这正是异步的优势。" />

<Quiz no="36-4" q="异步任务里跑一段 500ms 纯 CPU 计算且没有 await，会？" :options='["自动让出线程", "独占 worker 线程，其它任务饿死", "编译器拒绝", "自动开新线程"]' answer="1" explain="异步是协作式调度，只有 .await 才让出；重 CPU 任务要用 spawn_blocking。" />

<Exercise title="给 Delay 加上输出值" task="把 `Delay` 改成 `type Output = u32` 的 Future，完成时返回一个 id；再写两个 `block_on` 任务并发跑（提示：executor 需要改成支持多任务、全部完成后才返回），观察总耗时是否接近单个任务的时长而不是两者之和。" hints='["Delay 里加字段 id: u32，Ready 时返回它", "多任务版 executor 用计数或 Vec&lt;Arc&lt;Task&gt;&gt; 跟踪未完成数量", "两个 100ms 的 Delay 并发，总耗时应约 100ms"]' solution="struct Delay { until: Instant, id: u32 }\n\nimpl Future for Delay {\n    type Output = u32;\n    fn poll(self: Pin&lt;&amp;mut Self&gt;, cx: &amp;mut Context&lt;'_&gt;) -&gt; Poll&lt;u32&gt; {\n        if Instant::now() &gt;= self.until {\n            Poll::Ready(self.id)\n        } else {\n            let w = cx.waker().clone();\n            let until = self.until;\n            std::thread::spawn(move || {\n                std::thread::sleep(until.saturating_duration_since(Instant::now()));\n                w.wake();\n            });\n            Poll::Pending\n        }\n    }\n}" explain="并发的关键在于所有任务都注册了 Waker，谁先就绪谁被重新 poll，而不是串行等第一个完成。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 异步代码「没执行」 | Future 没被 `.await` 或没交给 executor |
| 任务永久挂起 | Pending 分支忘了注册/调用 Waker |
| 其它任务饿死 | 无 await 的长计算；改 `spawn_blocking` |
| `future is not Send` | 跨 `.await` 持有了 `Rc` / `RefCell` / `MutexGuard` |
| 编译报 `Pin` 相关错误 | 手写 Future 需要 `Pin<&mut Self>`；业务代码用 `async fn` 就不用碰 |
| 用了 tokio 却调同步 `std::net` | 阻塞了 worker；改用 `tokio::net` |

## 小结

- `Future` 是惰性状态机，`poll` 返回 `Ready` 或 `Pending`；`Pending` 必须安排 `Waker`。
- executor = 就绪队列 + poll 循环；Reactor 负责 IO 事件并触发唤醒。
- 协作式调度意味着只有 `.await` 才让出，CPU 密集任务必须 `spawn_blocking`。
- tokio 只是把这套骨架做成了生产级实现。
- 下一讲看 `async/await` 编译成什么、Waker 与 Pin 的细节。

<CheckList id="future-exec-check" title="学完本节，你应该能…" :items='["读出 Future trait 签名并解释 Pending", "说明 Waker 为什么必不可少", "描述 executor 与 Reactor 的分工", "解释 Future 惰性与显式运行时的关系", "知道协作式调度的两条实战纪律"]' />

[上一讲：消息传递 Channel →](/concurrency/channels.md) · [下一讲：async/await、Waker 与 Pin →](/concurrency/async.md)
