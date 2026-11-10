---
title: 第 03 讲 · 第一行 Rust 代码
description: 逐行拆解 fn main、println! 与分号，理解「编译」与「运行」到底发生了什么。
---

<StageHeader stage="L0 · 第 03 讲" level="★☆☆☆☆" time="18 分钟" goal="能逐行解释 Hello World 并自己改出输出" prereq="装好环境" />

# 第 03 讲 · 第一行 Rust 代码

先看全部代码。它只有三行，但每一行都藏着 Rust 的重要设计。

```rust
fn main() {
    println!("Hello, Rust!");
}
```

运行它：

```bash
$ cargo run
   Compiling hello v0.1.0
    Finished dev [unoptimized + debuginfo] target(s) in 0.42s
     Running `target/debug/hello`
Hello, Rust!
```

## 逐行拆解

**`fn main() {`** —— `fn` 是「函数」（function）的缩写，`main` 是函数名，每个可执行程序都从 `main` 开始跑。后面空的 `()` 表示它不接收任何参数，`{` 表示函数体从这里开始。

**`println!("Hello, Rust!");`** —— 往屏幕打印一行文字。注意 `println!` 后面有个 **`!`**：这不是普通函数，而是**宏（macro）**。宏在编译期会展开成更长的代码，你可以暂时把它理解为「功能加强版的打印函数」。字符串写在双引号里，行尾的分号 `;` 表示这条语句结束。

**`}`** —— 函数体结束。

<Callout type="tip" title="为什么打印要带感叹号？" text="因为 Rust 的普通函数只能接收固定个数的参数，而 println! 支持任意个数的花括号占位符，可以一次打印多个值。这种「变参数」能力由宏提供。以后你会经常见到 vec!、format!、panic! 这些带感叹号的宏。" />

<Compare title="和熟悉的语言比一比" :panels='[{"label":"Python","code":"print(\"Hello, Rust!\")","note":"一行，解释执行"},{"label":"JavaScript","code":"console.log(\"Hello, Rust!\");","note":"一行，解释执行"},{"label":"Rust","code":"fn main() {\n    println!(\"Hello, Rust!\");\n}","note":"需要先编译成可执行文件"}]' note="Rust 是编译型语言：写的是给人看的源码，运行的是编译器生成的二进制文件。" />

## 「编译」和「运行」是两件事

```text
你写的 src/main.rs
      │  rustc / cargo build  （检查语法、类型、所有权）
      ▼
target/debug/hello   ← 一个可以直接执行的二进制文件
      │  运行
      ▼
屏幕上的 Hello, Rust!
```

这件事带来两个新手必须习惯的结果：

1. **错误会在运行之前就被发现。** 少个分号、类型写错、用了不该用的变量，编译器都会在编译阶段拦下来。这看起来严格，但其实是在替你省下运行时调试的时间。
2. **第一次 `cargo run` 会慢一点**（要编译），之后再跑就快了。

<ConceptDiagram type="cargo" title="从源码到输出：每一步由谁负责" />

## 让输出「活」起来：`println!` 的占位符

`{}` 是一个占位符，会被后面的值替换。

```rust
fn main() {
    let name = "小明";
    let score = 95;
    println!("{} 考了 {} 分", name, score);

    // 调试输出：{:?} 会把值按「方便开发者看」的格式打印
    println!("原始数据：{:?} {:?}", name, score);
}
```

<Predict no="03-1" q="上面这段程序会输出什么？" :options='["小明 考了 95 分 / 原始数据：\"小明\" 95", "小明 考了 95 分，然后报错", "{name} 考了 {score} 分", "什么也不打印"]' answer="0" explain="{} 按顺序替换成 name 和 score；{:?} 是调试格式，字符串会带引号，整数仍是数字。" />

注意输出里的换行：`println!` 会自动在末尾加一个换行；如果不想换行，用 `print!`。

## 注释：写给人看的话

```rust
// 这是单行注释，编译器完全忽略它

fn main() {
    /*
      这是多行注释，
      可以写好几行。
    */
    println!("注释不会被打印"); // 也可以写在代码后面
}
```

<Callout type="warn" title="新手最常见的三个坑" text="1. 中文标点：把英文分号打成中文分号、把英文双引号打成中文引号，编译器会看不懂。2. 忘记配对的花括号。3. 把 println! 写成 println（漏了感叹号）。遇到报错先检查这三处。" />

## 动手改一改

<FillBlank tpl="fn main() {\n    let city = &quot;深圳&quot;;\n    ___!(&quot;我住在 {}&quot;, city);\n}" answers="println" hint="就是本节一直在用的那个带感叹号的宏。" explain="println! 是宏，必须带感叹号；字符串里的 {} 会被 city 的值替换。" />

<Exercise title="自我介绍程序" task="写一个程序，用三个 let 变量分别保存你的名字、城市和年份，然后用一行 println! 输出一句完整的自我介绍。" hints='["字符串用双引号，数字不需要引号", "println! 里写三个 {}，后面按顺序跟三个变量"]' solution="fn main() {\n    let name = &quot;小明&quot;;\n    let city = &quot;深圳&quot;;\n    let year = 2026;\n    println!(&quot;我是 {}，来自 {}，{} 年开始学 Rust。&quot;, name, city, year);\n}" explain="{} 的个数必须和后面值的个数一致，否则编译期就会报错 —— 这就是编译型语言的好处。" />

<Quiz no="03-2" q="关于 println! 这一行代码，哪个说法是错的？" :options='["println! 是一个宏，不是普通函数", "末尾的分号表示这条语句结束", "去掉感叹号写成 println 也能正常编译", "它会在输出末尾自动换行"]' answer="2" explain="去掉 ! 之后 Rust 会去找一个叫 println 的函数，找不到就会报 cannot find function 错误。" />

<Quiz no="03-3" q="`cargo run` 背后依次发生了什么？" :options='["直接解释执行 .rs 文件", "先编译成二进制文件，再运行它", "把代码上传到服务器执行", "只检查语法，不运行"]' answer="1" explain="cargo run = cargo build + 执行生成的二进制文件。只检查不运行的是 cargo check。" />

## 小结

<CheckList id="hello-check" title="学完本节，你应该能…" :items='["逐行解释 fn main() 的作用", "说清楚 println! 里的 ! 是什么", "理解编译和运行是两步", "用 {} 占位符打印变量", "自己写出并运行一个带变量的程序"]' />

你已经能让电脑听你的话了。接下来先别急着学更多语法 —— 下一阶段我们补一块最容易被跳过、却决定你能不能读懂 Rust 的地基：**数据到底放在哪里**。

[进入阶段一：编程地基 →](/foundation/index.md)
