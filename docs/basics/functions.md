---
title: 第 11 讲 · 函数、语句与表达式
description: fn 签名、参数、返回值、语句与表达式的区别，以及 Rust 最容易踩的分号坑。
---

<StageHeader stage="L2 · 第 11 讲" level="★★☆☆☆" time="15 分钟" goal="能写带参数和返回值的函数" prereq="第 07 讲 概念 + 变量与类型" />

# 第 11 讲 · 函数、语句与表达式

概念层（函数 / 方法 / 闭包 / 表达式是什么、彼此什么关系）见 [第 07 讲](/foundation/callables.md)；本讲专讲 Rust 的语法细节。

当一段逻辑要被用第二次，就把它变成函数。

## 函数签名

```rust
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    let result = add(2, 3);
    println!("2 + 3 = {}", result);
}
```

一行里每个部分都有固定含义：

```text
fn  add ( a: i32, b: i32 ) -> i32 { ... }
│   │    └── 参数：名字: 类型 ──┘   │
│   └ 函数名                       └ 返回值类型
└ 关键字 fn
```

<Callout type="tip" title="参数必须写类型" text="Rust 不会从调用处猜函数参数的类型，函数签名里的类型必须写明。这是为了让每个函数可以独立被检查，也让 IDE 能准确提示。" />

## 返回值：不加分号

函数体的**最后一个表达式**就是返回值。

```rust
fn square(n: i32) -> i32 {
    n * n        // 没有分号 → 返回 n*n
}

fn broken(n: i32) -> i32 {
    n * n;       // 有分号 → 变成语句，函数返回 ()，编译报错
}
```

第二种写法会得到：

```text
error[E0308]: mismatched types
  expected `i32`, found `()`
```

`()` 读作「单元类型」，可以理解为「什么值都没有」。

<Compare title="两种返回写法" :panels='[{"label":"隐式返回（推荐）","code":"fn f(n: i32) -> i32 {\n    n * 2\n}","note":"最后一行不加分号"},{"label":"提前返回","code":"fn f(n: i32) -> i32 {\n    if n < 0 { return 0; }\n    n * 2\n}","note":"return 用于中途退出，行尾要有分号"}]' note="Rust 有 return 关键字，但绝大多数函数用最后一行表达式更简洁。" />

## 语句 vs 表达式：一条分界

- **语句**：做一件事，不产生值，以 `;` 结尾。比如 `let x = 5;`。
- **表达式**：计算出一个值。比如 `5 + 3`、`if ... { } else { }`、函数调用、代码块 `{ }`。

这个区别让 Rust 代码可以写得很紧凑：

```rust
fn main() {
    let n = 7;
    let label = if n > 5 { "大" } else { "小" };   // if 是表达式
    let doubled = { let t = n * 2; t + 1 };       // 代码块是表达式
    println!("{} {}", label, doubled);            // 大 15
}
```

<Predict no="11-1" q="下面这段代码输出什么？" :options='["10", "()", "编译错误：类型不匹配", "0"]' answer="2" output="error[E0308]: mismatched types" explain="函数声明返回 i32，但最后一行 value + 1; 带了分号，实际返回 ()。" />

```rust
fn compute() -> i32 {
    let value = 9;
    value + 1;
}

fn main() {
    println!("{}", compute());
}
```

<FillBlank tpl="fn double(n: i32) -> i32 {\n    n ___ 2\n}\nfn main() { println!(&quot;{}&quot;, double(4)); }" answers="*" hint="要让结果等于 8，用什么运算符？" explain="n * 2 是表达式且没有分号，作为返回值；输出 8。" />

## 多返回值：用元组

Rust 没有「返回两个值」的语法，用元组即可，调用处解构：

```rust
fn min_max(a: i32, b: i32) -> (i32, i32) {
    if a < b { (a, b) } else { (b, a) }
}

fn main() {
    let (lo, hi) = min_max(9, 3);
    println!("最小 {} 最大 {}", lo, hi);
}
```

## 注释与文档注释

```rust
/// 计算平方。
/// 这是文档注释，cargo doc 会把它生成进文档。
fn square(n: i32) -> i32 { n * n }

fn main() {
    // 普通注释
    println!("{}", square(4));
}
```

<Callout type="idea" title="为 L3 埋个伏笔" text="函数参数是「谁拥有这个值」问题最集中的地方。把 String 传进函数之后还能不能用？L3 会给出完整答案，本节先记住现象即可。" />

```rust
fn take(s: String) {
    println!("拿到了 {}", s);
}

fn main() {
    let name = String::from("Rust");
    take(name);
    // println!("{}", name); // 取消注释会报 borrow of moved value
}
```

<Quiz no="11-2" q="关于 Rust 函数，下面哪句是错的？" :options='["参数类型必须在签名里写明", "最后一个表达式不加分号即为返回值", "可以用元组一次返回多个值", "不写 -> 类型时，函数默认返回 i32"]' answer="3" explain="不写返回类型时函数返回单元类型 ()，不是 i32。" />

<Quiz no="11-3" q="哪些写法是合法的表达式（能产生值）？" :options='["if cond { 1 } else { 2 }", "{ let t = 3; t + 1 }", "let x = 5;", "square(4)"]' answer="0,1,3" multi="true" explain="`let x = 5;` 是语句，不产生值（在 Rust 里它的值是 ()）。" />

<Exercise title="写一个温度判断函数" task="写函数 classify(score: i32) -> i32：90 分以上返回 1，60 到 89 返回 2，其余返回 3；再在 main 里用 for 循环打印 95、70、40 三个分数的分类结果。" hints='["用 if / else if / else，注意返回的是整数", "可以写三个 println! 分别调用 classify"]' solution="fn classify(score: i32) -> i32 {\n    if score >= 90 { 1 }\n    else if score >= 60 { 2 }\n    else { 3 }\n}\n\nfn main() {\n    for s in [95, 70, 40] {\n        println!(&quot;{} -> {}&quot;, s, classify(s));\n    }\n}" explain="if 的每个分支都是表达式，类型必须一致（这里都是 i32）。" />

## 小结

- `fn 名字(参数: 类型) -> 返回类型 { ... }`。
- **最后一行表达式不加分号即为返回值**；加了分号就返回 `()`。
- `if`、代码块、函数调用都是表达式，可以直接赋值。
- 多返回值用元组 + 解构；提前退出用 `return`。

<CheckList id="functions-check" title="学完本节，你应该能…" :items='["写出带参数和返回值类型的函数签名", "解释为什么加了分号就返回不了值", "用 if 表达式给变量赋值", "用元组返回多个值", "看到 expected i32, found () 知道去哪找问题"]' />

[下一讲：控制流 if / loop / while / for →](/basics/control-flow.md)
