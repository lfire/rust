---
title: 第 38 讲 · 异步 IO、Stream / Sink 与 tokio
description: Reactor 与异步 IO、tokio::net、Stream/Sink、select! 与超时取消，以及 KV Server 的异步帧封装。
---

<StageHeader stage="L4 · 第 38 讲" level="★★★★★" time="32 分钟" goal="能写出异步网络读写并用 Stream/Sink 封装协议帧" prereq="第 37 讲 async/await、Waker 与 Pin" />

# 第 38 讲 · 异步 IO、`Stream` / `Sink` 与 tokio

[上一讲](/concurrency/async.md) 讲了编译器把 `async fn` 变成什么。这一讲把整套机制落到**真实 IO**：网络怎么异步读写、连续消息怎么抽象成流、多个事件怎么同时等。学完这一讲，L4 就收尾了。

## 一、异步 IO 到底「异步」在哪

```text
同步：线程调用 read() → 内核把数据准备好之前，线程一直阻塞
异步：发起 read 后立即返回 Pending → 线程去跑别的任务
      → 内核数据就绪，Reactor（epoll/kqueue/IOCP）通知 Waker
      → executor 重新 poll，这次读到数据
```

<ConceptDiagram type="async" title="Reactor 监听 IO 事件，就绪后 Waker 唤醒 executor 重新 poll" />

| 层 | 职责 | tokio 里的对应 |
| --- | --- | --- |
| Executor | 轮询就绪任务 | 多线程 work-stealing 调度器 |
| Reactor | 等内核事件并 wake | `tokio::runtime` 的 IO driver |
| Future | 状态机 | `tokio::net::TcpStream` 的 read/write |
| Waker | 通知「可以再 poll」 | 运行时内部 |

<Callout type="warn" title="别在 tokio 里用同步 IO" text="`std::net::TcpStream` / `std::fs::File` 会**阻塞整个 worker 线程**，让同一线程上的所有异步任务停摆。要用 `tokio::net::TcpStream`、`tokio::fs`，或把同步操作放进 `spawn_blocking`。" />

## 二、`AsyncRead` / `AsyncWrite`：异步帧读写

```rust
use anyhow::Result;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const MAX_FRAME: usize = 16 * 1024 * 1024;

async fn read_frame(s: &mut TcpStream) -> Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    match s.read_exact(&mut len_buf).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.into()),
    }
    let len = u32::from_be_bytes(len_buf) as usize;
    anyhow::ensure!(len <= MAX_FRAME, "帧过长：{}", len);
    let mut buf = vec![0u8; len];
    s.read_exact(&mut buf).await?;
    Ok(Some(buf))
}

async fn write_frame(s: &mut TcpStream, payload: &[u8]) -> Result<()> {
    s.write_all(&(payload.len() as u32).to_be_bytes()).await?;
    s.write_all(payload).await?;
    s.flush().await?;
    Ok(())
}
```

和 [KV 第 2 步 同步版](/projects/kv/2-network.md) 几乎一样，只多了 `.await` —— 但语义完全不同：等数据时线程已经去服务别的连接了。

<Compare title="同步帧 vs 异步帧" :panels='[{"label":"同步（KV 第 2 步）","code":"let mut s = TcpStream::connect(addr)?;\ns.read_exact(&amp;mut buf)?;\n// 阻塞直到数据到达","note":"一个连接占一个线程"},{"label":"异步（本讲）","code":"let mut s = TcpStream::connect(addr).await?;\ns.read_exact(&amp;mut buf).await?;\n// Pending 时让出线程","note":"少量线程服务大量连接"}]' note="协议层逻辑不变，变的只是等待方式与承载并发的能力。" />

## 三、`Stream`：异步版 `Iterator`

`Future` 是「一个未来会完成的值」，`Stream` 是「一连串异步产生的值」：

```rust
pub trait Stream {
    type Item;
    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>)
        -> Poll<Option<Self::Item>>;
}
```

| | `Iterator` | `Stream` |
| --- | --- | --- |
| 取值 | `next()` 同步阻塞 | `next().await` 异步等待 |
| 结束信号 | `None` | `None` |
| 适配器 | `map` / `filter` / `collect` | `StreamExt` 的同名方法 |
| 背压 | 由调用方控制节奏 | `poll_next` 天然按需拉取 |

```rust
use futures::{stream, StreamExt};

#[tokio::main]
async fn main() {
    let mut s = stream::iter(vec![1, 2, 3, 4])
        .filter(|x| futures::future::ready(x % 2 == 0))
        .map(|x| x * 10);

    while let Some(v) = s.next().await {
        println!("{}", v);     // 20 40
    }
}
```

`Sink` 是反方向：「异步地往里写值」，常用 `SinkExt::send` / `send_all`。把读侧包成 `Stream`、写侧包成 `Sink`，就得到一个能同时收发协议帧的双向对象 —— 这正是 [KV 第 3 步](/projects/kv/3-async.md) 里 `ProstStream` 的做法。

<CodeTabs title="KV Server 的协议帧抽象" :tabs='[{"label":"概念版","code":"struct Framed&lt;S&gt; { stream: S, buf: BytesMut }\n\n// 实现 Stream：从 buf 里解出一个个 Frame\n// 实现 Sink：把 Frame 编码后 write_all","note":"读写两侧各一个 trait"},{"label":"真实项目","code":"// KV 第 3 步 的 ProstStream\nimpl&lt;S, In, Out&gt; Stream for ProstStream&lt;S, In, Out&gt; { /* ... */ }\nimpl&lt;S, In, Out&gt; Sink&lt;Out&gt; for ProstStream&lt;S, In, Out&gt; { /* ... */ }","note":"Stream + Sink 让协议层可组合"}]' />

## 四、`select!`、超时与取消

一个连接常常要同时等多件事：新请求、关闭信号、心跳超时。

```rust
use tokio::time::{timeout, Duration};

async fn serve(mut frames: impl futures::Stream<Item = Vec<u8>> + Unpin,
               mut shutdown: tokio::sync::broadcast::Receiver<()>) {
    loop {
        tokio::select! {
            Some(frame) = frames.next() => {
                if let Err(e) = timeout(Duration::from_secs(5), handle(frame)).await {
                    eprintln!("处理超时：{}", e);
                }
            }
            _ = shutdown.recv() => {
                println!("收到关停信号");
                break;
            }
            else => break,
        }
    }
}

async fn handle(_frame: Vec<u8>) { /* ... */ }
```

要点：

- `select!` 同时轮询多个分支，**谁先就绪执行谁**，其余分支被取消。
- 取消是协作式的：任务在下一个 `.await` 才真正停下；**取消不等于回滚**，半途写入的数据要自己保证一致。
- `timeout` 给单个操作设上限，`JoinHandle::abort()` 强制终止任务。

```rust
let h = tokio::spawn(async { /* 长任务 */ });
h.abort();                  // 请求取消
let _ = h.await;            // 可取回 Cancelled 错误
```

<Callout type="warn" title="取消安全性（cancellation safety）" text="不是所有 Future 被中途取消都安全。例如 `read_exact` 被取消时可能已经读走了一部分字节，重试就错位了。tokio 文档会给方法标注是否 cancellation-safe；不安全的要么用 `select!` 的 `biased;` + 状态保存，要么把操作包进独立 spawn 的任务里。" />

## 五、优雅关闭与运行时配置

```rust
#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> anyhow::Result<()> {
    let (tx, _) = tokio::sync::broadcast::channel(1);
    // ... 把 tx.subscribe() 分发给各连接任务 ...
    tokio::signal::ctrl_c().await?;
    let _ = tx.send(());      // 广播关停
    Ok(())
}
```

| 配置 | 用途 |
| --- | --- |
| `#[tokio::main]` | 默认多线程运行时 |
| `flavor = "current_thread"` | 单线程，适合测试 / 嵌入式 |
| `worker_threads = N` | 工作线程数，默认约等于 CPU 核数 |
| `tokio::task::spawn_blocking` | 把 CPU 密集 / 同步 IO 挪出异步线程 |
| `CancellationToken`（tokio-util） | 比 broadcast 更清晰的关停传播 |

## 补充：async 的传染性与同步边界

写了几讲异步之后，有个现象值得单独点破：**`.await` 会顺着调用链往上传染**。原因只有两条规则 —— `async fn` 里的代码只有被 `.await` 才会真正执行，而 `.await` 只能写在 `async fn` / `async {}` 里。于是调用者也被迫变成异步：

```rust
async fn foo1() -> u32 { 100 }
async fn foo2() -> u32 { foo1().await }
async fn foo3() -> u32 { foo2().await }

#[tokio::main]
async fn main() { println!("{}", foo3().await); }
```

这就是很多人口中的「async 是个独立王国」：一旦入口选了异步，调用链上的函数、错误处理、trait 定义、测试写法都会跟着变。

### 三道边界怎么过

| 场景 | 做法 | 为什么 |
| --- | --- | --- |
| async 里做内存内操作（`vec.push`、算术） | 照常写 | 不涉及等待，和同步 Rust 完全一样 |
| async 里碰到阻塞 IO / 重 CPU 计算 | 放进 `tokio::task::spawn_blocking` | 否则占住一个 worker 线程，同线程上所有任务停摆（第五节已讲） |
| 同步代码里要跑一个 Future | 建 Runtime 后 `rt.block_on(fut)` | 需要一个 executor 来 poll，`#[tokio::main]` 就是它的语法糖 |

```rust
// #[tokio::main] 展开后大致是这样
fn main() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        println!("Hello world");
    });
}
```

测试或一次性脚本里可以用 `new_current_thread()` 建单线程 runtime，不必起线程池。注意 `block_on` 会**阻塞当前线程**，不要在 async 任务内部再调它。

<Callout type="warn" title="给写库的人一条建议" text="库函数不要为了「看起来现代」就标 async：一旦标了，所有下游调用方都被迫异步化，还把执行方式绑死在某个 runtime 上。能保持同步的接口就保持同步，让调用方自己决定要不要包进 `spawn_blocking`。另外，trait 里的 `async fn` 自 Rust 1.75 起已经稳定，静态分发场景不再需要 `async_trait` 宏那层过渡方案；但 `dyn Trait` 目前仍不支持异步方法，遇到对象安全需求时那个 crate 还会用到。" />

<Quiz no="38-5" q="同步函数里想执行一个 async 函数，正确做法是？" :options='["直接调用它，Rust 会自动驱动", "建 runtime 后用 block_on 驱动这个 Future", "在同步函数里写 .await", "把函数改成 unsafe"]' answer="1" explain="Future 是惰性的，必须有 executor 轮询；同步函数里没有 .await 上下文，只能用 runtime 的 block_on 作为入口。" />

## 六、和 L5 项目的连线

| 项目 | 用到的本讲内容 |
| --- | --- |
| [KV 第 3 步 TLS 与异步](/projects/kv/3-async.md) | `TcpStream` → `TlsStream`、`ProstStream` 的 Stream/Sink、`select!` |
| [KV 第 4 步 重构与 Pub/Sub](/projects/kv/4-refactor.md) | yamux 多路复用、事件广播、`broadcast` channel |
| [第 48 讲 网络编程进阶](/projects/network-advanced.md) | 连接注册表、背压、心跳超时、优雅关闭 |
| [第 64 讲 gRPC 微服务](/projects/grpc.md) | tonic 的流式 RPC 本质就是 `Stream` |
| [第 65 讲 边缘与 Serverless](/projects/edge.md) | 异步运行时的冷启动与资源限制 |

<Predict no="38-1" q="`Stream::poll_next` 返回 `Poll::Pending` 意味着？" :options='["流已结束", "暂时没有下一个值，就绪时会由 Waker 唤醒", "出错了", "需要新建线程"]' answer="1" output="Pending" explain="与 Future::poll 同理；Pending 表示让出，等 Waker 唤醒后再取。" />

<Quiz no="38-2" q="关于 tokio 的异步 IO，哪些说法正确？" :options='["在 tokio 任务里用 std::net::TcpStream 会阻塞整个 worker 线程", "AsyncReadExt::read_exact 需要 .await", "Reactor 负责监听内核事件并触发 Waker", "select! 会等所有分支都完成才返回"]' answer="0,1,2" multi="true" explain="select! 是「谁先就绪执行谁」，其余分支被取消，不是等全部完成。" />

<Quiz no="38-3" q="`tokio::spawn` 与 `spawn_blocking` 的区别是？" :options='["前者跑异步 Future，后者跑阻塞型 CPU / 同步 IO 任务", "两者完全一样", "后者只能用于测试", "前者会自动开新线程"]' answer="0" explain="阻塞任务必须放到专门的阻塞线程池，否则会占住异步 worker。" />

<Quiz no="38-4" q="关于取消，哪个说法正确？" :options='["取消会自动回滚已做的写入", "取消是协作式的，在下一个 await 才生效，需关注 cancellation safety", "abort 会等待任务自然结束", "select! 的其余分支会继续执行完"]' answer="1" explain="取消不回滚；tokio 会标注方法是否 cancellation-safe，不安全的要自己保存状态。" />

<Exercise title="给帧读取加超时与关停" task="基于本讲的 `read_frame`，写 `async fn serve(s: &mut TcpStream, mut shutdown: broadcast::Receiver&lt;()&gt;)`：用 `select!` 同时等待「带 30 秒超时的读帧」与「关停信号」，对端断开或关停时打印日志并退出。" hints='["读帧用 tokio::time::timeout(Duration::from_secs(30), read_frame(s))", "select! 里区分 Ok(Ok(Some(f)))、Ok(Ok(None))、Err(_)", "关停分支直接 break"]' solution="async fn serve(s: &amp;mut TcpStream, mut shutdown: broadcast::Receiver&lt;()&gt;) -&gt; Result&lt;()&gt; {\n    loop {\n        tokio::select! {\n            res = timeout(Duration::from_secs(30), read_frame(s)) =&gt; {\n                match res {\n                    Ok(Ok(Some(frame))) =&gt; handle_frame(frame),\n                    Ok(Ok(None)) =&gt; { println!(&quot;对端关闭&quot;); break; }\n                    Ok(Err(e)) =&gt; return Err(e),\n                    Err(_) =&gt; { println!(&quot;心跳超时&quot;); break; }\n                }\n            }\n            _ = shutdown.recv() =&gt; { println!(&quot;关停&quot;); break; }\n        }\n    }\n    Ok(())\n}" explain="超时、关停、对端断开三条退出路径都要显式处理，这是长连接服务的标准骨架。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 用了 tokio 却整服务卡顿 | 混进了同步 IO / 重 CPU 计算 → `tokio::fs` / `spawn_blocking` |
| `select!` 后数据错位 | 分支 Future 不 cancellation-safe → 保存状态或独立 spawn |
| 关停时有请求丢失 | 广播关停 + 宽限期等待任务收敛（见第 48 讲 网络编程进阶） |
| `Stream` 里的 filter 编译不过 | `StreamExt::filter` 的闭包要返回 `Future`，用 `futures::future::ready(...)` |
| 运行时 panic `no reactor running` | 在 `#[tokio::main]` 之外调用了 tokio 的 IO |

## 小结

- 异步 IO = Reactor 监听内核事件 + Waker 唤醒 + executor 重新 poll；同步 IO 会阻塞整个 worker。
- `Stream` 是异步版 `Iterator`，`Sink` 是异步写入端；两者组合出可复用的协议帧层。
- `select!` 谁先就绪执行谁，超时与取消要关注 cancellation safety。
- `spawn_blocking` 承接 CPU 密集与同步 IO；优雅关闭靠广播 + 宽限期。
- L4 到此结束，接下来把这些机制投进 [工程实战](/projects/)。

<CheckList id="async-io-check" title="学完本节，你应该能…" :items='["画出 Reactor / Waker / executor 的关系", "写出异步的长度前缀帧读写", "说出 Stream 与 Iterator 的对应关系", "用 select! 处理超时与关停", "解释 cancellation safety 为什么重要"]' />

[上一讲：async/await、Waker 与 Pin →](/concurrency/async.md) · [进入阶段五：工程实战 →](/projects/)
