---
title: 第 46 讲 · KV 第 2 步：网络与协议帧
description: 用 TcpListener、自定义 Frame 与 prost 编解码，把内存版升级成 client/server。
---

<StageHeader stage="L5 · 第 46 讲 · KV 第 2 步" level="★★★★☆" time="90 分钟" goal="让客户端能通过网络调用第 1 步的 Service" prereq="KV 第 1 步 + L4 线程" />

# 第 46 讲 · KV 第 2 步：网络与协议帧

第 1 步的 Service 只能在进程内调用。这一步把它放到网络上：**客户端发一个请求帧 → 服务端解码 → 调 Service → 编码响应帧写回**。

## 为什么需要「帧（Frame）」

TCP 是**字节流**，没有消息边界。你 `write` 两次 100 字节，对方可能一次 `read` 到 200 字节，也可能分三次。所以必须自己定义「一条消息到哪结束」。常见两种办法：

| 方案 | 做法 | 适用 |
| --- | --- | --- |
| 分隔符 | 每条消息以换行结尾 | 文本协议（Redis RESP 用类似思路） |
| **长度前缀** | 先写 4 字节长度，再写负载 | 二进制协议，本项目采用 |

```text
┌──────────────┬───────────────────────────────┐
│ 4 字节长度 N  │  N 字节的 protobuf 消息体       │
└──────────────┴───────────────────────────────┘
```

<Callout type="tip" title="原教材的做法" text="原课程用 `prost` 生成 protobuf 类型，再封装出 `AsyncProstReader / AsyncProstWriter`，把「读长度 → 读 N 字节 → 反序列化」封装成一个 Stream。这里先用同步版本讲清原理，第 3 步再改成异步。" />

## 依赖与 workspace

```toml
[workspace]
members = ["."]
resolver = "2"

[dependencies]
prost = "0.12"
bytes = "1"
tokio = { version = "1", features = ["full"] }
anyhow = "1"
tracing = "0.1"
```

```text
src/bin/kv-server.rs   # 服务端二进制
src/bin/kv-client.rs   # 客户端二进制
```

`src/bin/` 下的每个文件都会成为一个独立可执行文件，`cargo run --bin kv-server` 即可启动。

## 帧的读写

```rust
use anyhow::Result;
use bytes::{Buf, BufMut, BytesMut};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const MAX_FRAME: usize = 16 * 1024 * 1024;   // 16MB 上限，防止恶意长度

pub async fn write_frame<W: AsyncWriteExt + Unpin>(
    w: &mut W, payload: &[u8],
) -> Result<()> {
    let len = payload.len() as u32;
    w.write_all(&len.to_be_bytes()).await?;
    w.write_all(payload).await?;
    w.flush().await?;
    Ok(())
}

pub async fn read_frame<R: AsyncReadExt + Unpin>(
    r: &mut R,
) -> Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    match r.read_exact(&mut len_buf).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.into()),
    }
    let len = u32::from_be_bytes(len_buf) as usize;
    anyhow::ensure!(len <= MAX_FRAME, "帧过长：{}", len);

    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await?;
    Ok(Some(buf))
}
```

<Callout type="warn" title="三个必须处理的边界" text="1. `read_exact` 遇到对端关闭返回 UnexpectedEof，要当作「连接结束」而不是错误；2. 长度必须有上限，否则一个伪造的大数就能打爆内存；3. 半包 / 粘包由 `read_exact` 保证，自己别用单次 `read` 手动拼。" />

## 服务端：一连接一任务

```rust
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:9527").await?;
    let service = Arc::new(Mutex::new(Service::new(MemTable::default())));
    tracing::info!("KV server 监听 127.0.0.1:9527");

    loop {
        let (mut socket, addr) = listener.accept().await?;
        let svc = Arc::clone(&service);
        tokio::spawn(async move {
            loop {
                let frame = match read_frame(&mut socket).await {
                    Ok(Some(f)) => f,
                    Ok(None) => break,                       // 客户端断开
                    Err(e) => { tracing::warn!("{} 读帧失败：{}", addr, e); break; }
                };

                let cmd: Command = decode(&frame);          // prost / serde 反序列化
                let resp = svc.lock().await.execute(cmd);
                let bytes = encode(&resp);

                if let Err(e) = write_frame(&mut socket, &bytes).await {
                    tracing::warn!("{} 写帧失败：{}", addr, e);
                    break;
                }
            }
        });
    }
}
```

```rust
// 客户端
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mut stream = tokio::net::TcpStream::connect("127.0.0.1:9527").await?;
    let cmd = Command::Set {
        table: "demo".into(), key: "lang".into(),
        value: Value::Str("rust".into()),
    };
    write_frame(&mut stream, &encode(&cmd)).await?;
    let frame = read_frame(&mut stream).await?.unwrap();
    println!("响应：{:?}", decode::<Response>(&frame));
    Ok(())
}
```

<ConceptDiagram type="pipeline" title="第 2 步的分层：TCP 帧 → 解码 → Service → 编码 → TCP 帧"
  labels="TCP 帧::长度前缀|解码::prost|Service::CommandService|编码::写回帧"
  caption="第 2 步的分层：TCP 帧 → 解码 → Service → 编码 → 帧" />

<StepBox title="第 2 步落地顺序" :steps='[{"title":"先写帧工具","body":"实现 read_frame / write_frame，用两个单测验证半包与超长帧。","tip":"网络代码最难调试，先把它单独测透。"},{"title":"拆双二进制","body":"把 server 与 client 放进 src/bin/，共用 lib 里的 Service。","tip":"Cargo 会自动发现 src/bin 下的入口。"},{"title":"服务端循环","body":"accept 后 tokio::spawn 一个任务，循环读帧、执行、写回。","tip":"Service 用 Arc&lt;Mutex&lt;_&gt;&gt; 共享，锁的粒度就是一次命令执行。"},{"title":"加入日志","body":"用 tracing 记录连接、命令、耗时，出错时带 peer 地址。"},{"title":"补集成测试","body":"启动监听，用真实 TcpStream 发一个 Set 再 Get，断言结果。"}]' />

<Quiz no="46-1" q="TCP 为什么需要自定义「帧」？" :options='["为了加密", "TCP 是字节流，没有消息边界，需要显式定义一条消息的起止", "为了让代码更长", "Rust 标准库的要求"]' answer="1" explain="长度前缀是最常见的分帧方式，配合 read_exact 可以正确处理半包与粘包。" />

<Quiz no="46-2" q="`Arc&lt;Mutex&lt;Service&gt;&gt;` 里两者各解决什么？" :options='["Arc 管互斥，Mutex 管共享", "Arc 让多个任务共享所有权，Mutex 保证同一时刻只一个任务改 Service", "两者都是锁", "Arc 用于异步，Mutex 用于同步"]' answer="1" explain="与 L4 的共享状态那一节完全同构，只是把 Mutex 换成了 tokio 的异步版本。" />

<Predict no="46-3" q="客户端连上后立刻断开，服务端 `read_exact` 会？" :options='["panic", "返回 UnexpectedEof，正确实现应把它当作连接结束并退出循环", "永远阻塞", "读到 0 长度的帧"]' answer="1" output="（正常断开，无报错）" explain="把 EOF 当正常结束，是网络服务的标准写法；否则每次客户端断开都会刷一条错误日志。" />

<Exercise title="加一个命令耗时日志" task="在服务端处理每条命令时用 `std::time::Instant` 记录耗时，并用 tracing::info! 输出命令类型、耗时与 peer 地址。" hints='["在 execute 之前 let start = Instant::now()", "命令类型可以用 {:?} 打印 Debug", "tracing::info! 支持结构化字段，如 duration_ms = elapsed.as_millis()"]' solution="let start = std::time::Instant::now();\nlet resp = svc.lock().await.execute(cmd);\ntracing::info!(\n    peer = %addr,\n    duration_ms = start.elapsed().as_millis() as u64,\n    &quot;命令处理完成&quot;\n);" explain="这类埋点会在第 5 步升级成正式的指标（metrics），现在先建立习惯。" />

## 本步验收

<CheckList id="kv2-check" title="第 2 步验收" :items='["客户端能通过 TCP 完成 Set / Get", "能正确处理半包、粘包与对端关闭", "帧长度有上限", "第 1 步的单元测试仍然全绿"]' />

下一步给这条明文连接加 TLS，并把同步思路彻底改成异步流。

[下一讲：第 47 讲 KV 第 3 步 TLS 与异步 →](/projects/kv/3-async.md)
