---
title: 第 09 讲 · 变量、可变性与类型推导
description: let / mut / 类型推导 / 遮蔽、标量类型、元组与数组，为字符串与所有权打底。
---

<StageHeader stage="L2 · 第 09 讲" level="★★☆☆☆" time="16 分钟" goal="能声明变量、说清常见类型与遮蔽" prereq="第 08 讲 为什么值得学 Rust" />

# 第 09 讲 · 变量、可变性与类型推导

程序本质上就做两件事：**存数据**、**处理数据**。存数据从 `let` 开始。字符串虽然也是一种数据，但它在 Rust 里有一套独立的规则，留到 [第 10 讲](/basics/strings.md) 专门讲。

## `let` 与可变性

```rust
fn main() {
    let x = 5;
    println!("x = {}", x);

    let mut y = 5;
    y = 6;                    // 加了 mut 才允许改
    println!("y = {}", y);
}
```

<Compare title="同一个「变量」，不同语言的默认值" :panels='[{"label":"Python","code":"x = 5\nx = 6  # 随便改","note":"名字可以随时重新绑定"},{"label":"JavaScript","code":"let x = 5;\nx = 6;","note":"let 声明后仍可改"},{"label":"Rust","code":"let x = 5;\n// x = 6; // 编译错误\nlet mut y = 5;\ny = 6;","note":"默认不可变，mut 是显式许可"}]' note="默认不可变 = 读代码时不必担心这个值被别处偷偷改掉。" />

<Quiz no="09-1" q="想让一个绑定在后面可以被赋新值，应该怎么写？" :options='["let x = 5;", "let mut x = 5;", "var x = 5;", "mut x = 5;"]' answer="1" explain="mut 必须紧跟在 let 之后，写成 let mut。" />

## 类型推导与显式标注

Rust 是强类型语言，但**不要求你处处写类型** —— 编译器能从上下文推出来。

```rust
fn main() {
    let a = 42;              // 推导出 i32
    let b: u8 = 42;          // 显式指定 u8
    let c = 3.14;            // 默认 f64
    let d: f32 = 3.14;       // 显式 f32
    let flag = true;         // bool
    let ch = 'R';            // char，用单引号
    println!("{} {} {} {} {} {}", a, b, c, d, flag, ch);
}
```

<Term word="类型推导" text="编译器根据初始值和使用方式自动确定变量类型，无需手写；遇到歧义时才需要显式标注。" />

<Callout type="warn" title="整数不会自动转换" text="`let a: i32 = 5; let b: i64 = a;` 会编译失败。Rust 不做隐式数值转换，必须写 `a as i64` 或用 `.into()`。这是为了防止悄悄溢出或丢精度。" />

## 标量类型一览

| 类别 | 类型 | 例子 |
| --- | --- | --- |
| 有符号整数 | `i8` `i16` `i32` `i64` `i128` `isize` | `-10`、`42` |
| 无符号整数 | `u8` `u16` `u32` `u64` `u128` `usize` | `0`、`255` |
| 浮点 | `f32` `f64` | `3.14` |
| 布尔 | `bool` | `true` / `false` |
| 字符 | `char` | `'中'`（4 字节，Unicode 标量值） |

`usize` / `isize` 的宽度跟机器字长一致，通常用来做**索引和长度**，比如 `Vec::len()` 返回 `usize`。

## 复合类型：元组与数组

```rust
fn main() {
    let tup: (i32, f64, char) = (500, 6.4, 'R');
    let (x, y, z) = tup;                 // 解构
    println!("{} {} {}", x, y, z);
    println!("第二个元素：{}", tup.1);   // 也可以按序号取

    let arr = [1, 2, 3, 4, 5];          // 数组：长度固定、类型一致
    let first = arr[0];
    println!("first = {}", first);
}
```

数组长度是类型的一部分（`[i32; 5]` 和 `[i32; 3]` 是不同类型），且**编译期就固定**。需要动态长度时要用 `Vec<T>`（[第 26 讲](/core/collections.md) 会讲）。这里的「解构」和 [第 13 讲](/basics/match-basics.md) 的模式匹配是同一套思路。

## 遮蔽（shadowing）

Rust 允许用同一个名字重新 `let` 一次，后面的会把前面的「遮住」：

```rust
fn main() {
    let x = 5;
    let x = x + 1;          // 新的 x 遮住旧的 x
    let x = "现在是字符串";   // 甚至可以换类型！
    println!("{}", x);
}
```

这和 `mut` 不一样：`mut` 是**改同一个绑定**（类型不能变）；遮蔽是**创建一个新绑定**（可以换类型）。这个技巧在「解析输入 → 转成数字」时特别好用：

```rust
let input = "42";
let input: i32 = input.parse().unwrap();  // 同名，类型从 &str 变成 i32
```

<Predict no="09-2" q="下面这段输出什么？" :options='["6", "5", "编译错误：x 不可变", "编译错误：类型冲突"]' answer="0" output="6" explain="这里用的是遮蔽而非修改：let x = x + 1 创建了一个同名新绑定，合法且值为 6。" />

<FillBlank tpl="fn main() {\n    let ___ count = 0;\n    count += 1;\n    println!(&quot;{}&quot;, count);\n}" answers="mut" hint="想想「默认不可变」，要允许修改得加哪个关键字？" explain="let mut count = 0; 之后才能 count += 1。" />

<Exercise title="温度转换" task="声明一个 f64 变量 celsius = 25.0，算出华氏温度 f = c * 9.0 / 5.0 + 32.0，并打印出来。" hints='["公式是 c * 9.0 / 5.0 + 32.0", "浮点数要写 25.0 而不是 25"]' solution="fn main() {\n    let celsius: f64 = 25.0;\n    let fahrenheit = celsius * 9.0 / 5.0 + 32.0;\n    println!(&quot;{} 摄氏度 = {} 华氏度&quot;, celsius, fahrenheit);\n}" explain="输出 25 摄氏度 = 77 华氏度。" />

## 小结

- `let` 创建绑定，**默认不可变**；`mut` 才允许改。
- 类型由编译器推导，必要时用 `: 类型` 标注；整数之间不隐式转换。
- 标量：整数 / 浮点 / bool / char；复合：元组、数组。
- 遮蔽能同名重新绑定，甚至可以换类型。
- 字符串（`&str` 与 `String`）不在本讲范围，见[第 10 讲](/basics/strings.md)。

<Callout type="tip" title="下一讲预告" text="解析输入时那句 `let input: i32 = input.parse().unwrap();` 里的 `&str` 到底是什么？为什么 Rust 有两个字符串类型？[第 10 讲](/basics/strings.md) 会把「拥有 vs 借看」这条主线彻底讲清楚。" />

<CheckList id="variables-check" title="学完本节，你应该能…" :items='["写出 let 和 let mut 并说明区别", "说出 i32 / u8 / f64 / bool / char 的用途", "解释为什么整数赋值需要显式转换", "用遮蔽改写一段解析输入的代码", "知道数组与 Vec 的分工，以及字符串会单独展开"]' />

[上一讲：为什么值得学 Rust →](/foundation/why-rust.md) · [下一讲：字符串 &str 与 String →](/basics/strings.md)
