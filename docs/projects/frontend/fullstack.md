---
title: 第 63 讲 · 全栈类型共享
description: 用 ts-rs 从 Rust 结构体自动生成 TypeScript 类型，让 axum 后端与前端 DTO 永远不漂移。
---

<StageHeader stage="L5 · 第 63 讲" level="★★★★☆" time="60 分钟" goal="后端改字段后前端类型自动同步" prereq="L3 serde / Result + 基础 TS" />

# 第 63 讲 · 全栈类型共享

**场景**：Rust 写的 axum 后端 + TypeScript 前端。接口字段一多，前端就得手抄一遍 DTO；后端把 `done` 改成 `completed`，前端往往要等到运行时报错才发现。

这一讲做的是**成本最低、收益最直接**的 Rust × 前端结合：后端结构体加一个 derive，TypeScript 类型自动生成，CI 里还能检查「有没有忘记重新生成」。

<Compare title="DTO 从哪来" :panels='[{"label":"手写（常见现状）","code":"// 后端改了字段，这里不会有任何提示\ninterface Todo {\n  id: number;\n  done: boolean;\n}","note":"类型漂移只能靠运行时发现"},{"label":"生成（本讲）","code":"#[derive(Serialize, TS)]\n#[ts(export)]\nstruct Todo { id: u32, done: bool }\n// → bindings/Todo.ts","note":"后端一改，CI 就能拦住未同步的前端"}]' note="不需要前后端同语言，只要把「契约」放在一处并由工具生成。" />

## 你会练到什么

- `ts-rs` 的 `#[derive(TS)]` 与 `#[ts(export)]`
- `Option` / `Vec` / `enum` 到 TS 的映射与 `null` 差异
- axum 返回 `Json<T>` 与统一的错误响应
- 把生成结果纳入 CI，防止类型漂移
- 用 `utoipa` 顺带产出 OpenAPI（可选）

## 依赖与结构

```toml
[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
ts-rs = { version = "10", features = ["serde-compat"] }
utoipa = { version = "5", features = ["axum_extras"] }   # 可选：生成 OpenAPI

[dev-dependencies]
# ts-rs 的 export 在测试运行期间写出 .ts 文件
```

```text
fullstack-todo/
├── Cargo.toml
├── bindings/            # 自动生成的 .ts，提交进仓库
├── src/
│   ├── main.rs          # axum 入口
│   ├── dto.rs           # 共享 DTO（唯一事实来源）
│   └── handlers.rs
└── web/src/api/types.ts # 前端直接 import ../bindings
```

<StepBox title="分步实现" :steps='[{"title":"定义 DTO","body":"在 `dto.rs` 里写 `#[derive(Serialize, Deserialize, TS)] #[ts(export)]` 的结构体与枚举。","tip":"`#[ts(export_to = \"bindings/\")]` 可指定输出目录。"},{"title":"跑一次生成","body":"`cargo test` 时 ts-rs 会写出 bindings/*.ts，检查生成内容是否符合预期。","tip":"把 bindings/ 提交进仓库，前端才能直接引用。"},{"title":"写 axum handler","body":"`async fn list() -&gt; Json&lt;Vec&lt;Todo&gt;&gt;`，错误统一成 `ApiError` 再转 Response。","tip":"错误类型也 derive TS，前端才能知道错误结构。"},{"title":"前端引用","body":"TS 里 `import type { Todo } from \"../../../bindings/Todo\"`，用 fetch 封装一层带类型的客户端。"},{"title":"CI 防漂移","body":"在 CI 里跑 `cargo test` 后执行 `git diff --exit-code bindings/`，有差异就失败。","tip":"这行命令是整套方案的关键，别省。"},{"title":"可选：OpenAPI","body":"给 handler 加 `#[utoipa::path]` 生成 openapi.json，供文档站或客户端 SDK 生成器使用。"}]' />

## 完整代码：`src/dto.rs`

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "bindings/")]
#[ts(rename_all = "camelCase")]
pub struct Todo {
    pub id: u32,
    pub title: String,
    pub is_done: bool,
    pub tags: Vec<String>,
    /// Option 默认生成成 `T | null`，与 axum 的 JSON 输出一致
    pub due_at: Option<String>,
    pub priority: Priority,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "bindings/")]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Normal,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "bindings/")]
pub struct ApiError {
    pub code: u16,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "bindings/")]
pub struct CreateTodo {
    pub title: String,
    pub priority: Option<Priority>,
}
```

生成的 `bindings/Todo.ts`：

```typescript
export type Priority = "low" | "normal" | "high";

export interface Todo {
  id: number;
  title: string;
  isDone: boolean;
  tags: string[];
  dueAt: string | null;
  priority: Priority;
}
```

<Callout type="warn" title="命名与 null 是两个高频坑" text="Rust 习惯 snake_case、前端习惯 camelCase，务必在 DTO 上同时加 `#[serde(rename_all = &quot;camelCase&quot;)]`（影响 JSON）和 `#[ts(rename_all = &quot;camelCase&quot;)]`（影响 TS），少写一个就会出现「TS 说有 isDone、接口返回 is_done」。另外 `Option<T>` 默认序列化成 `null` 而不是 `undefined`，两边要对齐。" />

## 后端：`src/main.rs`

```rust
use axum::{routing::get, Json, Router};
use std::sync::{Arc, Mutex};

mod dto;
use dto::*;

#[derive(Default)]
struct Store { items: Vec<Todo> }
type Shared = Arc<Mutex<Store>>;

async fn list_todos(state: axum::extract::State<Shared>) -> Json<Vec<Todo>> {
    Json(state.lock().unwrap().items.clone())
}

async fn create_todo(
    state: axum::extract::State<Shared>,
    Json(payload): Json<CreateTodo>,
) -> Json<Todo> {
    let mut store = state.lock().unwrap();
    let todo = Todo {
        id: store.items.len() as u32 + 1,
        title: payload.title,
        is_done: false,
        tags: vec![],
        due_at: None,
        priority: payload.priority.unwrap_or(Priority::Normal),
    };
    store.items.push(todo.clone());
    Json(todo)
}

#[tokio::main]
async fn main() {
    let state: Shared = Arc::new(Mutex::new(Store::default()));
    let app = Router::new()
        .route("/api/todos", get(list_todos).post(create_todo))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();
    println!("API: http://127.0.0.1:3000/api/todos");
    axum::serve(listener, app).await.unwrap();
}
```

## 前端：带类型的客户端

```typescript
import type { Todo, CreateTodo, Priority } from '../../../bindings/Todo'

export async function fetchTodos(): Promise<Todo[]> {
  const res = await fetch('/api/todos')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Todo[]
}

export async function addTodo(title: string, priority?: Priority): Promise<Todo> {
  const body: CreateTodo = { title, priority: priority ?? null }
  const res = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as Todo
}
```

## CI 防漂移（关键一步）

```yaml
- name: 生成 TS 类型并校验没有漂移
  run: |
    cargo test -q
    git diff --exit-code bindings/
```

只要后端改了 DTO 却忘了重新生成 `bindings/`，这一步就会失败并把 diff 打出来。这样「类型共享」才不是一次性约定，而是**持续生效的约束**。

<ConceptDiagram type="pipeline" title="Rust DTO（唯一事实来源）→ 生成的 .ts + JSON API + OpenAPI"
  labels="Rust DTO::derive(TS)|生成 .ts::ts-rs|JSON API::axum|前端类型::TypeScript"
  caption="Rust DTO 是唯一事实来源，生成的 .ts 与 JSON API 一起保证端到端类型安全" />

<Quiz no="63-1" q="为什么要同时写 `#[serde(rename_all)]` 和 `#[ts(rename_all)]`？" :options='["前者管 JSON 字段名，后者管生成的 TS 字段名，少一个就会对不上", "两个是同义词，写一个就行", "前者给前端用，后者给数据库用", "只有用了 utoipa 才需要"]' answer="0" explain="序列化与类型生成是两条独立链路，命名规则必须分别声明且保持一致。" />

<Quiz no="63-2" q="`git diff --exit-code bindings/` 在 CI 里的作用是？" :options='["加快构建", "确保后端 DTO 改动后生成的 TS 类型已同步提交，防止类型漂移", "检查代码格式", "生成 OpenAPI 文档"]' answer="1" explain="生成文件提交进仓库 + CI 校验差异，是把「契约一致」变成自动化约束的常用做法。" />

<Exercise title="给错误响应也生成类型" task="让所有接口失败时返回统一的 `ApiError` JSON（已在 dto.rs 定义），在前端写一个 `apiFetch<T>()` 包装：非 2xx 时解析成 `ApiError` 并抛出带 message 的自定义错误。" hints='["Rust 侧实现 IntoResponse：状态码 + Json(ApiError)", "前端先检查 res.ok，再按 ApiError 解析 body", "别直接用 res.json() as T 就完事"]' solution="// Rust\nimpl axum::response::IntoResponse for ApiError {\n    fn into_response(self) -&gt; axum::response::Response {\n        (axum::http::StatusCode::from_u16(self.code).unwrap(), axum::Json(self)).into_response()\n    }\n}\n\n// TS\nconst err = (await res.json()) as ApiError;\nthrow new Error(err.message);" explain="把错误也纳入同一套生成契约，前端就不用猜服务端失败时返回什么形状。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| TS 有字段但接口没有 / 名字对不上 | `serde` 与 `ts-rs` 的 rename_all 要同时设置且一致 |
| `Option` 前端收到 undefined 判断失效 | 统一按 `T \| null` 处理，或显式配 `#[ts(optional)]` |
| `u64` / 大整数精度丢失 | 前端 number 只有 53 位，改用字符串或 `#[ts(type = "bigint")]` 并配序列化策略 |
| 时间类型对不上 | 统一 ISO 8601 字符串，别直接传 `SystemTime` |
| 生成文件没进仓库 | 检查 `.gitignore` 是否误伤 `bindings/`，并加 CI 校验 |

## 扩展挑战

- 用 `utoipa` + `utoipa-swagger-ui` 生成可浏览的 API 文档页。
- 用 `typeshare` 做多语言生成（TS / Swift / Kotlin），对比它与 `ts-rs` 的取舍。
- 把 DTO 抽成独立 crate，同时被 axum 服务和 [第 61 讲 Tauri 应用](/projects/frontend/tauri.md) 复用。
- 用 [第 60 讲 Leptos](/projects/frontend/leptos.md) 做前端并共享同一个 `Todo` struct，做到**连 TS 生成都省掉**。
- 在 CI 里加一步：用生成的类型对真实 API 响应做运行时校验（`zod` / `valibot`）。

<CheckList id="fullstack-check" title="验收清单" :items='["cargo test 能在 bindings/ 生成 .ts 文件", "axum 接口返回的 JSON 字段与生成的类型一致", "前端 import 生成类型且能通过 tsc", "CI 里加了 git diff --exit-code 防漂移", "Option / enum / camelCase 三处映射都验证过"]' />

[Rust × 前端专题回到总览 →](/projects/frontend/) · [继续看 第 64 讲 gRPC 微服务 →](/projects/grpc.md)
