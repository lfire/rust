---
title: 第 42 讲 · 待办清单（serde 持久化）
description: 用 struct + enum + serde + JSON 文件，做出一个数据能存下来的完整小工具。
---

<StageHeader stage="L5 · 第 42 讲" level="★★★☆☆" time="70 分钟" goal="掌握「建模 → 序列化 → 持久化 → 子命令」的完整链路" prereq="L3 struct / enum / Result" />

# 第 42 讲 · 待办清单

**场景**：一个真正的 CRUD 小工具。它把前面几个阶段的知识第一次拼成闭环：**用 enum/struct 建模 → 用 serde 序列化 → 用 Result 处理 IO → 用子命令组织交互**。

## 你会练到什么

- 用 `enum` 表达命令、用 `struct` 表达数据
- `#[derive(Serialize, Deserialize)]` 一行搞定 JSON 持久化
- `Option` / `Result` 处理「任务不存在」「文件损坏」
- 「读文件 → 改内存 → 写回文件」的经典模式与原子写入
- clap 的子命令（add / list / done / rm）

## 依赖

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
chrono = { version = "0.4", features = ["serde"] }
```

<ConceptDiagram type="error" title="文件不存在、JSON 损坏、任务不存在，三种失败分开处理" />

## 数据模型

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum Priority { Low, Normal, High }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Todo {
    pub id: u32,
    pub title: String,
    pub done: bool,
    pub priority: Priority,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Store {
    pub next_id: u32,
    pub items: Vec<Todo>,
}
```

<Callout type="idea" title="为什么加一层 Store" text="直接存 `Vec&lt;Todo&gt;` 也行，但「下一个 id」就得每次遍历求最大值。用一个结构体把元数据和列表一起持久化，是更真实的建模方式。" />

<StepBox title="分步实现" :steps='[{"title":"定义数据模型","body":"写 Todo / Priority / Store 三个类型，都派生 Serialize 与 Deserialize。","tip":"派生宏就是 trait 的自动实现，L3 讲过。"},{"title":"定义命令","body":"用 `#[derive(Subcommand)] enum Cmd { Add { title: String, #[arg(short, long)] priority: Priority }, List, Done { id: u32 }, Rm { id: u32 } }`。","tip":"clap 支持把枚举变体映射成子命令。"},{"title":"实现读写","body":"`fn load() -&gt; Result&lt;Store&gt;`：文件不存在就返回 Store::default()，存在则 serde_json::from_str；`fn save(&amp;self)` 用 to_string_pretty 写回。","tip":"用 Option 判断「文件不存在」是正常情况，不算错误。"},{"title":"实现命令分发","body":"match cli.command 四个分支，分别操作 store.items 并打印结果，末尾统一 save。","tip":"修改后只 save 一次，逻辑集中、失败点少。"},{"title":"加健壮性","body":"写文件时先写临时文件再 rename，避免中途崩溃把数据写坏；Done / Rm 找不到 id 时给出友好提示。"}]' />

## 完整代码（核心部分）

```rust
use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Clone, clap::ValueEnum, Serialize, Deserialize, PartialEq)]
enum Priority { Low, Normal, High }

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Todo { id: u32, title: String, done: bool, priority: Priority }

#[derive(Debug, Serialize, Deserialize, Default)]
struct Store { next_id: u32, items: Vec<Todo> }

impl Store {
    const PATH: &'static str = "todos.json";

    fn load() -> Result<Self> {
        let path = PathBuf::from(Self::PATH);
        if !path.exists() { return Ok(Self::default()); }
        let text = fs::read_to_string(&path).context("读取待办文件失败")?;
        serde_json::from_str(&text).context("待办文件损坏，JSON 解析失败")
    }

    fn save(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(self).context("序列化失败")?;
        let tmp = PathBuf::from("todos.json.tmp");
        fs::write(&tmp, json).context("写临时文件失败")?;
        fs::rename(&tmp, Self::PATH).context("重命名临时文件失败")?;
        Ok(())
    }
}

#[derive(Parser)]
#[command(about = "一个会持久化的待办清单")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// 添加任务
    Add { title: String, #[arg(short, long, default_value = "normal")] priority: Priority },
    /// 列出全部
    List,
    /// 标记完成
    Done { id: u32 },
    /// 删除任务
    Rm { id: u32 },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let mut store = Store::load()?;

    match cli.command {
        Cmd::Add { title, priority } => {
            store.next_id += 1;
            let id = store.next_id;
            store.items.push(Todo { id, title: title.clone(), done: false, priority });
            println!("✅ 已添加 [{}] {}", id, title);
        }
        Cmd::List => {
            if store.items.is_empty() { println!("（暂无任务）"); }
            for t in &store.items {
                println!("[{}] {:?} {} {}",
                    if t.done { "x" } else { " " },
                    t.priority, t.id, t.title);
            }
        }
        Cmd::Done { id } => {
            match store.items.iter_mut().find(|t| t.id == id) {
                Some(t) => { t.done = true; println!("🎉 已完成 {}", t.title); }
                None    => anyhow::bail!("找不到 id 为 {} 的任务", id),
            }
        }
        Cmd::Rm { id } => {
            let before = store.items.len();
            store.items.retain(|t| t.id != id);
            if store.items.len() == before { anyhow::bail!("找不到 id 为 {} 的任务", id); }
            println!("🗑 已删除 {}", id);
        }
    }

    store.save()
}
```

```bash
cargo run -- add "学所有权" -p high
cargo run -- add "写 mini-grep"
cargo run -- list
cargo run -- done 1
cat todos.json
```

<Callout type="warn" title="先写临时文件再 rename" text="直接 `fs::write(path, ...)` 时如果程序中途被杀，文件可能只写了一半。写 `.tmp` 再原子 rename 是本地持久化的标准做法；真要做多进程安全，还得加文件锁。" />

<Quiz no="42-1" q="`#[derive(Serialize, Deserialize)]` 实际做了什么？" :options='["自动生成 JSON 文件", "自动实现 serde 的两个 trait，让类型能与 JSON 互转", "自动加索引提升查询速度", "让结构体字段变成 public"]' answer="1" explain="派生宏在编译期生成 impl Serialize for Todo 与 impl Deserialize for Todo。" />

<Quiz no="42-2" q="`load()` 遇到文件不存在时应该怎么处理？" :options='["直接 panic", "返回空的 Store::default()，属于正常初始状态", "返回 Err 让程序退出", "创建一个损坏的空 JSON"]' answer="1" explain="首次运行没有文件是预期情况，不该当成错误；而 JSON 解析失败才应该报错。" />

<Predict no="42-3" q="执行 `cargo run -- done 999` 且不存在该 id 时，程序会？" :options='["静默成功", "打印友好错误并返回非 0 退出码", "panic", "自动创建该任务"]' answer="1" output="错误：找不到 id 为 999 的任务" explain="anyhow::bail! 提前返回 Err，main 返回 Result 时 Rust 会打印错误并设置失败退出码。" />

<Exercise title="加一个 edit 子命令" task="增加 `edit &lt;id&gt; &lt;new_title&gt;`，能修改已有任务标题；找不到 id 时同样给出友好错误。" hints='["给 Cmd 加一个变体，字段是 id 和 title", "用 iter_mut().find() 拿到可变引用", "标题是 String，赋值时注意所有权：可以用 clone 或直接移动参数"]' solution="Cmd::Edit { id, title } => {\n    match store.items.iter_mut().find(|t| t.id == id) {\n        Some(t) => { t.title = title.clone(); println!(&quot;已更新 {}&quot;, title); }\n        None => anyhow::bail!(&quot;找不到 id 为 {} 的任务&quot;, id),\n    }\n}" explain="注意 store.save() 在 match 之后统一调用，所以新命令不用管持久化。" />

## 扩展挑战

- 支持 `--all` 列出已完成项、默认隐藏；加 `clear` 清空已完成。
- 用 `chrono` 记录创建时间并按时间排序（derive 里加 `serde` feature）。
- 把 `Store` 抽成 trait，做「JSON 存储」和「内存存储（测试用）」两种实现 —— 这正是 KV Server 第 1 步要做的事。
- 为 `load/save` 写集成测试，用临时目录隔离文件。

<CheckList id="todo-check" title="验收清单" :items='["四个子命令都能工作", "数据确实写入了 todos.json 且重启后还在", "文件损坏时给出可读错误", "写了临时文件再 rename"]' />

[下一个项目：第 43 讲 CLI 工程化 →](/projects/cli-engineering.md)
