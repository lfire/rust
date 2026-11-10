---
title: 第 60 讲 · Leptos 写前端 SPA
description: 用纯 Rust 组件与响应式信号写一个待办 SPA，理解 CSR/SSR/水合以及与 React 的心智差异。
---

<StageHeader stage="L5 · 第 60 讲" level="★★★★☆" time="70 分钟" goal="用 Rust 写出可交互的前端页面" prereq="L3 trait / 闭包 + 基础前端概念" />

# 第 60 讲 · Leptos 写前端 SPA

**场景**：一个待办清单 SPA。和 [第 42 讲 待办清单 CLI](/projects/todo-cli.md) 数据模型一样，但这次全部代码 —— 包括 UI —— 都用 Rust 写，编译成 WASM 在浏览器里跑。

这条路的价值不是「不用写 JS」，而是**前后端可以是同一套类型、同一套校验逻辑、同一次编译检查**。改一个字段名，Rust 编译器会同时把服务端和界面里漏改的地方全列出来。

<Callout type="tip" title="版本提示" text="Leptos 迭代较快，本文以 0.7 的 `signal()` / `view!` API 为准。0.6 用 `create_signal` / `create_rw_signal`，思路一致但函数名不同。开始动手前请对照 Leptos Book 当前版本的起步模板。" />

## 与 React 的心智对照

| 概念 | React | Leptos |
| --- | --- | --- |
| 状态 | `useState` | `signal()` 返回 `(ReadSignal, WriteSignal)` |
| 派生值 | `useMemo` | 闭包 / `Memo`，**自动追踪依赖** |
| 组件 | 函数返回 JSX | `#[component]` 函数返回 `impl IntoView` |
| 渲染 | 每次状态变化重跑组件 | **细粒度更新**：只改绑定的那个 DOM 节点 |
| 列表 | `map` + `key` | `<For each=... key=... />` |

最大差异是**组件不重跑**。React 里状态一变整个函数重新执行；Leptos 里组件只执行一次建立响应式图，之后只有依赖该信号的 DOM 文本节点被更新。所以「在 view! 里直接读 signal」必须写成闭包或 `move ||`，否则值只会被取一次。

## 工具链与结构

```bash
rustup target add wasm32-unknown-unknown
cargo install trunk
```

```toml
[package]
name = "todo-leptos"
version = "0.1.0"
edition = "2021"

[dependencies]
leptos = { version = "0.7", features = ["csr"] }
```

```text
todo-leptos/
├── Cargo.toml
├── index.html
├── src/main.rs
└── dist/            # trunk 生成
```

```html
<!-- index.html -->
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Todo · Leptos</title></head>
  <body></body>
</html>
```

<StepBox title="分步实现" :steps='[{"title":"搭最小组件","body":"`#[component] fn App() -&gt; impl IntoView` 加 `mount_to_body(App)`，先显示一行文字跑通 trunk serve。","tip":"先确认 WASM 链路通，再往上加状态。"},{"title":"定义数据模型","body":"`#[derive(Clone)] struct Todo { id: u32, title: String, done: bool }`，和 CLI 版保持一致。","tip":"将来可以把这个 struct 抽到共享 crate 给后端复用。"},{"title":"建立信号","body":"`let (items, set_items) = signal(Vec::&lt;Todo&gt;::new());` 再用一个 signal 存输入框内容。","tip":"更新用 set_items.update(|v| ...)，读取用 items.get()。"},{"title":"渲染列表","body":"用 `&lt;For each=move || items.get() key=|t| t.id let:item&gt;`，每个 item 渲染一行。","tip":"For 要求 key 稳定，删除/新增时才能复用 DOM 节点。"},{"title":"绑定事件","body":"`on:click=move |_| { ... }` 与 `on:input`，注意闭包要用 move 捕获信号的写句柄。"},{"title":"样式与构建","body":"在 index.html 里 link 一个 CSS，trunk build --release 产出静态站点。"}]' />

## 完整代码：`src/main.rs`

```rust
use leptos::prelude::*;

#[derive(Clone, Debug)]
struct Todo {
    id: u32,
    title: String,
    done: bool,
}

#[component]
fn App() -> impl IntoView {
    let (items, set_items) = signal(Vec::<Todo>::new());
    let (draft, set_draft) = signal(String::new());
    let (next_id, set_next_id) = signal(1u32);

    let add = move |_| {
        let title = draft.get().trim().to_string();
        if title.is_empty() { return; }
        let id = next_id.get();
        set_items.update(|list| list.push(Todo { id, title, done: false }));
        set_next_id.update(|n| *n += 1);
        set_draft.set(String::new());
    };

    let remaining = move || items.get().iter().filter(|t| !t.done).count();

    view! {
        <main class="app">
            <h1>"Rust 待办清单"</h1>
            <div class="row">
                <input
                    type="text"
                    placeholder="要做什么？"
                    prop:value=move || draft.get()
                    on:input=move |ev| set_draft.set(event_target_value(&ev))
                />
                <button on:click=add>"添加"</button>
            </div>

            <p class="count">{move || format!("还剩 {} 项", remaining())}</p>

            <ul>
                <For
                    each=move || items.get()
                    key=|t| t.id
                    let:item
                >
                    <li class:done=move || item.done>
                        <label>
                            <input
                                type="checkbox"
                                prop:checked=move || item.done
                                on:change=move |_| {
                                    let id = item.id;
                                    set_items.update(|list| {
                                        if let Some(t) = list.iter_mut().find(|t| t.id == id) {
                                            t.done = !t.done;
                                        }
                                    });
                                }
                            />
                            {move || item.title.clone()}
                        </label>
                        <button on:click=move |_| {
                            let id = item.id;
                            set_items.update(|list| list.retain(|t| t.id != id));
                        }}>"删除"</button>
                    </li>
                </For>
            </ul>
        </main>
    }
}

fn main() {
    leptos::mount::mount_to_body(App);
}
```

```bash
trunk serve --open       # 开发，热重载
trunk build --release    # 产出 dist/
```

<Callout type="warn" title="最容易踩的坑：忘记 move" text="`{move || remaining()}` 里的 `move ||` 不能省。写成 `{remaining()}` 只在组件初始化时取一次值，之后界面再也不更新。编译器不一定会拦住你，因为它仍是合法的 IntoView —— 这是 Leptos 新手最常见的「界面不动」原因。" />

## CSR / SSR / 水合

| 模式 | 含义 | 适用 |
| --- | --- | --- |
| CSR | 全部在浏览器渲染，首屏是空 HTML | 后台工具、内部系统 |
| SSR | 服务端渲染出 HTML，交互再接管 | 需要 SEO / 首屏速度 |
| 水合（hydration） | 复用服务端 HTML 的 DOM，不重建 | 生产级 SSR 站点 |

Leptos 支持同一份组件在三种模式间切换，配合 axum 做 SSR 时，`Todo` 这个 struct 可以前后端共享 —— 这正是 [第 63 讲 全栈类型共享](/projects/frontend/fullstack.md) 要解决的问题。

<Compare title="同一处状态更新" :panels='[{"label":"React（重跑组件）","code":"const [n, setN] = useState(0);\nreturn &lt;p&gt;{n}&lt;/p&gt;;","note":"setN 后整个函数重新执行"},{"label":"Leptos（细粒度）","code":"let (n, _) = signal(0);\nview! { &lt;p&gt;{move || n.get()}&lt;/p&gt; }","note":"只更新那个文本节点"}]' note="细粒度更新省掉了虚拟 DOM diff，但要求你显式写出响应式闭包。" />

<Quiz no="60-1" q="Leptos 里 `{move || count.get()}` 的 `move ||` 作用是什么？" :options='["只是语法糖，可以省略", "建立响应式依赖，count 变化时只更新这个位置", "把值的所有权移进闭包，之后不能再读", "开启多线程渲染"]' answer="1" explain="视图里需要闭包来保持响应式订阅；直接写 count.get() 只会取值一次。" />

<Quiz no="60-2" q="`<For>` 的 `key` 为什么必须稳定？" :options='["为了好看", "列表增删时复用已有 DOM 节点、避免整段重建", "Leptos 要求 key 必须是整数", "没有实际作用"]' answer="1" explain="稳定的 key 让框架能识别「哪个元素没变」，这是细粒度更新能生效的前提。" />

<Exercise title="加一个筛选切换" task="增加三个按钮（全部 / 未完成 / 已完成），用一个 `signal` 存当前筛选，让 `<For>` 的 `each` 根据筛选返回过滤后的列表；计数文案也跟着变化。" hints='["用 enum Filter { All, Active, Done } 并 derive Clone + PartialEq", "each=move || { let f = filter.get(); items.get().into_iter().filter(...).collect::&lt;Vec&lt;_&gt;&gt;() }", "按钮样式可用 class:active=move || filter.get() == Filter::All"]' solution="let (filter, set_filter) = signal(Filter::All);\nlet shown = move || {\n    let f = filter.get();\n    items.get().into_iter()\n        .filter(|t| match f {\n            Filter::All =&gt; true,\n            Filter::Active =&gt; !t.done,\n            Filter::Done =&gt; t.done,\n        })\n        .collect::&lt;Vec&lt;_&gt;&gt;()\n};\n// &lt;For each=shown key=|t| t.id let:item&gt; ..." explain="把筛选结果做成闭包，items 或 filter 任一变化都会自动重算 —— 这就是自动依赖追踪。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 界面不更新 | 视图里少了 `move ||`；或改了 Vec 却没走 `update()` |
| 输入框每次失焦 | 用了 `value=` 而非 `prop:value=` |
| `event_target_value` 找不到 | 需 `use leptos::prelude::*`，并确认版本对应的工具函数 |
| 产物很大 | release + `opt-level="s"`、只开 `csr` feature、检查是否误引入了服务端依赖 |
| 部署后刷新 404 | SPA 需要把未知路径回退到 index.html（history fallback） |

## 扩展挑战

- 接入 `leptos_router` 做多页面路由。
- 把 `Todo` 抽到独立 crate，给 [axum 后端](/projects/frontend/fullstack.md) 复用。
- 用 `leptos` 的 SSR feature + axum 做服务端渲染，对比首屏体积与 LCP。
- 用 `wasm-bindgen-test` 给组件逻辑写测试。
- 换成 Dioxus / Yew 实现同一功能，比较三者的状态模型与产物体积。

<CheckList id="leptos-check" title="验收清单" :items='["trunk serve 能打开页面并交互", "添加 / 勾选 / 删除都正常", "计数文案随状态自动更新", "能解释 move || 为什么不能省", "trunk build --release 成功"]' />

[下一个项目：第 61 讲 Tauri 桌面应用 →](/projects/frontend/tauri.md)
