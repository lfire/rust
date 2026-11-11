---
title: 第 37 讲 · async/await、Waker 与 Pin
description: async fn 编译成什么状态机、Waker 如何唤醒、Pin 为何必要，以及 Unpin 与常见陷阱。
---

<StageHeader stage="L4 · 第 37 讲" level="★★★★★" time="30 分钟" goal="能说清 async fn 编译后的状态机与 Pin 的作用" prereq="第 36 讲 Future 与 executor" />

# 第 37 讲 · `async/await`、Waker 与 Pin

[上一讲](/concurrency/future-executor.md) 手写了 Future 和 executor，知道了「谁在轮询、谁在唤醒」。这一讲往上看一层：**编译器把 `async fn` 变成了什么**，以及为什么 `Future::poll` 的签名里有个奇怪的 `Pin<&mut Self>`。

异步 IO、Stream/Sink 与 tokio 实战留到 [第 38 讲](/concurrency/async-io.md)。

## 一、`async fn` 会被编译成状态机

一次 `await` 就是一次状态切换：从 Start 到 Pending 让出线程，再由 Waker 唤醒。

<ConceptDiagram type="state-machine" title="async fn 的状态机" />

```rust
async fn fetch_user(id: u32) -> String {
    let a = read_db(id).await;
    let b = enrich(a).await;
    b
}
```

你写的是顺序代码，编译器生成的却大致是一台**状态机**（概念示意）：

```rust
enum FetchUserState {
    Start { id: u32 },
    WaitingDb { fut: ReadDbFuture },
    WaitingEnrich { fut: EnrichFuture, a: String },
    Done,
}

impl Future for FetchUserState {
    type Output = String;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<String> {
        // 每个 .await 是一个状态边界：
        // poll 子 Future，Pending 就把状态记下来并返回 Pending，
        // 下次从当前状态继续，而不是从头重跑。
        todo!()
    }
}
```

<Compare title="三种写法，同一段逻辑" :panels='[{"label":"同步","code":"let a = read_db(id);\nlet b = enrich(a);","note":"阻塞线程，最简单"},{"label":"回调","code":"read_db(id, |a| {\n    enrich(a, |b| { ... });\n});","note":"回调嵌套，状态散落各处"},{"label":"async/await","code":"let a = read_db(id).await;\nlet b = enrich(a).await;","note":"写起来像同步，编译成状态机"}]' note="async/await 的核心价值：用同步的写法拿到异步的调度能力，且不分配每个任务独立的栈。" />

三个关键点：

- **每个 `.await` 是一个状态边界**。局部变量 `a` 会被存进状态机的字段里，跨 await 存活。
- **状态机大小在编译期确定**，通常几十到几百字节，远小于线程栈（默认 2 MB）。
- **Future 是惰性的**：调用 `async fn` 只是构造出状态机，一行都还没执行。

<Predict no="37-1" q="只写 `let f = fetch_user(1);` 不 await 也不 spawn，会？" :options='["立刻执行 read_db", "什么都不发生，还可能收到 unused 警告", "自动在新线程执行", "编译失败"]' answer="1" output="（无输出）warning: unused implementer of `Future` that must be used" explain="async fn 只构造状态机；必须 .await 或交给 executor 才会被 poll。" />

## 二、Waker：谁把任务放回就绪队列

[上一讲](/concurrency/future-executor.md) 的 `block_on` 里，`Waker` 的作用是「就绪时把任务重新放回队列」。展开看它提供的能力：

| 方法 | 含义 |
| --- | --- |
| `wake(self)` | 消费 Waker，唤醒一次 |
| `wake_by_ref(&self)` | 不消费，可多次唤醒（Reactor 常用） |
| `will_wake(&self, other)` | 两个 Waker 是否指向同一任务，用于避免重复注册 |
| `clone()` | Waker 可克隆，注册到多个事件源 |

```rust
// Reactor 侧的典型写法（概念）
fn on_io_ready(waker: &Waker) {
    waker.wake_by_ref();     // 告诉 executor：这个任务可以再 poll 了
}
```

<Callout type="warn" title="wake 不是「立刻执行」" text="它只是把任务**标记为就绪**。真正的 poll 仍由 executor 在下一个循环里做。所以一次 wake 可能被合并多次唤醒，Future 必须能容忍「被多 poll 一次」—— 这也是为什么 poll 要写成幂等的状态推进。" />

`RawWaker` / `RawWakerVTable` 是手写运行时才需要碰的底层（把 `Arc<Task>` 手工塞进 Waker），业务代码永远不会用到；`ArcWake`（futures crate）或 `Waker::from(Arc<T>)` 是更安全的封装。

<ConceptDiagram type="async" title="Future 在 .await 处返回 Pending，Reactor 就绪后 Waker 唤醒，executor 重新 poll" />

## 三、Pin：为什么 `poll` 要 `Pin<&mut Self>`

回到状态机：`.await` 之间可能有一个局部变量是**引用**，指向同一状态机里的另一个字段：

```rust
async fn tricky() {
    let mut data = String::from("hi");
    let r = &data;          // 自引用：r 指向同一个状态机里的 data
    yield_now().await;
    println!("{}", r);      // await 之后还要用 r
}
```

如果这台状态机在内存里被移动，`r` 指向的旧地址就失效了。`Pin` 是给类型系统的承诺：**这个值不会再被移动**，因此自引用安全。

| 概念 | 含义 |
| --- | --- |
| `Pin<P>` | 包装一个指针，禁止安全地拿到 `&mut T`（防止 `mem::swap` 之类把值搬走） |
| `Unpin` | 自动实现的标记 trait：类型**可以安全移动**。绝大多数普通类型都是 Unpin |
| `!Unpin` | 编译器生成的 async 状态机、自引用结构通常不是 Unpin |
| `Box::pin(x)` / `std::pin::pin!` | 把值固定到堆上 / 栈上，得到 `Pin<...>` |

```rust
use std::pin::Pin;

fn main() {
    let fut = async { 42 };
    // 想 poll 它，先固定
    let mut pinned = Box::pin(fut);
    // Pin<&mut _> 可以传给需要 Pin<&mut Self> 的 poll
    let _: Pin<&mut _> = pinned.as_mut();
}
```

<Callout type="idea" title="初学阶段怎么用" text="写 `async fn` 时**完全不用手写 Pin** —— 编译器替你处理。只有手写 `impl Future`、实现自引用结构、或读 tokio 源码时才会遇到。看到 `Pin<&mut Self>` 知道它是「别移动我，我里面有自引用」就够了。" />

<CodeTabs title="Pin 相关写法" :tabs='[{"label":"业务代码（常见）","code":"async fn handler() -&gt; u32 { 42 }\n\n#[tokio::main]\nasync fn main() {\n    println!(\"{}\", handler().await);\n}","note":"编译器全权处理 Pin"},{"label":"手写 Future（少见）","code":"impl Future for MyFuture {\n    type Output = ();\n    fn poll(self: Pin&lt;&amp;mut Self&gt;, cx: &amp;mut Context&lt;\x27_\x27&gt;)\n      -&gt; Poll&lt;()&gt; { /* ... */ }\n}","note":"需要 Pin::get_unchecked_mut 或 pin-project 等辅助"}]' />

## 四、`Send` 与 `'static`：异步任务的额外约束

`tokio::spawn` 要求 `Future + Send + 'static`，因为任务可能在不同 worker 线程间迁移：

```rust
// ❌ 不是 Send：Rc 跨 .await 存活
// async fn bad() {
//     let rc = Rc::new(1);
//     sleep(Duration::from_millis(1)).await;
//     println!("{}", rc);
// }
```

| 常见报错 | 原因 |
| --- | --- |
| `future is not Send` | 跨 await 持有 `Rc` / `RefCell` / `std::sync::MutexGuard` → 换 `Arc` / `tokio::sync::Mutex` |
| `borrowed data escapes outside` | 任务借用了局部变量 → 用 `move` 或改拥有所有权 |
| 递归 async fn 编译失败 | 状态机无限大小 → `Box::pin(f(args))` 打断递归 |
| `higher-ranked lifetime error` | 闭包签名与借用冲突，常见于 `for<'a>` 场景 |

<Callout type="warn" title="别在异步任务里持锁跨 await" text="`std::sync::MutexGuard` 不是 Send，编译器会拦；换成 `tokio::sync::Mutex` 虽然能过，但锁会一直占到 await 结束，把并发度打回 1。正确做法：在临界区里取出需要的数据，释放锁后再 await。" />

<Quiz no="37-2" q="`async fn` 里的每个 `.await` 对应状态机的什么？" :options='["一个新线程", "一个状态边界，局部变量被存进状态机字段", "一次内存分配", "一个 Waker"]' answer="1" explain="await 把函数切成多个状态，跨 await 的变量成为状态机字段。" />

<Quiz no="37-3" q="`Pin` 主要解决什么问题？" :options='["提升性能", "防止自引用状态机被移动导致指针失效", "让 Future 自动执行", "替代 Box"]' answer="1" explain="编译器生成的 async 状态机可能自引用；Pin 保证它不再被移动。" />

<Quiz no="37-4" q="关于 Waker，哪些说法正确？" :options='["wake 只是把任务标记为就绪，不立刻执行", "wake_by_ref 不消费 Waker", "Future 应能容忍被多 poll 一次", "每次 Pending 都必须新建线程来 wake"]' answer="0,1,2" multi="true" explain="唤醒由 Reactor 统一处理，绝不是一个 Future 一个线程。" />

<Exercise title="找出三处 Send 问题" task="下面 async 函数里有哪些值跨 `.await` 存活后会导致 future 不是 Send？逐一说明并给出替换方案。" hints='["Rc 换 Arc", "RefCell 换 Mutex 或 tokio::sync::Mutex", "std::sync::MutexGuard 要在 await 前 drop"]' solution="// 原：Rc、RefCell、MutexGuard 跨 await 存活\n// 改：\nlet shared = Arc::new(tokio::sync::Mutex::new(0));\n{\n    let mut guard = shared.lock().await;\n    *guard += 1;\n}   // guard 在这里释放\ntokio::time::sleep(Duration::from_millis(1)).await;  // 之后不再持有锁" explain="核心思路：await 之前结束所有非 Send 值的生命周期，或换成对应的线程安全类型。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 异步代码「没跑」 | Future 没被 await / spawn |
| `future is not Send` | 排查跨 await 的 Rc / RefCell / Guard |
| `Pin` 相关编译错误 | 写 async fn 不该遇到；手写 Future 用 `pin-project` |
| 递归 async fn 报错 | `Box::pin` 打断无限大小 |
| 任务被多 poll 一次就出错 | poll 必须幂等，别在里面做一次性副作用 |

## 小结

- `async fn` 编译成状态机，每个 `.await` 是一个状态边界，局部变量存进字段。
- `Waker` 把就绪任务放回队列；`wake` 不是立刻执行，poll 必须幂等。
- `Pin` 保证可能自引用的状态机不被移动；`Unpin` 是「可以安全移动」的标记。
- `tokio::spawn` 要求 `Send + 'static`，跨 await 的非 Send 值是最常见的编译错误来源。
- 下一讲把这套机制落到真实 IO、Stream/Sink 与 tokio 上。

<CheckList id="async-internals-check" title="学完本节，你应该能…" :items='["解释 async fn 编译成状态机的过程", "说出 Waker 的唤醒语义与幂等要求", "解释 Pin 和 Unpin 各自解决什么", "排查 future is not Send 的常见原因", "知道为什么不能持锁跨 await"]' />

[上一讲：Future 与 executor →](/concurrency/future-executor.md) · [下一讲：异步 IO、Stream / Sink 与 tokio →](/concurrency/async-io.md)
