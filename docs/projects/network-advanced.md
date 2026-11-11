---
title: 第 48 讲 · 网络编程进阶
description: 连接管理、心跳与优雅关闭，控制面与数据面分离，以及 P2P 场景下的背压设计。
---

<StageHeader stage="L5 · 第 48 讲" level="★★★★☆" time="70 分钟" goal="写出能管理大量长连接并干净退出的服务" prereq="KV 第 2 步 网络与协议帧 + L4 异步" />

# 第 48 讲 · 网络编程进阶

[KV 第 2 步](/projects/kv/2-network.md) 做到了「一连接一任务」，但真实服务还要回答：连接谁在管？断开怎么感知？关服务时在途请求怎么办？慢客户端会不会拖垮整机？这一讲把这些问题收进一个**连接管理器**。

## 四个真实问题

| 问题 | 朴素做法的风险 | 这一讲的做法 |
| --- | --- | --- |
| 连接谁管 | 任务各自为政，无法统一广播 / 统计 | 中心 `ConnectionManager` 持有所有连接的发件箱 |
| 断开感知 | 靠读循环返回，异常断开可能漏 | 任务结束时 `Drop` 守卫自动注销 |
| 优雅关闭 | 直接 `exit` 丢掉在途请求 | `broadcast` 关停信号 + 等待任务收敛 |
| 慢客户端 | 无界队列吃光内存 | 有界 `mpsc` + 背压 + 心跳超时 |

<ConceptDiagram type="thread" title="控制面（关停/统计/广播）与数据面（逐连接收发）分离" />

<Callout type="idea" title="控制面 / 数据面分离" text="把「管理所有连接」的逻辑和「处理某一个连接」的逻辑分开：前者是控制面，操作的是注册表与广播通道；后者是数据面，只关心一个 socket 的读写。这样加监控、加限流、加优雅关闭都不会侵入协议代码 —— 和 [KV 第 1 步](/projects/kv/1-memory.md) 的 trait 分层是同一套思路。" />

## 依赖

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
tokio-util = "0.7"
tracing = "0.1"
anyhow = "1"
```

<StepBox title="分步实现" :steps='[{"title":"定义注册表","body":"`Arc&lt;DashMap&lt;u64, mpsc::Sender&lt;Frame&gt;&gt;&gt;` 保存每个连接的写通道。","tip":"写通道让控制面能主动推消息，而不必持有 socket。"},{"title":"连接任务自注销","body":"spawn 时插入注册表，用一个 Drop 守卫在任务结束时按 id 移除。","tip":"比在每个错误分支手动 remove 可靠得多。"},{"title":"有界发件箱","body":"`mpsc::channel(32)`，满时 send 等待而不是无限缓冲。","tip":"容量就是背压阈值，按业务延迟目标调。"},{"title":"关停广播","body":"`broadcast::channel(1)`，主循环 select! 同时等 accept 与 ctrl_c。","tip":"每个连接任务也在 select! 里监听关停信号。"},{"title":"心跳超时","body":"`tokio::time::timeout` 包住读帧，超时则主动断开并记日志。"},{"title":"等待收敛","body":"用 JoinSet 收集任务，关停后给一个宽限期再 abort 残余任务。"}]' />

## 完整代码（连接管理器骨架）

```rust
use anyhow::Result;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{broadcast, mpsc, Mutex},
    task::JoinSet,
    time::timeout,
};
use tokio_util::sync::CancellationToken;

type ConnId = u64;
type Frame = Vec<u8>;
type Registry = Arc<Mutex<HashMap<ConnId, mpsc::Sender<Frame>>>>;

struct ConnGuard { id: ConnId, registry: Registry }
impl Drop for ConnGuard {
    fn drop(&mut self) {
        let reg = self.registry.clone();
        let id = self.id;
        tokio::spawn(async move { reg.lock().await.remove(&id); });
    }
}

async fn read_frame(s: &mut TcpStream) -> Result<Option<Frame>> {
    use tokio::io::AsyncReadExt;
    let mut len = [0u8; 4];
    match s.read_exact(&mut len).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.into()),
    }
    let n = u32::from_be_bytes(len) as usize;
    anyhow::ensure!(n <= 16 * 1024 * 1024, "帧过长");
    let mut buf = vec![0u8; n];
    s.read_exact(&mut buf).await?;
    Ok(Some(buf))
}

async fn handle_conn(
    mut socket: TcpStream,
    id: ConnId,
    registry: Registry,
    mut shutdown: broadcast::Receiver<()>,
    cancel: CancellationToken,
) {
    let _guard = ConnGuard { id, registry: registry.clone() };
    let (tx, mut rx) = mpsc::channel::<Frame>(32);   // 有界：天然背压
    registry.lock().await.insert(id, tx);

    loop {
        tokio::select! {
            // 控制面：全局关停
            _ = shutdown.recv() => {
                tracing::info!(id, "收到关停信号");
                break;
            }
            _ = cancel.cancelled() => break,

            // 数据面：读请求（带心跳超时）
            frame = timeout(Duration::from_secs(30), read_frame(&mut socket)) => {
                match frame {
                    Ok(Ok(Some(req))) => {
                        // 这里接 KV 第 2 步 的解码 + Service 执行
                        let resp = req;                 // 示例：原样回显
                        let mut out = (resp.len() as u32).to_be_bytes().to_vec();
                        out.extend_from_slice(&resp);
                        if rx.try_send(out).is_err() {
                            tracing::warn!(id, "发件箱积压，触发背压");
                        }
                    }
                    Ok(Ok(None)) => break,             // 对端正常关闭
                    Ok(Err(e)) => { tracing::warn!(id, "读帧失败：{}", e); break; }
                    Err(_) => { tracing::warn!(id, "心跳超时"); break; }
                }
            }

            // 数据面：写响应
            Some(out) = rx.recv() => {
                use tokio::io::AsyncWriteExt;
                if socket.write_all(&out).await.is_err() { break; }
            }
        }
    }
    tracing::info!(id, "连接结束");
}

#[tokio::main]
async fn main() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:9527").await?;
    let registry: Registry = Arc::new(Mutex::new(HashMap::new()));
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    let cancel = CancellationToken::new();
    let mut tasks = JoinSet::new();
    let mut next_id: ConnId = 0;

    loop {
        tokio::select! {
            Ok((socket, addr)) = listener.accept() => {
                next_id += 1;
                let reg = registry.clone();
                let rx = shutdown_tx.subscribe();
                let token = cancel.clone();
                tasks.spawn(async move {
                    tracing::info!(%addr, "新连接");
                    handle_conn(socket, next_id, reg, rx, token).await;
                });
            }
            _ = tokio::signal::ctrl_c() => {
                tracing::info!("开始优雅关闭");
                let _ = shutdown_tx.send(());
                break;
            }
        }
    }

    // 给在途请求一个宽限期，再强制取消
    let grace = Duration::from_secs(5);
    if tokio::time::timeout(grace, async {
        while tasks.join_next().await.is_some() {}
    }).await.is_err() {
        cancel.cancel();
        tasks.abort_all();
    }
    tracing::info!("活跃连接：{}", registry.lock().await.len());
    Ok(())
}
```

<Callout type="warn" title="Drop 守卫里的 tokio::spawn 是妥协" text="`Drop` 不能 `await`，示例里用 spawn 异步移除注册表项。生产代码更推荐把注销逻辑显式写在任务末尾并配一个 finally 式的封装，避免关停瞬间 spawn 被运行时丢弃导致注册表残留。" />

## 背压与心跳参数怎么定

| 参数 | 影响因素 | 建议起点 |
| --- | --- | --- |
| 发件箱容量 | 单连接可容忍的排队延迟 | 32（突发多则 128） |
| 心跳超时 | 网络 RTT、客户端是否移动端 | 30 s |
| 帧大小上限 | 业务最大消息 | 16 MB，且要校验长度前缀 |
| 关停宽限期 | 在途请求最长耗时 | P99 × 2 |
| accept 并发上限 | 文件描述符 / 内存 | 用 semaphore 显式限流 |

<Quiz no="48-1" q="把发件箱设成有界 `mpsc::channel(32)` 的主要目的是？" :options='["提升吞吐", "对慢客户端形成背压，避免无界队列吃光内存", "减少代码", "让消息有序"]' answer="1" explain="有界队列把「生产快于消费」变成显式等待，而不是无限缓冲。" />

<Quiz no="48-2" q="为什么需要「控制面 / 数据面」分离？" :options='["编译器要求", "关停、广播、统计等全局动作不必侵入单连接的协议代码", "能少用锁", "TCP 协议规定"]' answer="1" explain="注册表 + 广播通道让全局管理与逐连接处理各自独立演化。" />

<Exercise title="加广播接口" task="暴露一个函数 `broadcast_all(registry, frame)`，把同一帧发给所有活跃连接；要求对已关闭的连接静默跳过，并统计成功送达数。" hints='["先 clone 一份 HashMap 快照，避免持锁做 await", "send().await 失败说明对方已关闭，忽略即可", "返回送达数量"]' solution="async fn broadcast_all(reg: Registry, frame: Frame) -&gt; usize {\n    let snapshot: Vec&lt;_&gt; = reg.lock().await.clone().into_iter().collect();\n    let mut sent = 0;\n    for (_, tx) in snapshot {\n        if tx.send(frame.clone()).await.is_ok() { sent += 1; }\n    }\n    sent\n}" explain="先克隆快照再逐个 await，是为了不让持锁时间被慢连接拖长。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 关停后端口仍被占用 | 任务在宽限期后 abort，socket 全部释放再退出 |
| 注册表残留死连接 | 用 Drop 守卫 / 显式注销，并定期清理发送失败的项 |
| 慢客户端拖慢广播 | 用 `try_send` 而非 `send().await`，满则标记降级 |
| `read_exact` 报 UnexpectedEof | 对端正常断开，返回 None 而不是记错误日志 |
| 半包 / 粘包 | 坚持用 `read_exact` 读长度与负载，别用单次 `read` |

## 扩展挑战

- 用 `tokio::sync::Semaphore` 限制最大连接数并给新连接返回友好提示。
- 加指标：活跃连接数、帧大小分布、心跳超时次数（[KV 第 5 步](/projects/kv/5-production.md)）。
- 把 [KV 第 3 步 TLS](/projects/kv/3-async.md) 接进来，比较明文与加密连接的关停差异。
- 用 `yamux` 做多路复用（[KV 第 4 步](/projects/kv/4-refactor.md)），再看连接管理器要怎么改。
- 做一个最小 P2P：节点之间互换地址列表，用同样的帧协议通信。

<CheckList id="net-adv-check" title="验收清单" :items='["连接建立与断开都能在注册表里正确反映", "Ctrl+C 后在途请求有宽限期", "有界发件箱能阻止内存无限增长", "心跳超时会主动断开", "帧长度有上限校验"]' />

[上一讲：第 47 讲 KV 第 3 步 TLS 与异步 →](/projects/kv/3-async.md) · [下一讲：第 49 讲 SQL / CSV 数据工具 →](/projects/sql-data-tool.md) · [KV 贯穿线：第 55 讲 大重构与 Pub/Sub →](/projects/kv/4-refactor.md)
