---
title: 第 47 讲 · KV 第 3 步：TLS 与异步
description: 生成 x509 证书、给 TCP 加 TLS、把帧读写封装成 Stream/Sink，并接入 tokio。
---

<StageHeader stage="L5 · 第 47 讲 · KV 第 3 步" level="★★★★☆" time="100 分钟" goal="让服务加密且能异步处理大量连接" prereq="KV 第 2 步 + L4 异步" />

# 第 47 讲 · KV 第 3 步：TLS 与异步

第 2 步已经能跑，但有两个问题：数据在网络上**明文传输**，以及帧读写还是手写的同步式循环。这一步同时解决它们。

<ConceptDiagram type="async" title="tokio 用少量线程驱动大量 Future，IO 就绪时由 Waker 唤醒" />

## 一、先生成证书

```bash
# 生成 CA 私钥与自签名证书
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout ca.key -out ca.pem -days 365 \
  -subj "/CN=MyKV-CA"

# 生成服务端证书签名请求
openssl req -newkey rsa:4096 -nodes \
  -keyout server.key -out server.csr \
  -subj "/CN=localhost"

# 用 CA 签发，带上 SAN（现代 TLS 校验必需）
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key \
  -CAcreateserial -out server.pem -days 365 \
  -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1")
```

<Callout type="warn" title="别把私钥提交进仓库" text="`*.key` 必须进 .gitignore。生产环境用 Let’s Encrypt 或内部 PKI，并给证书配置自动轮换。自签名证书只用于本地开发。" />

## 二、给服务端加 TLS

```toml
[dependencies]
tokio-rustls = "0.25"
rustls-pemfile = "2"
```

```rust
use std::{fs::File, io::BufReader, path::Path, sync::Arc};
use tokio_rustls::{rustls::{self, ServerConfig}, TlsAcceptor};

fn tls_config(cert: &Path, key: &Path) -> anyhow::Result<Arc<ServerConfig>> {
    let certs = rustls_pemfile::certs(&mut BufReader::new(File::open(cert)?))
        .collect::<Result<Vec<_>, _>>()?;
    let key = rustls_pemfile::private_key(&mut BufReader::new(File::open(key)?))?
        .ok_or_else(|| anyhow::anyhow!("没有找到私钥"))?;

    Ok(Arc::new(ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)?))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let acceptor = TlsAcceptor::from(tls_config(
        Path::new("certs/server.pem"), Path::new("certs/server.key"))?);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:9527").await?;
    let service = Arc::new(tokio::sync::Mutex::new(Service::new(MemTable::default())));

    loop {
        let (stream, addr) = listener.accept().await?;
        let acceptor = acceptor.clone();
        let svc = Arc::clone(&service);
        tokio::spawn(async move {
            // TLS 握手完成前不处理任何业务数据
            let mut tls = match acceptor.accept(stream).await {
                Ok(s) => s,
                Err(e) => { tracing::warn!("{} TLS 握手失败：{}", addr, e); return; }
            };
            handle_connection(&mut tls, svc, addr).await;
        });
    }
}
```

客户端同样用 `tokio_rustls::TlsConnector`，把 CA 证书加进根证书列表后连接，并校验域名 `localhost`。

<Callout type="idea" title="为什么 TLS 要单独一层" text="`TlsStream` 实现了和 `TcpStream` 一样的 `AsyncRead + AsyncWrite`。于是 `handle_connection` 可以写成泛型，对明文和加密连接复用同一份代码 —— 又是 trait 带来的解耦。" />

## 三、把帧封装成 `Stream` + `Sink`

第 2 步的 `read_frame` / `write_frame` 是命令式循环。更 Rust 的做法是实现两个 trait：

- `Stream`：异步地**产出**一个个请求帧（类似异步版 `Iterator`）
- `Sink`：异步地**接收**一个个响应帧写出去

```rust
use futures::{Sink, Stream};
use std::pin::Pin;
use std::task::{Context, Poll};

pub struct ProstStream<S, In, Out> {
    inner: S,
    _marker: std::marker::PhantomData<(In, Out)>,
}

impl<S, In, Out> Stream for ProstStream<S, In, Out>
where
    S: AsyncRead + Unpin,
    In: prost::Message + Default,
{
    type Item = Result<In, std::io::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // 1) 尝试读满 4 字节长度；不够就返回 Pending 并注册 waker
        // 2) 读满 N 字节负载
        // 3) prost::Message::decode 得到 In
        // 4) Poll::Ready(Some(Ok(msg)))
        // 关键：任何一步数据没到齐，都不能阻塞线程，而是 Poll::Pending
        todo!("按上面的四步实现，参考 futures::io::AsyncReadExt")
    }
}
```

写好之后，服务端主循环可以变得非常干净：

```rust
let mut frames = ProstStream::<_, CommandRequest, CommandResponse>::new(tls);
while let Some(req) = frames.next().await {
    let req = req?;
    let resp = svc.lock().await.execute(req);
    frames.send(resp).await?;
}
```

<Compare title="同一个循环的两个版本" :panels='[{"label":"第 2 步：手写循环","code":"loop {\n  let f = read_frame(&mut s).await?;\n  let cmd = decode(&f);\n  let r = svc.execute(cmd);\n  write_frame(&mut s, &encode(r)).await?;\n}","note":"直观，但读写逻辑散在业务里"},{"label":"第 3 步：Stream + Sink","code":"while let Some(req) = frames.next().await {\n  let resp = svc.execute(req?).await;\n  frames.send(resp).await?;\n}","note":"编解码被封装，业务只剩三行"}]' note="把协议细节收进类型，是 Rust 网络编程的常见手法。" />

## 四、`tokio::select!` 处理多路事件

当一个连接既要读请求、又要收广播消息、还要响应关闭信号时：

```rust
loop {
    tokio::select! {
        Some(req) = frames.next() => { /* 处理请求 */ }
        Some(evt) = events.recv() => { /* 推送订阅消息 */ }
        _ = shutdown.changed()   => break,
    }
}
```

`select!` 同时等待多个 Future，谁先就绪就执行谁，其余分支被取消。第 4 步的 Pub/Sub 会直接用到。

<Quiz no="47-1" q="实现 Stream 的 poll_next 时，数据还没到齐应该？" :options='["阻塞当前线程等待", "返回 Poll::Pending 并注册 waker", "返回 None", "panic"]' answer="1" explain="Pending 让出线程；底层 IO 就绪时 Waker 会唤醒 executor 再 poll 一次，这正是 L4 讲过的机制。" />

<Quiz no="47-2" q="TLS 层能复用第 2 步的业务代码，主要因为？" :options='["rustls 会转换成 TcpStream", "TlsStream 同样实现 AsyncRead + AsyncWrite，业务只依赖 trait", "编译器会自动忽略 TLS", "protobuf 自带加密"]' answer="1" explain="面向 trait 编程让「换传输层」不需要改业务层。" />

<Predict no="47-3" q="客户端用错 CA 证书连接服务端，会？" :options='["正常通信，只是不加密", "TLS 握手失败，连接被拒绝", "服务端 panic", "自动降级为明文"]' answer="1" output="TLS 握手失败：invalid peer certificate" explain="证书校验失败会在握手阶段终止，业务数据一个字节都不会发出去。" />

<Exercise title="支持优雅关闭" task="用 `tokio::sync::broadcast` 发一个 shutdown 信号，服务端在 `tokio::select!` 里收到后停止 accept 循环，并等待已有连接处理完当前请求再退出。" hints='["main 里用 tokio::signal::ctrl_c() 捕获 Ctrl+C", "broadcast::channel(1) 的 tx 发给所有连接任务", "每个任务 select! 增加一个 shutdown 分支"]' solution="let (shutdown_tx, _) = tokio::sync::broadcast::channel(1);\n\n// 主循环\ntokio::select! {\n    Ok((stream, addr)) = listener.accept() =&gt; { /* spawn 任务，传入 shutdown_tx.subscribe() */ }\n    _ = tokio::signal::ctrl_c() =&gt; {\n        tracing::info!(&quot;收到关闭信号&quot;);\n        let _ = shutdown_tx.send(());\n        break;\n    }\n}" explain="优雅关闭是生产服务的基本要求，第 5 步的 CI 集成测试也会依赖它。" />

## 本步验收

<CheckList id="kv3-check" title="第 3 步验收" :items='["明文连接被拒绝，TLS 连接可用", "证书校验失败时握手终止", "帧读写已封装成 Stream / Sink", "服务能处理上百个并发连接不阻塞"]' />

传输层就绪，接下来做一次真正的架构升级：多路复用 + 发布订阅。

[进入第 4 步：重构与 Pub/Sub →](/projects/kv/4-refactor.md)
