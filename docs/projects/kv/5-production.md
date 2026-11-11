---
title: 第 56 讲 · KV 第 5 步：生产化
description: 配置、集成测试、性能压测、指标监控与 CI/CD，把项目从「能跑」变成「能上线」。
---

<StageHeader stage="L5 · 第 56 讲 · KV 第 5 步" level="★★★★★" time="100 分钟" goal="补齐一个真实 Rust 服务的工程要素" prereq="KV 第 4 步" />

# 第 56 讲 · KV 第 5 步：生产化

功能写完只算一半。真实项目还要回答：换个环境怎么改配置？改了代码怎么保证没弄坏旧功能？性能够不够？线上出问题看什么？这一节把答案补齐。

## 一、配置：分层覆盖

```toml
# config/default.toml
[server]
addr = "127.0.0.1:9527"
max_connections = 1024
frame_max_bytes = 16777216

[tls]
cert = "certs/server.pem"
key = "certs/server.key"

[log]
level = "info"
```

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub server: ServerConfig,
    pub tls: TlsConfig,
    pub log: LogConfig,
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let mut cfg = config::Config::builder()
            .add_source(config::File::with_name("config/default"))
            // 环境变量 KV__SERVER__ADDR 可覆盖 server.addr
            .add_source(config::Environment::with_prefix("KV").separator("__"))
            .build()?;
        Ok(cfg.try_deserialize()?)
    }
}
```

<Callout type="tip" title="配置优先级" text="默认值 < 配置文件 < 环境变量 < 命令行参数。生产环境的密钥永远不要写进配置文件，用环境变量或密钥管理服务注入。" />

## 二、测试金字塔

| 层级 | 放哪 | 测什么 |
| --- | --- | --- |
| 单元测试 | `src/**` 的 `#[cfg(test)]` | Storage、命令编解码、帧边界 |
| 集成测试 | `tests/` | 真实 TCP + TLS 跑完整请求响应 |
| 性能测试 | `benches/` | 吞吐与延迟，防止重构引入退化 |
| 端到端 | CI 里起容器 | 配置加载、启动、健康检查、优雅关闭 |

```rust
// tests/integration.rs
use tokio::time::{timeout, Duration};

#[tokio::test]
async fn set_then_get_over_tls() {
    let addr = start_test_server().await;   // 用临时端口，避免并发测试冲突
    let mut client = test_client(addr).await;

    let r = timeout(Duration::from_secs(2), async {
        client.set("t", "k", "v").await?;
        client.get("t", "k").await
    }).await.expect("请求超时").unwrap();

    assert_eq!(r.as_deref(), Some("v"));
}
```

<Callout type="warn" title="测试三条纪律" text="1. 所有网络测试都加 timeout；2. 端口用 `TcpListener::bind(&quot;127.0.0.1:0&quot;)` 让系统分配，别写死；3. 测试结束 abort 后台任务、删除临时证书，避免相互干扰。" />

## 三、性能压测

```toml
[dev-dependencies]
criterion = { version = "0.5", features = ["async_tokio"] }
```

```rust
// benches/kv_bench.rs
use criterion::{criterion_group, criterion_main, Criterion};

fn bench_set_get(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut svc = Service::new(MemTable::default());
    c.bench_function("set+get 1000 次", |b| {
        b.iter(|| {
            for i in 0..1000 {
                let key = i.to_string();
                svc.execute(Command::Set {
                    table: "t".into(), key: key.clone(), value: Value::Int(i),
                });
                svc.execute(Command::Get { table: "t".into(), key });
            }
        })
    });
    let _ = rt;
}
criterion_group!(benches, bench_set_get);
criterion_main!(benches);
```

```bash
cargo bench
# 结果在 target/criterion/ 下，可以用 HTML 报告对比历史基线
```

压测时重点看三件事：**锁竞争**（`Arc<Mutex<Service>>` 是全局串行点）、**帧大小**（大 value 的拷贝开销）、**订阅广播的 lag**。发现瓶颈后再考虑分片存储、无锁结构或 `DashMap`，不要提前优化。

## 四、可观测性：日志 / 指标 / 追踪

```rust
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

fn init_observability(cfg: &Config) {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(&cfg.log.level))
        .with(tracing_subscriber::fmt::layer().json())   // 生产用结构化 JSON
        .init();
}
```

| 信号 | 工具 | 回答什么问题 |
| --- | --- | --- |
| 日志 | `tracing` | 某个请求发生了什么 |
| 指标 | `metrics` / Prometheus | QPS、P99 延迟、连接数、错误率 |
| 追踪 | `tracing` + OpenTelemetry | 一次调用跨了哪些组件、慢在哪 |

关键指标建议至少埋四个：`kv_requests_total`（按命令类型）、`kv_request_duration_seconds`（直方图）、`kv_connections_active`、`kv_errors_total`。

## 五、CI/CD

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { components: rustfmt, clippy }
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all -- --check
      - run: cargo clippy --all-targets -- -D warnings
      - run: cargo test --all-features
      - run: cargo build --release
```

发布阶段再加：生成证书（从密钥管理服务取）、构建静态链接的 release 二进制、推镜像、灰度部署、健康检查、失败自动回滚。

<StepBox title="上线前的检查清单" :steps='[{"title":"配置外置","body":"地址、证书路径、日志级别都能通过环境变量覆盖，代码里没有硬编码秘密。"},{"title":"测试全绿且有超时保护","body":"单元 / 集成 / 压测基线都在 CI 里跑。"},{"title":"可观测性就绪","body":"结构化日志 + 四个核心指标 + 健康检查端点。"},{"title":"资源上限明确","body":"帧大小上限、最大连接数、订阅队列容量、请求超时都设了值。"},{"title":"优雅关闭与回滚","body":"Ctrl+C / SIGTERM 能停止 accept 并等待在途请求；发布失败可一键回滚。"}]' />

<Quiz no="56-1" q="为什么集成测试要用系统分配的临时端口？" :options='["更快", "避免多个测试并行时端口冲突，也避免与开发机服务撞车", "Rust 要求", "可以不用 TLS"]' answer="1" explain="绑定 127.0.0.1:0 让内核分配空闲端口，是网络测试的标准做法。" />

<Quiz no="56-2" q="`cargo clippy -- -D warnings` 在 CI 里的作用是？" :options='["格式化代码", "把静态检查告警当成错误，防止低质量写法合入", "运行性能测试", "生成文档"]' answer="1" explain="fmt 管格式、clippy 管惯用写法、test 管行为，三者各司其职。" />

<Predict no="56-3" q="发现 `Arc&lt;Mutex&lt;Service&gt;&gt;` 是吞吐瓶颈，最合理的下一步是？" :options='["立刻换成 unsafe 无锁结构", "先用压测量化，再考虑按 key 分片或改用 DashMap 等并发结构", "把锁删掉", "增加线程数即可"]' answer="1" explain="先测量再优化；分片把全局锁拆成多把，通常比直接删锁安全得多。" />

<Exercise title="补一个健康检查" task="给服务端加一个独立的 HTTP 端口与 `/health` 路由，返回 JSON 包含 status 与当前活跃连接数（用 AtomicUsize 计数）。" hints='["可以用 axum 起第二个 listener，与主服务共享一个 Arc&lt;AtomicUsize&gt;", "accept 成功时 fetch_add(1)，连接任务结束时 fetch_sub(1)", "健康检查不需要 TLS，仅监听 127.0.0.1"]' solution="let active = Arc::new(AtomicUsize::new(0));\n// accept 后：active.fetch_add(1, Ordering::SeqCst);\n// 任务末尾：active.fetch_sub(1, Ordering::SeqCst);\n// health handler：\nasync fn health(State(a): State&lt;Arc&lt;AtomicUsize&gt;&gt;) -&gt; Json&lt;Value&gt; {\n    Json(json!({ &quot;status&quot;: &quot;ok&quot;, &quot;active&quot;: a.load(Ordering::SeqCst) }))\n}" explain="健康检查是负载均衡与滚动发布的基础设施，属于最小可用的可观测性。" />

## 项目收尾

<CheckList id="kv5-check" title="贯穿项目总验收" :items='["五步的每一层都能说清职责", "配置、测试、压测、指标、CI 全部就位", "从第 1 步到现在的测试始终全绿", "能画出完整架构图并解释每次重构的动机"]' />

走完这五步，你已经完整经历了一个 Rust 服务从「一个 HashMap」到「可上线系统」的全过程。KV Server 这条贯穿线到此收束，下一讲把这些做法抽成通用的工程原则；再往后的 58–66 讲会换到浏览器、边缘节点与裸机这些新宿主。

[下一讲：第 57 讲 软件架构、生态与持续精进 →](/projects/production.md) · [回到 66 讲完整目录 →](/guide/curriculum.md)
