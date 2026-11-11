---
title: 第 27 讲 · 错误处理
description: panic、Option、Result、? 运算符、错误类型设计，以及 thiserror / anyhow 的分工。
---

<StageHeader stage="L3 · 第 27 讲" level="★★★☆☆" time="18 分钟" goal="能用 Result 和 ? 写出不崩溃的错误处理" prereq="enum / match / 所有权" />

# 第 27 讲 · 错误处理

程序不可能永远顺利：文件可能不存在、网络会超时、用户会输入非法内容。Rust 的态度是：**把「可能失败」写进返回类型，让调用方无法假装没看见。**

<ConceptDiagram type="error" title="Result 把成功与失败变成两条必须被处理的类型分支" />

## 两种失败：不可恢复 vs 可恢复

```rust
// 不可恢复：程序有 bug 或前提被破坏，直接终止（会打印栈回溯）
panic!("这里不该发生");

// 索引越界也会 panic
let v = vec![1, 2, 3];
// let x = v[10];   // panic!
```

`panic!` 适合「程序写错了」，**不适合**处理用户输入或 IO 失败。后者要用 `Result`。

<Callout type="warn" title="新手最容易滥用的两个方法" text="unwrap() 和 expect() 在 Err 时也会 panic。学习阶段用来跑通示例没问题，但写真正的程序时，请尽量换成 ? 或 match。教程的实战项目会逐步把它们替换掉。" />

## `Result<T, E>`

```rust
use std::fs;

fn main() {
    match fs::read_to_string("config.txt") {
        Ok(text) => println!("配置长度 {}", text.len()),
        Err(e)   => eprintln!("读取失败：{}", e),
    }
}
```

`eprintln!` 输出到标准错误流，适合错误信息。

## `?`：把错误往上交

如果当前函数也返回 `Result`，`?` 的意思是：**成功就取出里面的值继续，失败就立刻把错误返回给上层**。

```rust
use std::fs;

fn read_config() -> Result<String, std::io::Error> {
    let text = fs::read_to_string("config.txt")?;   // 失败就提前 return Err
    Ok(text.trim().to_string())
}

fn main() {
    match read_config() {
        Ok(c)  => println!("配置：{}", c),
        Err(e) => eprintln!("出错了：{}", e),
    }
}
```

对比一下没有 `?` 的写法，就能理解它省了多少样板代码：

<CodeTabs title="同一段逻辑的两种写法" :tabs='[{"label":"层层 match（啰嗦）","code":"fn read() -> Result<String, io::Error> {\n    let r = fs::read_to_string(f);\n    match r {\n        Ok(t) => Ok(t.trim().to_string()),\n        Err(e) => Err(e),\n    }\n}","note":"每个可能失败的步骤都要嵌套一次"},{"label":"用 ?（推荐）","code":"fn read() -> Result<String, io::Error> {\n    let t = fs::read_to_string(f)?;\n    Ok(t.trim().to_string())\n}","note":"一行就够，错误自动向上传播"}]' />

<Term word="错误传播" text="用 ? 把当前函数处理不了的错误原样返回给调用方，由更上层决定是重试、降级还是报告用户。" />

## `Option` 也有 `?`

```rust
fn first_line(text: &str) -> Option<&str> {
    let line = text.lines().next()?;   // 没有内容就返回 None
    if line.is_empty() { None } else { Some(line) }
}
```

## 自定义错误类型

当程序里可能出现多种失败（IO、解析、校验），用枚举统一它们：

```rust
use std::{fmt, io, num::ParseIntError};

#[derive(Debug)]
enum AppError {
    Io(io::Error),
    Parse(ParseIntError),
    Invalid(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AppError::Io(e)      => write!(f, "IO 错误：{}", e),
            AppError::Parse(e)   => write!(f, "解析错误：{}", e),
            AppError::Invalid(s) => write!(f, "非法输入：{}", s),
        }
    }
}
```

`?` 能自动把 `io::Error` 转成 `AppError::Io`，前提是给枚举实现 `From`（社区里通常用 `thiserror` 派生宏自动生成）：

```rust
#[derive(thiserror::Error, Debug)]
enum AppError {
    #[error("IO 错误：{0}")]
    Io(#[from] io::Error),
    #[error("解析错误：{0}")]
    Parse(#[from] ParseIntError),
}
```

## 两个常用 crate 怎么选

| crate | 用在 | 特点 |
| --- | --- | --- |
| `thiserror` | **写库**时定义错误类型 | 派生宏，错误类型结构化、可匹配 |
| `anyhow` | **写应用**的 `main` 附近 | 一个 `anyhow::Error` 装下所有错误，配 `.context()` 加说明 |

```rust
// 应用层常见写法
use anyhow::{Context, Result};

fn main() -> Result<()> {
    let cfg = std::fs::read_to_string("config.toml")
        .context("读取配置文件失败")?;
    println!("{}", cfg.len());
    Ok(())
}
```

<Quiz no="27-1" q="`?` 运算符在遇到 Err 时会做什么？" :options='["panic 终止程序", "立即从当前函数返回这个 Err", "打印错误并继续执行", "把 Err 转成 None"]' answer="1" explain="前提是所在函数返回 Result；? 等价于 match 的提前 return Err 分支。" />

<Quiz no="27-2" q="哪些场景适合用 Result 而不是 panic!？" :options='["读取用户指定的文件", "解析网络请求体", "数组下标由外部输入计算得到", "断言某个内部不变量一定成立"]' answer="0,1,2" multi="true" explain="来自外部的、可预期会失败的操作用 Result；内部不变量被破坏才适合 panic。" />

<Predict no="27-3" q="下面代码在文件不存在时会怎样？" :options='["打印 出错了 并继续运行", "panic 并终止程序", "打印空字符串", "编译失败"]' answer="1" output="thread main panicked ... Result::unwrap() on an Err value" explain="unwrap 在 Err 时直接 panic。生产代码应改成 ? 或 match。" />

```rust
let text = std::fs::read_to_string("missing.txt").unwrap();
println!("{}", text);
```

<FillBlank tpl="fn read() -&gt; Result&lt;String, std::io::Error&gt; {\n    let text = std::fs::read_to_string(&quot;a.txt&quot;)___;\n    Ok(text)\n}" answers="?" hint="把错误直接上交给调用方的运算符，只有一个字符。" explain="? 会在 Ok 时取出 String，在 Err 时提前返回。" />

<Exercise title="把 unwrap 换成 ?" task="写函数 fn add_from_file(path: &str) -&gt; Result&lt;i32, Box&lt;dyn std::error::Error&gt;&gt;：读文件、去掉首尾空白、解析成 i32、再加 1。全程用 ?，不要用 unwrap。" hints='["parse::&lt;i32&gt;() 返回 Result，也能用 ?", "Box&lt;dyn Error&gt; 能容纳多种错误类型", "最后写 Ok(n + 1)"]' solution="use std::error::Error;\n\nfn add_from_file(path: &str) -> Result<i32, Box<dyn Error>> {\n    let text = std::fs::read_to_string(path)?;\n    let n: i32 = text.trim().parse()?;\n    Ok(n + 1)\n}\n\nfn main() {\n    match add_from_file(&quot;num.txt&quot;) {\n        Ok(v) => println!(&quot;结果是 {}&quot;, v),\n        Err(e) => eprintln!(&quot;失败：{}&quot;, e),\n    }\n}" explain="Box&lt;dyn Error&gt; 是学习阶段很好用的「万能错误类型」，L5 的应用项目会改用 anyhow 聚合错误，只有写库时才用 thiserror。" />

## 补充：错误系统的两块底座

### 「不该发生」也有四种写法

| 宏 | 传达的意图 | 用在 |
| --- | --- | --- |
| `panic!` | 程序无法继续 | 断言内部不变量被破坏 |
| `todo!` | 这里要写，先占个位 | 开发期骨架；能编译能跑，执行到才 panic |
| `unimplemented!` | 这个分支明确还没实现 | 比 `todo!` 语气更重，提醒调用方别依赖 |
| `unreachable!` | 逻辑上不可能走到 | 已穷举的 match 分支、无限循环之后 |

四个最终都会 panic，区别在**给读代码的人留下什么信息**。原型期用 `todo!` 很顺手，但合并前记得全仓搜一遍残留。

### 编译器帮你盯着 `Result`

`Result` 带 `#[must_use]`：调用后既不接收也不处理，编译器会报 `unused_must_use` 警告。这是把「可能失败」写进类型之后的最后一道保险。真想忽略，就写 `let _ = f();`，让「我确实不要这个结果」成为一次有意识的表态，而不是手滑。

### `std::error::Error` 与错误链

```text
pub trait Error: Debug + Display {}   // 标准库定义（简化，示意用）
```

实现它要求同时有 `Debug`（通常 derive，第 23 讲用过）和 `Display`（手写，[第 28 讲](/core/traits.md) 会展开）—— 一个错误类型既要能给程序员看，也要能给人看。实现后才能塞进 `Box<dyn Error>` 或 `&dyn Error`，本讲练习里已经用过这个写法。注意 `Result<T, E>` 的 `E` **并不要求**实现 `Error` —— 自定义枚举一样能当错误类型。

错误还可以带上下文链：`Error::source()` 返回下一层原因，`anyhow` 的 `Context` 就是在维护这条链；需要按原始类型分派时用 `downcast_ref::<MyError>()` 取回来。日志里只打最外层一句，排查时却能展开整条链，这才是「加上下文」的价值。

<Quiz no="27-4" q="调用一个返回 `Result` 的函数却完全不接收返回值，会怎样？" :options='["编译直接失败", "触发 unused_must_use 警告", "自动调用 unwrap", "静默当作成功"]' answer="1" explain="Result 带 #[must_use]；想显式忽略就写 let _ = f();，把忽略变成有意识的选择。" />

## 小结

- 可恢复错误用 `Result<T, E>`，不可恢复的 bug 才 `panic!`。
- `?` 把错误向上传播，`Option` 上也能用。
- `unwrap` / `expect` 方便但会 panic，正式代码要替换。
- 库用 `thiserror` 定义结构化错误，应用用 `anyhow` 简化。

<CheckList id="error-check" title="学完本节，你应该能…" :items='["说出 Result 的两个变体", "用 ? 改写嵌套 match", "解释 unwrap 的风险", "说出 thiserror 与 anyhow 的分工", "写出返回 Result 的函数"]' />

[下一讲：Trait 定义与实现 →](/core/traits.md)
