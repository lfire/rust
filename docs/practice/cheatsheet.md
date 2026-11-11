---
title: 语法速查表
description: 一页查完 Rust 常用语法：变量、类型、所有权、控制流、错误处理、trait、并发。
---

<StageHeader stage="附录 · 练习与速查" level="★☆☆☆☆" time="随时查阅" goal="写代码卡住时快速找到正确写法" prereq="无" />

# 语法速查表

这一页不讲解，只给「长什么样」。建议收藏，写代码时随手查。

## 变量与类型

<CodeTabs title="变量声明" :tabs='[{"label":"不可变（默认）","code":"let x = 5;\nlet y: u8 = 5;","note":"推荐默认使用"},{"label":"可变","code":"let mut n = 0;\nn += 1;","note":"类型不能变"},{"label":"遮蔽","code":"let s = \"42\";\nlet s: i32 = s.parse().unwrap();","note":"同名新绑定，可以换类型"}]' />

| 类型 | 写法 | 备注 |
| --- | --- | --- |
| 有符号整数 | `i8` `i16` `i32` `i64` `isize` | 默认 `i32` |
| 无符号整数 | `u8` `u16` `u32` `u64` `usize` | 索引/长度用 `usize` |
| 浮点 | `f32` `f64` | 默认 `f64` |
| 布尔 / 字符 | `bool` / `char` | `char` 用单引号，4 字节 |
| 元组 | `(i32, f64)` | `t.0` 取元素 |
| 数组 | `[i32; 5]` | 长度固定，是类型的一部分 |
| 动态数组 | `Vec<T>` | `vec![1,2,3]` |
| 字符串 | `String` / `&str` | 拥有 / 借看 |
| 哈希表 | `HashMap<K, V>` | `use std::collections::HashMap;` |

## 所有权与借用（最高频）

| 写法 | 含义 |
| --- | --- |
| `let b = a;` | 移动所有权（非 Copy 类型），`a` 失效 |
| `let b = a.clone();` | 显式深拷贝，两者都可用 |
| `let r = &a;` | 不可变借用，可有多个 |
| `let r = &mut a;` | 可变借用，必须独占 |
| `fn f(s: String)` | 拿走所有权 |
| `fn f(s: &String)` | 只读借用 |
| `fn f(s: &str)` | 只读借用，更通用（推荐） |
| `fn f(s: &mut String)` | 借出可写权限 |
| `Box<T>` | 堆分配 / 递归类型 / `dyn Trait` |
| `Rc<T>` / `Arc<T>` | 单线程 / 多线程多所有者 |
| `RefCell<T>` | 运行时借用检查 |

<ConceptDiagram type="borrow" title="借用规则一图速记" />

<Callout type="warn" title="报错速查" text="E0382 = 使用了已移动的值；E0502 = 只读借用与可变借用冲突；E0597 = 值活得不够久；E0515 = 不能返回局部变量的引用；E0308 = 类型不匹配（常见于末尾多写了分号）。" />

## 函数、控制流与匹配

```rust
fn add(a: i32, b: i32) -> i32 { a + b }        // 最后一行不加分号
fn nothing() {}                                  // 返回 ()
let label = if n > 0 { "正" } else { "非正" };    // if 是表达式
for x in &v { }                                  // 借用遍历
for i in 1..=5 { }                               // 含端点范围
loop { if done { break value; } }                // loop 可带出值
while cond { }
match v { 1 => ..., 2..=9 => ..., _ => ... }     // 必须穷举
if let Some(x) = opt { }                         // 只关心一种形状
```

<CodeTabs title="Option / Result 常用写法" :tabs='[{"label":"Option","code":"match opt {\n    Some(v) => ...,\n    None => ...,\n}\nopt.unwrap_or(default)\nopt?,  // 在返回 Option 的函数里","note":"表达「可能没有」"},{"label":"Result","code":"match res {\n    Ok(v) => ...,\n    Err(e) => ...,\n}\nlet v = res?;\nres.context(\"说明\")?;","note":"表达「可能失败」"}]' />

## 结构体、枚举与 trait

```rust
#[derive(Debug, Clone, PartialEq)]
struct User { name: String, age: u8 }            // 字段默认私有

enum Msg { Quit, Text(String), Move { x: i32, y: i32 } }

impl User {
    fn new(name: String) -> Self { Self { name, age: 0 } }  // 关联函数
    fn greet(&self) -> String { format!("hi {}", self.name) } // 方法
    fn birthday(&mut self) { self.age += 1; }
}

trait Summary {
    fn summarize(&self) -> String;                // 必须实现
    fn tag(&self) -> String { String::from("...") } // 默认实现
}
impl Summary for User { fn summarize(&self) -> String { self.name.clone() } }

fn print_it<T: Summary + std::fmt::Debug>(x: &T) { }
fn dyn_it(x: &dyn Summary) { }                   // 动态分发
```

## 集合与迭代器

```rust
let mut v = vec![1, 2, 3];
v.push(4);
v.get(10);                       // Option，越界不 panic
for x in &v { }                  // 借用
for x in &mut v { *x += 1; }     // 可变借用
for x in v { }                   // 消耗所有权

let out: Vec<i32> = v.iter()
    .filter(|&&x| x > 1)
    .map(|&x| x * 10)
    .collect();                  // 不 collect 就不执行

let mut m = HashMap::new();
*m.entry("k".to_string()).or_insert(0) += 1;
m.get("k");                      // Option<&V>
```

## 错误处理

```rust
fn read() -> anyhow::Result<String> {
    let s = std::fs::read_to_string("a.txt")
        .context("读取文件失败")?;
    Ok(s)
}

// 库里定义结构化错误
#[derive(thiserror::Error, Debug)]
enum AppError {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
}
```

## 模块与 Cargo

```rust
mod math;                  // 声明模块
pub mod model;             // 对外可见
use crate::math::double;   // 引入路径
use std::collections::HashMap;
```

| 命令 | 作用 |
| --- | --- |
| `cargo check` | 快速检查编译 |
| `cargo run` | 编译并运行 |
| `cargo test` | 跑测试（含 doctest） |
| `cargo fmt` / `cargo clippy` | 格式化 / 惯用检查 |
| `cargo build --release` | 优化构建 |
| `cargo doc --open` | 生成文档 |
| `cargo tree -d` | 查重复依赖 |

## 并发与异步

```rust
use std::sync::{Arc, Mutex};

fn main() {
    // 线程
    let h = std::thread::spawn(move || { /* ... */ });
    h.join().unwrap();

    // 共享状态
    let c = Arc::new(Mutex::new(0));
    let c2 = Arc::clone(&c);
    *c2.lock().unwrap() += 1;

    // 消息传递
    let (tx, rx) = std::sync::mpsc::channel();
    tx.send(1).unwrap();
    drop(tx);
    for msg in rx { println!("{}", msg); }
}

// 异步（需 tokio 依赖，与上面的 main 二选一）
// #[tokio::main]
// async fn main() {
//     let r = tokio::spawn(async { 1 + 1 }).await.unwrap();
// }
```

<ConceptDiagram type="async" title="Future / executor / Waker 的关系" />

<Callout type="tip" title="查不到时" text="用左侧搜索框搜关键词，或回到 [综合自测](/practice/) 定位薄弱章节。Rust 官方的 Standard Library 文档和 Rust Book 也是很好的补充。" />
