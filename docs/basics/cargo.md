---
title: 第 14 讲 · Cargo 与项目结构
description: 读懂 Cargo.toml、加第一个依赖、拆分模块、写第一个单元测试。
---

<StageHeader stage="L2 · 第 14 讲" level="★★☆☆☆" time="16 分钟" goal="能创建、组织、测试一个 Rust 项目" prereq="变量 / 函数 / 控制流" />

# 第 14 讲 · Cargo 与项目结构

代码写到几十行以后，就该学会把项目「组织起来」了。Rust 的答案是一个工具全包：**Cargo**。

## `Cargo.toml`：项目的身份证

```toml
[package]
name = "todo"
version = "0.1.0"
edition = "2021"          # 版次，决定语言的一些默认行为

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

- `[package]`：项目自身信息。
- `[dependencies]`：依赖的 crate 及版本。版本 `"1.0"` 表示「兼容 1.x」，Cargo 会挑一个具体版本锁进 `Cargo.lock`。
- `features = [...]`：crate 的可选功能，按需开启可以少编译很多东西。

<Callout type="tip" title="Cargo.lock 要不要提交？" text="做可执行程序（本教程的所有项目）时应该提交它，保证团队和 CI 用完全一致的依赖版本；做给别人用的库时通常不提交。别手动编辑它。" />

## 加一个依赖，跑起来

<StepBox title="用 rand 写一个随机数小程序" :steps='[{"title":"创建项目","body":"`cargo new lucky` 然后 `cd lucky`。"},{"title":"声明依赖","body":"在 `Cargo.toml` 的 `[dependencies]` 下面添加 rand 依赖，版本写 0.8。","tip":"第一次 cargo run 时 Cargo 会自动从 crates.io 下载。"},{"title":"写代码","body":"在 `src/main.rs` 里 `use rand::Rng;` 并调用 `rand::thread_rng().gen_range(1..=100)`。"},{"title":"运行验证","body":"`cargo run`，每次应输出不同的 1 到 100 之间的数字。"}]' />

```rust
use rand::Rng;

fn main() {
    let mut rng = rand::thread_rng();
    let n: i32 = rng.gen_range(1..=100);
    println!("今天的幸运数字是 {}", n);
}
```

## 模块：把代码拆到不同文件

```text
src/
├── main.rs        # 入口
├── math.rs        # 子模块
└── model/
    └── mod.rs     # 目录模块
```

```rust
// src/math.rs
pub fn double(n: i32) -> i32 { n * 2 }

// src/main.rs
mod math;                 // 声明有 math 这个模块
use crate::math::double;  // 把函数引入当前作用域

fn main() {
    println!("{}", double(4));
}
```

三个关键字先分清楚：

| 关键字 | 作用 |
| --- | --- |
| `mod` | 声明/定义一个模块（可以理解为「有个这个文件」） |
| `use` | 把某个路径引入当前作用域，省得每次写全名 |
| `pub` | 让项对模块外可见（默认私有） |

<Callout type="idea" title="为什么要分模块" text="当 main.rs 超过一两百行，找代码就会变慢。按职责拆分（网络 / 存储 / 模型 / 协议）之后，L5 的 KV Server 才能一层层演进而不乱。这套分层思路现在就该开始习惯。" />

<ConceptDiagram type="pipeline" title="L5 会把一个服务拆成协议层 / 服务层 / 存储层，每层用 trait 解耦" />

## 单元测试：写在代码旁边

```rust
pub fn double(n: i32) -> i32 { n * 2 }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_double() {
        assert_eq!(double(4), 8);
        assert_eq!(double(0), 0);
    }
}
```

运行 `cargo test`。`#[cfg(test)]` 表示这段只在测试时编译；`assert_eq!` 不相等就 panic 并打印两边的值。

## 常用命令速查

| 命令 | 作用 |
| --- | --- |
| `cargo new` / `cargo init` | 新建项目 / 在当前目录初始化 |
| `cargo check` | 快速检查能否编译（写代码时最常用） |
| `cargo run` | 编译并运行 |
| `cargo build --release` | 优化编译，产物在 `target/release/` |
| `cargo test` | 跑所有测试 |
| `cargo fmt` | 统一格式化代码 |
| `cargo clippy` | 静态检查，给出惯用写法建议 |
| `cargo doc --open` | 生成并打开项目文档 |

<Quiz no="14-1" q="关于 Cargo，下面哪个说法是错的？" :options='["依赖写在 Cargo.toml 的 [dependencies] 下", "Cargo.lock 由 Cargo 自动维护，记录精确版本", "cargo check 会生成可以直接发布的可执行文件", "pub 让模块内的项对外可见"]' answer="2" explain="cargo check 只做检查不生成二进制；要产物得用 cargo build。" />

<Quiz no="14-2" q="想在 main.rs 里使用 math.rs 中的函数，需要哪两件事？" :options='["用 mod math; 声明模块", "被调函数需要用 pub 标记（跨模块可见）", "可以用 use 把路径引入作用域", "必须把 math.rs 改名为 main.rs"]' answer="0,1,2" multi="true" explain="mod 声明模块、pub 开放可见性、use 简化路径，三者各司其职。" />

<Exercise title="给项目加个模块" task="在 cargo 项目里新建 src/greet.rs，写一个 pub fn hello(name: &str) 返回一句问候字符串，然后在 main.rs 里用 mod 和 use 调用它，最后跑 cargo run。" hints='["跨模块函数要写 pub", "参数借用一个字符串切片即可，本节照抄签名就行", "返回值类型写成 String，用 format! 宏拼接"]' solution="// src/greet.rs\npub fn hello(name: &str) -> String {\n    format!(&quot;你好，{}！欢迎学习 Rust。&quot;, name)\n}\n\n// src/main.rs\nmod greet;\nuse greet::hello;\n\nfn main() {\n    println!(&quot;{}&quot;, hello(&quot;小明&quot;));\n}" explain="这里第一次出现 &str 参数和 String 返回值，L3 会解释它们背后的所有权规则。" />

## 小结

- `Cargo.toml` 管项目与依赖，`Cargo.lock` 锁精确版本。
- `mod` 声明模块、`use` 引路径、`pub` 开可见性。
- 单元测试写在 `#[cfg(test)] mod tests` 里，`cargo test` 运行。
- `cargo check` / `fmt` / `clippy` 是日常三件套。

<CheckList id="cargo-check" title="学完本节，你应该能…" :items='["读懂并修改 Cargo.toml 的依赖段", "把一个函数拆到独立模块并在 main 里调用", "写出一个 assert_eq! 单元测试", "说出 cargo check / fmt / clippy 各自的用途"]' />

[上一讲：第 13 讲 match 与模式匹配入门 →](/basics/match-basics.md) · [下一讲：第 15 讲 阶段综合：成绩统计程序 →](/basics/capstone.md)
