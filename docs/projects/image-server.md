---
title: 第 44 讲 · 图片服务器
description: 用 axum 搭一个支持缩略图与缓存的 HTTP 图片服务，理解请求响应模型与分层。
---

<StageHeader stage="L5 · 第 44 讲" level="★★★☆☆" time="90 分钟" goal="能写出一个有路由、有缓存、有错误码的 HTTP 服务" prereq="L3 全部 + L4 线程" />

# 第 44 讲 · 图片服务器

**场景**：给定一个图片 URL 或本地图片，返回按参数缩放后的图片。这对应原教材里的 Thumbor 案例 —— 它把 **HTTP 服务、参数解析、图片处理、缓存** 四件事串在一起，是进入网络编程最好的第一个项目。

## 你会练到什么

- 用 `axum` 定义路由、提取路径/查询参数、返回不同状态码
- `Result` 映射到 HTTP 响应（404 / 400 / 500）
- 图片解码 → 缩放 → 编码的完整数据流
- 用 `Arc<Mutex<HashMap<...>>>` 做进程内缓存
- 把「协议层 / 服务层 / 存储层」分开的第一次实践

<ConceptDiagram type="pipeline" title="请求 → 路由 → 参数校验 → 缓存查询 → 图片处理 → 响应"
  labels="HTTP 请求::路由 / 校验|缓存查询::命中即返回|图片处理::缩放 / 滤镜|响应::Content-Type"
  caption="请求 → 校验 → 缓存 → 处理 → 响应，缓存键要覆盖所有影响输出的参数" />

## 依赖

```toml
[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
image = "0.25"
serde = { version = "1", features = ["derive"] }
bytes = "1"
```

```text
image-server/
├── Cargo.toml
├── assets/              # 本地图片
└── src/
    ├── main.rs          # 路由与启动
    ├── handler.rs       # 请求处理
    └── cache.rs         # 缓存
```

<StepBox title="分步实现" :steps='[{"title":"定 API","body":"`GET /img/:name?w=300&amp;h=200` 返回缩放后的 PNG；参数非法返回 400，图片不存在返回 404。","tip":"先把接口写清楚，再写实现，是网络服务的正确顺序。"},{"title":"最小可运行服务","body":"用 Router::new 注册一个健康检查路由，绑定到 127.0.0.1:3000 并用 axum::serve 启动。","tip":"先确认服务能起来，再加功能，排查范围小。"},{"title":"解析查询参数","body":"`#[derive(Deserialize)] struct Params { w: Option&lt;u32&gt;, h: Option&lt;u32&gt; }`，用 Query(params) 提取。","tip":"用 Option 表达「可不传」，缺省时保持原尺寸。"},{"title":"图片处理","body":"`image::open(path)?` 之后 `.resize_exact(w, h, FilterType::Lanczos3)`，编码成 PNG 写进 Vec。","tip":"图片处理是 CPU 密集操作，正式项目应放 spawn_blocking，别阻塞异步线程。"},{"title":"加缓存","body":"以 (name, w, h) 为 key，用 Arc&lt;Mutex&lt;HashMap&lt;String, Bytes&gt;&gt;&gt; 存结果；命中直接返回。","tip":"缓存 key 里必须包含尺寸，否则不同尺寸会串图。"}]' />

## 完整代码（单文件精简版）

```rust
use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use bytes::Bytes;
use image::imageops::FilterType;
use serde::Deserialize;
use std::{collections::HashMap, path::PathBuf, sync::{Arc, Mutex}};

type Cache = Arc<Mutex<HashMap<String, Bytes>>>;

#[derive(Deserialize)]
struct Params { w: Option<u32>, h: Option<u32> }

struct AppState { assets: PathBuf, cache: Cache }

struct AppError(StatusCode, String);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.0, self.1).into_response()
    }
}

async fn health() -> &'static str { "ok" }

async fn image(
    Path(name): Path<String>,
    Query(p): Query<Params>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    if name.contains("..") || name.contains('/') {
        return Err(AppError(StatusCode::BAD_REQUEST, "非法文件名".into()));
    }
    let w = p.w.unwrap_or(0);
    let h = p.h.unwrap_or(0);
    if w > 4096 || h > 4096 {
        return Err(AppError(StatusCode::BAD_REQUEST, "尺寸过大".into()));
    }

    let key = format!("{}:{}:{}", name, w, h);
    if let Some(data) = state.cache.lock().unwrap().get(&key).cloned() {
        return Ok(([(header::CACHE_CONTROL, "public, max-age=3600")], data).into_response());
    }

    let path = state.assets.join(&name);
    if !path.exists() {
        return Err(AppError(StatusCode::NOT_FOUND, "图片不存在".into()));
    }

    let bytes = tokio::task::spawn_blocking(move || -> Result<Bytes, String> {
        let img = image::open(&path).map_err(|e| e.to_string())?;
        let img = if w > 0 && h > 0 {
            img.resize_exact(w, h, FilterType::Lanczos3)
        } else { img };
        let mut buf = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut buf);
        img.write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok(Bytes::from(buf))
    })
    .await
    .map_err(|e| AppError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| AppError(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    state.cache.lock().unwrap().insert(key, bytes.clone());
    Ok(([(header::CONTENT_TYPE, "image/png")], bytes).into_response())
}

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState {
        assets: PathBuf::from("assets"),
        cache: Arc::new(Mutex::new(HashMap::new())),
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/img/:name", get(image))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();
    println!("图片服务已启动：http://127.0.0.1:3000");
    axum::serve(listener, app).await.unwrap();
}
```

```bash
mkdir -p assets && cp /path/to/photo.png assets/photo.png
cargo run
# 另开终端
curl -o small.png "http://127.0.0.1:3000/img/photo.png?w=300&h=200"
curl -i "http://127.0.0.1:3000/img/missing.png"     # 404
```

<Callout type="warn" title="三个真实项目必须补的防护" text="1. 路径穿越：示例里挡了 `..` 和 `/`，正式代码应规范化路径；2. 尺寸上限：防止超大参数打爆内存；3. CPU 密集任务用 `spawn_blocking`，不然会卡住 tokio 的工作线程。" />

## 为什么用 `impl IntoResponse`

`axum` 的 handler 只要返回「能转成响应」的类型即可。自定义 `AppError` 实现 `IntoResponse` 后，业务代码里用 `?` 就能把错误统一变成状态码 —— 这和 L3 的错误链是同一套思路，只是出口换成了 HTTP。

<Quiz no="44-1" q="缓存 key 为什么必须包含 w 和 h？" :options='["为了让 key 更长更安全", "不同尺寸是不同结果，只按文件名缓存会串图", "HashMap 要求 key 带数字", "axum 的强制要求"]' answer="1" explain="缓存键必须完整覆盖所有影响输出的参数，否则会返回错误尺寸的图片。" />

<Quiz no="44-2" q="为什么图片缩放要放进 spawn_blocking？" :options='["spawn_blocking 会自动压缩图片", "缩放是 CPU 密集任务，会阻塞 tokio 的异步工作线程", "因为 image crate 只能在多线程用", "为了绕过所有权检查"]' answer="1" explain="异步线程被长任务占住会导致其他请求饿死；CPU 密集工作应交给阻塞线程池。" />

<Predict no="44-3" q="请求 `/img/../../etc/passwd` 时，示例会？" :options='["读取系统文件", "返回 400 非法文件名", "返回 404", "panic"]' answer="1" output="400 Bad Request" explain="路径里含 .. 被显式拒绝 —— 这就是最基本的路径穿越防护。" />

<Exercise title="加一个格式参数" task="给 Params 加 `fmt: Option&lt;String&gt;`，支持 png / jpeg 两种输出；同时把 fmt 纳入缓存 key，并设置正确的 Content-Type。" hints='["用 match fmt.as_deref() 选择 ImageFormat", "Content-Type 在缓存命中分支里也要设置", "缓存 key 变成 name:w:h:fmt"]' solution="let fmt = p.fmt.clone().unwrap_or_else(|| &quot;png&quot;.into());\nlet key = format!(&quot;{}:{}:{}:{}&quot;, name, w, h, fmt);\nlet format = match fmt.as_str() {\n    &quot;jpeg&quot; | &quot;jpg&quot; => image::ImageFormat::Jpeg,\n    _ => image::ImageFormat::Png,\n};\n// 缓存命中与未命中分支都要带上对应 Content-Type" explain="凡是影响响应体或响应头的参数，都必须进缓存键。" />

## 扩展挑战

- 用 `tower-http` 加请求日志、限流、CORS。
- 把内存缓存换成磁盘缓存（按哈希分目录），进程重启后仍命中。
- 用 protobuf 定义图片处理参数（原教材的做法），比较它与 query string 的取舍。
- 加集成测试：启动 router，用 `tower::ServiceExt::oneshot` 发请求断言状态码。

<CheckList id="image-check" title="验收清单" :items='["服务能启动且 /health 返回 ok", "缩放结果正确且第二次请求命中缓存", "非法参数与不存在图片返回正确状态码", "路径穿越被挡住"]' />

[下一讲：第 45 讲 KV 第 1 步 内存版与 trait 抽象 →](/projects/kv/1-memory.md) · [KV Server 贯穿线总览 →](/projects/kv/index.md)
