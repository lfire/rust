---
title: 第 55 讲 · KV 第 4 步：重构与 Pub/Sub
description: 用 yamux 做多路复用、加入事件通知与发布订阅，并完成一次不推倒重来的大重构。
---

<StageHeader stage="L5 · 第 55 讲 · KV 第 4 步" level="★★★★★" time="110 分钟" goal="体验一次受编译器保护的架构升级" prereq="KV 第 3 步 + L3 trait object" />

# 第 55 讲 · KV 第 4 步：重构与 Pub/Sub

到这一步，需求变了：**一个连接上要同时跑多种交互**（普通命令 + 订阅推送），而且服务端要能主动推消息。原来的「一问一答」模型不够用了。

这是全教程最像真实工作的一节：**不重写，只重构**。

## 一、为什么需要多路复用

一个 TCP 连接上如果同时有「请求 A 等响应」和「订阅流收推送」，两者会争抢同一条字节流。解法是在一条连接上开多条**逻辑流（stream）**：

```text
一条 TLS 连接
  ├── stream 1  → 普通命令请求/响应
  ├── stream 2  → 普通命令请求/响应
  └── stream 3  → SUBSCRIBE，服务端持续推送
```

`yamux` 就是做这个的：它把多条逻辑流复用到一条物理连接上，每条流各自独立地收发帧。

```toml
[dependencies]
tokio-yamux = "0.3"     # 或使用 yamux 0.13 + tokio 适配
futures = "0.3"
dashmap = "5"
```

<ConceptDiagram type="pipeline" title="物理连接 → yamux 多路复用 → 多条逻辑流 → Service"
  labels="物理连接::TLS 之上|yamux 多路复用|多条逻辑流::Stream / Sink|Service::命令处理"
  caption="一条物理连接上开多条逻辑流，Pub/Sub 与命令流互不干扰" />

## 二、用 trait 抽象「命令」与「事件」

新增 `Publish` / `Subscribe` 命令时，前几步的穷举检查会立刻列出所有要补的 match 分支 —— 这正是第 1 步坚持用 enum 的回报。

```rust
#[derive(Debug, Clone)]
pub enum Command {
    Get { table: String, key: String },
    Set { table: String, key: String, value: Value },
    Del { table: String, key: String },
    Publish { topic: String, data: Value },     // 新增
    Subscribe { topic: String },               // 新增
}

/// 事件通知：命令执行完后，Service 可以往外发事件
pub trait Notify: Send + Sync {
    fn notify(&self, topic: &str, data: Value);
}

/// 命令执行上下文：存储 + 通知器
pub struct Context<'a, S: Storage> {
    pub store: &'a mut S,
    pub notifier: Option<&'a dyn Notify>,
}
```

<Callout type="idea" title="控制反转（IoC）" text="命令本身不需要知道「消息怎么推给订阅者」，它只调用 `Context.notifier.notify(...)`。至于通知器是内存广播、Kafka 还是什么都不做（测试时），由外层注入。这就是 trait 实现的控制反转，也是可测试性的来源。" />

## 三、订阅表与广播

```rust
use dashmap::DashMap;
use tokio::sync::broadcast;
use std::sync::Arc;

#[derive(Default)]
pub struct TopicBus {
    topics: DashMap<String, broadcast::Sender<Value>>,
}

impl TopicBus {
    fn sender(&self, topic: &str) -> broadcast::Sender<Value> {
        self.topics
            .entry(topic.to_string())
            .or_insert_with(|| broadcast::channel(64).0)
            .clone()
    }

    pub fn subscribe(&self, topic: &str) -> broadcast::Receiver<Value> {
        self.sender(topic).subscribe()
    }

    pub fn publish(&self, topic: &str, value: Value) {
        if let Some(tx) = self.topics.get(topic) {
            let _ = tx.send(value);   // 没有订阅者时忽略，不算错误
        }
    }
}

impl Notify for TopicBus {
    fn notify(&self, topic: &str, data: Value) { self.publish(topic, data); }
}
```

## 四、服务端：一条逻辑流一个任务

```rust
async fn handle_stream<S, N>(
    stream: yamux::Stream,
    service: Arc<tokio::sync::Mutex<Service<S>>>,
    bus: Arc<N>,
) where
    S: Storage,
    N: Notify + 'static,
{
    let mut frames = ProstStream::<_, CommandRequest, CommandResponse>::new(stream);

    while let Some(req) = frames.next().await {
        let req = match req { Ok(r) => r, Err(e) => { tracing::warn!("{}", e); break; } };

        if let Command::Subscribe { topic } = &req {
            let mut rx = bus.subscribe_for(topic);   // 由 TopicBus 提供
            loop {
                tokio::select! {
                    Some(Ok(value)) = rx.recv() => {
                        if frames.send(Response::Event(value)).await.is_err() { return; }
                    }
                    maybe = frames.next() => {
                        if maybe.is_none() { return; }   // 客户端取消订阅
                    }
                }
            }
        }

        let resp = {
            let mut svc = service.lock().await;
            let mut ctx = Context { store: svc.store_mut(), notifier: Some(bus.as_ref()) };
            svc.execute_with_context(req, &mut ctx)
        };
        if frames.send(resp).await.is_err() { break; }
    }
}
```

<Callout type="warn" title="重构时最该小心的是锁" text="注意 `service.lock().await` 的作用域被一个代码块包住，`frames.send(...).await` 发生在锁之外。持锁做 IO 会让所有其他连接排队 —— 这类问题编译器不会提醒，只能靠代码评审和压测发现。" />

<StepBox title="一次安全的大重构：推荐顺序" :steps='[{"title":"先补测试基线","body":"确保 KV 第 1–3 步的所有单元测试与集成测试全绿，作为重构的回归网。","tip":"没有测试就不要动架构。"},{"title":"引入 Context，不改行为","body":"先把 execute 改成 execute_with_context，通知器先传 None，行为完全不变。","tip":"一次只改一个维度：这一步只加参数，不加功能。"},{"title":"加 Publish/Subscribe 命令","body":"跟着编译器的 non-exhaustive 提示补完所有 match 分支。","tip":"编译器会列出每一处遗漏，逐个补即可。"},{"title":"接入 TopicBus","body":"让 notifier 真正广播，加一个「订阅后收到推送」的集成测试。","tip":"broadcast 的容量与 lag 策略要在这里定下来。"},{"title":"最后引入 yamux","body":"把单流改成多流，每条流一个任务；原有命令的测试必须仍然全绿。"}]' />

<Quiz no="55-1" q="「一次只改一个维度」的重构策略，好处是？" :options='["编译更快", "出问题时能把范围缩小到刚引入的变化，且测试能持续保护", "可以跳过测试", "Rust 强制要求"]' answer="1" explain="小步提交 + 回归测试，是大型重构最有效的风险控制手段。" />

<Quiz no="55-2" q="把通知器设计成 `&amp;dyn Notify` 而不是具体 TopicBus，主要为了？" :options='["性能更高", "命令逻辑与通知实现解耦，测试可注入空实现", "避免生命周期标注", "减少内存占用"]' answer="1" explain="这就是控制反转：上层策略注入下层能力，测试与替换都变简单。" />

<Predict no="55-3" q="为什么 `frames.send(...).await` 要放在锁的作用域之外？" :options='["为了代码好看", "持锁做网络 IO 会阻塞其他连接，严重降低并发", "Rust 不允许在锁里 await", "会导致编译失败"]' answer="1" output="（并发吞吐显著提升）" explain="tokio::Mutex 允许在锁内 await，但逻辑上不该这么做；锁的粒度是性能设计问题，不是编译问题。" />

<Exercise title="补一个订阅测试" task="写集成测试：启动服务端 → 建立一条订阅流订阅 topic demo → 另一条流对 demo 执行 Publish → 断言订阅流在 1 秒内收到消息（用 tokio::time::timeout 防止测试挂死）。" hints='["用 tokio::time::timeout(Duration::from_secs(1), rx.recv())", "Publish 之前先确保订阅已建立，可以 sleep 一小会儿或用 barrier", "测试结束要 abort 服务端任务，避免泄漏"]' solution="let received = tokio::time::timeout(\n    std::time::Duration::from_secs(1),\n    sub_stream.next(),\n)\n.await\n.expect(&quot;订阅超时&quot;)\n.expect(&quot;连接提前关闭&quot;)\n.expect(&quot;解码失败&quot;);\nassert_eq!(received, expected_response);" explain="异步测试一定要加超时，否则出错时测试进程会永远挂着。" />

## 本步验收

<CheckList id="kv4-check" title="第 4 步验收" :items='["Publish / Subscribe 命令可用", "一条连接上能同时跑命令流与订阅流", "前 3 步的全部测试仍然通过", "锁的作用域不覆盖网络 IO"]' />

架构已经稳了，KV Server 还差最后一步：把它变成一个「能上线、能维护」的项目。

[下一讲：第 56 讲 KV 第 5 步 生产化 →](/projects/kv/5-production.md)
