---
title: 第 64 讲 · tonic gRPC 微服务
description: 用 protobuf 契约 + tonic 实现四种 RPC，理解强类型服务间通信、流式传输与优雅关闭。
---

<StageHeader stage="L5 · 第 64 讲" level="★★★★☆" time="80 分钟" goal="写出可被 grpcurl 调用的 Rust gRPC 服务" prereq="L3 + L4 异步" />

# 第 64 讲 · tonic gRPC 微服务

**场景**：前面的 [KV Server](/projects/kv/) 用的是自定义 TCP 帧协议，只有自己的客户端能调。当服务要被多个团队、多种语言调用时，就需要一份**写在代码之外的契约**：protobuf + gRPC。

## 为什么用 gRPC 而不是手写 JSON API

| 维度 | REST / JSON | gRPC / protobuf |
| --- | --- | --- |
| 契约 | 靠文档与约定，容易漂移 | `.proto` 文件，**多语言代码生成** |
| 类型检查 | 运行时校验 | 编译期（Rust 侧）/ 生成代码（其他语言） |
| 传输 | 文本，体积大 | 二进制，体积与解析成本更低 |
| 流式 | 需 SSE / WebSocket 另搞一套 | **原生四种模式**（一元 / 服务端流 / 客户端流 / 双向流） |
| 调试 | curl 直接看 | 需要 grpcurl / 反射 |
| 适合 | 对外公开 API、浏览器直连 | 内部服务间通信、高吞吐、流式数据 |

<Callout type="idea" title="契约优先" text="`.proto` 是唯一事实来源，服务端与客户端都从它生成代码。这和多语言前端里 [第 63 讲 全栈类型共享](/projects/frontend/fullstack.md) 是同一个思路，只是把 TS 换成了跨语言的 protobuf。" />

## 工具链与结构

```bash
# protobuf 编译器（tonic-build 需要）
brew install protobuf          # macOS；Linux 用 apt install protobuf-compiler
cargo install grpcurl 2>/dev/null || true   # 或用 go 版 grpcurl 调试
```

```toml
[dependencies]
tonic = "0.12"
prost = "0.13"
tokio = { version = "1", features = ["full"] }
tokio-stream = "0.1"

[build-dependencies]
tonic-build = "0.12"
```

```text
todo-grpc/
├── Cargo.toml
├── build.rs
├── proto/todo.proto
└── src/
    ├── main.rs        # 服务端
    └── bin/client.rs  # 客户端
```

<StepBox title="分步实现" :steps='[{"title":"写 proto 契约","body":"定义 `service TodoService` 与 message，包含一元、服务端流、客户端流、双向流四种方法。","tip":"字段号一旦发布就不要改动，只追加新字段。"},{"title":"生成代码","body":"`build.rs` 里 `tonic_build::compile_protos(\"proto/todo.proto\")?`，构建时生成 Rust 模块。","tip":"用 `include!` 或 `tonic::include_proto!` 引入生成物。"},{"title":"实现 service trait","body":"`#[tonic::async_trait] impl todo_service_server::TodoService for MyTodo`，返回 `Result&lt;Response&lt;T&gt;, Status&gt;`。","tip":"状态用 Arc&lt;Mutex&lt;_&gt;&gt;，注意锁不要跨 await。"},{"title":"启动服务","body":"`Server::builder().add_service(...).serve_with_shutdown(addr, shutdown_signal()).await?`。","tip":"加上优雅关闭，CI 集成测试才不会端口冲突。"},{"title":"写客户端验证","body":"`TodoServiceClient::connect(...)` 后调用四种方法，用 grpcurl 也能直接测。"},{"title":"加拦截器与反射","body":"记录每次调用耗时与状态码；开启反射后 grpcurl 不必带 proto 文件。"}]' />

## 契约：`proto/todo.proto`

```protobuf
syntax = "proto3";
package todo.v1;

service TodoService {
  rpc GetTodo (GetTodoRequest) returns (Todo);                    // 一元
  rpc ListTodos (ListTodosRequest) returns (stream Todo);         // 服务端流
  rpc AddTodos (stream Todo) returns (AddSummary);                // 客户端流
  rpc Chat (stream Todo) returns (stream Todo);                   // 双向流
}

message Todo { uint32 id = 1; string title = 2; bool done = 3; }
message GetTodoRequest { uint32 id = 1; }
message ListTodosRequest { bool only_pending = 1; }
message AddSummary { uint32 added = 1; }
```

## 构建脚本与服务端

```rust
// build.rs
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::compile_protos("proto/todo.proto")?;
    Ok(())
}
```

```rust
// src/main.rs
use std::{pin::Pin, sync::{Arc, Mutex}};
use tokio_stream::{wrappers::ReceiverStream, Stream, StreamExt};
use tonic::{transport::Server, Request, Response, Status, Streaming};

pub mod todo {
    tonic::include_proto!("todo.v1");
}
use todo::*;

type TodoResult<T> = Result<Response<T>, Status>;
type TodoStream = Pin<Box<dyn Stream<Item = Result<Todo, Status>> + Send>>;

#[derive(Default)]
struct Store { items: Vec<Todo> }

struct TodoSvc { store: Arc<Mutex<Store>> }

#[tonic::async_trait]
impl todo_service_server::TodoService for TodoSvc {
    async fn get_todo(&self, req: Request<GetTodoRequest>) -> TodoResult<Todo> {
        let id = req.into_inner().id;
        let store = self.store.lock().unwrap();
        store.items.iter().find(|t| t.id == id).cloned()
            .map(Response::new)
            .ok_or_else(|| Status::not_found(format!("没有 id={} 的任务", id)))
    }

    type ListTodosStream = TodoStream;
    async fn list_todos(&self, req: Request<ListTodosRequest>) -> TodoResult<Self::ListTodosStream> {
        let only_pending = req.into_inner().only_pending;
        let (tx, rx) = tokio::sync::mpsc::channel(16);
        // 先克隆出快照，避免在异步任务里持锁
        let snapshot = self.store.lock().unwrap().items.clone();
        tokio::spawn(async move {
            for t in snapshot.into_iter().filter(|t| !only_pending || !t.done) {
                if tx.send(Ok(t)).await.is_err() { break; }   // 客户端断开
            }
        });
        Ok(Response::new(Box::pin(ReceiverStream::new(rx))))
    }

    async fn add_todos(&self, req: Request<Streaming<Todo>>) -> TodoResult<AddSummary> {
        let mut incoming = req.into_inner();
        let mut added = 0;
        while let Some(t) = incoming.next().await {
            let mut store = self.store.lock().unwrap();
            store.items.push(t?);
            added += 1;
        }
        Ok(Response::new(AddSummary { added }))
    }

    type ChatStream = TodoStream;
    async fn chat(&self, req: Request<Streaming<Todo>>) -> TodoResult<Self::ChatStream> {
        let mut incoming = req.into_inner();
        let (tx, rx) = tokio::sync::mpsc::channel(16);
        tokio::spawn(async move {
            while let Some(Ok(mut t)) = incoming.next().await {
                t.title = format!("已处理：{}", t.title);
                if tx.send(Ok(t)).await.is_err() { break; }
            }
        });
        Ok(Response::new(Box::pin(ReceiverStream::new(rx))))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "127.0.0.1:50051".parse()?;
    let svc = TodoSvc { store: Arc::new(Mutex::new(Store::default())) };

    Server::builder()
        .add_service(todo_service_server::TodoServiceServer::new(svc))
        .serve_with_shutdown(addr, async {
            tokio::signal::ctrl_c().await.ok();
            println!("收到关闭信号");
        })
        .await?;
    Ok(())
}
```

## 客户端与调试

```rust
// src/bin/client.rs（共享 todo 模块，实际项目应抽到 lib.rs）
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut c = todo_service_client::TodoServiceClient::connect("http://127.0.0.1:50051").await?;

    let mut stream = c.list_todos(ListTodosRequest { only_pending: true }).await?.into_inner();
    while let Some(t) = stream.message().await? {
        println!("待办：{} {}", t.id, t.title);
    }
    Ok(())
}
```

```bash
cargo run                       # 终端 1：服务端
cargo run --bin client          # 终端 2：客户端
grpcurl -plaintext -d '{"id":1}' 127.0.0.1:50051 todo.v1.TodoService/GetTodo
```

<Callout type="warn" title="锁不要跨 await" text="`list_todos` 里先把 Vec 克隆成快照再 spawn，就是为了避免 `MutexGuard` 跨越 `.await`。标准库的 `MutexGuard` 不是 `Send`，编译器会直接拒绝；在异步服务里更推荐使用 `tokio::sync::Mutex` 或干脆用消息传递（[Channel](/concurrency/channels.md)）。" />

<Quiz no="64-1" q="gRPC 相比手写 JSON API 最本质的优势是？" :options='["一定更快", "proto 契约驱动多语言代码生成，且原生支持流式 RPC", "不需要网络", "浏览器可直接调用"]' answer="1" explain="契约优先 + 四种流式模式是核心；浏览器直连 gRPC 需要 grpc-web 代理。" />

<Quiz no="64-2" q="服务端流方法里为什么用 mpsc channel + spawn，而不是直接返回 Vec？" :options='["Vec 不能序列化", "流式 RPC 要逐条发送、支持背压与提前断开，Vec 会一次性缓冲全部数据", "tonic 不支持 Vec", "为了少写代码"]' answer="1" explain="流式接口的价值就在于边生成边发送，客户端断开时 tx.send 失败即可停止生产。" />

<Exercise title="加一个删除 RPC" task="在 proto 里追加 `rpc DeleteTodo (GetTodoRequest) returns (DeleteSummary)`，服务端实现删除逻辑（不存在返回 Status::not_found），客户端调用验证；同时给每一次调用加一个打印耗时的拦截器。" hints='["新增 message DeleteSummary { bool deleted = 1; }", "字段号只追加、不复用已删除的号", "拦截器可用 tonic::service::interceptor 或 tower 的 Layer"]' solution="rpc DeleteTodo (GetTodoRequest) returns (DeleteSummary);\nmessage DeleteSummary { bool deleted = 1; }\n\n// 服务端\nasync fn delete_todo(&amp;self, req: Request&lt;GetTodoRequest&gt;)\n    -&gt; Result&lt;Response&lt;DeleteSummary&gt;, Status&gt; {\n    let id = req.into_inner().id;\n    let mut store = self.store.lock().unwrap();\n    let before = store.items.len();\n    store.items.retain(|t| t.id != id);\n    Ok(Response::new(DeleteSummary { deleted: store.items.len() &lt; before }))\n}" explain="proto 变更要重新生成代码；CI 里应把生成结果与契约一起校验，避免漂移。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 构建报找不到 protoc | 安装 protobuf-compiler，或改用 `protoc-bin-vendored` crate |
| `MutexGuard` 不能跨 await | 先克隆快照，或换 `tokio::sync::Mutex` |
| 客户端连不上 | 检查地址协议（`http://` 而非 `https://`）、端口、TLS 配置 |
| grpcurl 报 unknown service | 未开启反射，或 package / service 名写错 |
| 改了 proto 但行为没变 | 生成代码在 OUT_DIR，需 clean 或确保 build.rs 触发重跑 |

## 扩展挑战

- 开启 `tonic-reflection`，让 grpcurl 免带 proto 文件。
- 用 `tower` 加超时、限流、重试与 tracing 拦截器。
- 加 mTLS（对照 [KV 第 3 步 TLS](/projects/kv/3-async.md)）。
- 把 [KV Server 第 2 步](/projects/kv/2-network.md) 的自定义帧协议换成 gRPC，比较代码量与表达能力。
- 用 `tonic-web` + grpc-web 让浏览器也能调用，串起 [前端专题](/projects/frontend/)。

<CheckList id="grpc-check" title="验收清单" :items='["cargo run 能启动服务且 grpcurl 可调通", "四种 RPC 模式都实现并验证过", "错误用 Status 表达而非 panic", "加了优雅关闭", "知道锁不能跨 await"]' />

[下一个场景：第 65 讲 边缘与 Serverless →](/projects/edge.md)
