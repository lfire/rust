---
title: 第 12 讲 · 控制流：if / loop / while / for
description: 条件分支、三种循环、范围与迭代器、break / continue 与循环标签；match 留给下一讲。
---

<StageHeader stage="L2 · 第 12 讲" level="★★☆☆☆" time="17 分钟" goal="能写分支、循环与循环控制" prereq="第 11 讲 函数、语句与表达式" />

# 第 12 讲 · 控制流：`if` / `loop` / `while` / `for`

程序默认从上往下执行。控制流就是让它「分叉」和「重复」。这一讲只讲按**条件**分叉；按**值的形状**分叉（`match`）是下一讲的主角。

## `if` / `else`：分叉

```rust
fn main() {
    let score = 78;
    if score >= 90 {
        println!("优秀");
    } else if score >= 60 {
        println!("及格");
    } else {
        println!("再接再厉");
    }
}
```

三个和 C 系语言不同的地方：

1. 条件**不需要括号**（写了也行，但习惯不写）。
2. 条件必须是 `bool`，`if 1` 这样的写法不合法。
3. `if` 是**表达式**，可以直接赋值，且两个分支类型必须一致。

```rust
let label = if score >= 60 { "pass" } else { "fail" };
```

<Quiz no="12-1" q="下面哪段代码在 Rust 里能编译？" :options='["用整数 1 直接当 if 的条件", "用值为 0 的整数变量当 if 的条件", "if true { 1 } else { 2 }; 两个分支都是整数", "let x = if true { 1 } else { 字符串 }; 两个分支类型不同"]' answer="2" explain="条件必须是 bool；if 作为表达式时两个分支必须同类型。选项 3 两边都是整数，合法。" />

## 三种循环

```rust
fn main() {
    // 1) loop：无限循环，用 break 退出，还能带出值
    let mut n = 0;
    let result = loop {
        n += 1;
        if n == 5 { break n * 10; }
    };
    println!("loop 结果：{}", result); // 50

    // 2) while：条件成立就继续
    let mut m = 3;
    while m > 0 {
        println!("倒计时 {}", m);
        m -= 1;
    }

    // 3) for：遍历集合，最常用、最安全
    for i in 1..=3 {          // 1..=3 是含端点的范围：1,2,3
        println!("第 {} 次", i);
    }
}
```

| 循环 | 什么时候用 | 怎么结束 | 特色 |
| --- | --- | --- | --- |
| `loop` | 次数事先不知道，或服务器主循环、重试逻辑 | `break`，可带出值 | 唯一能用 `break 值` 当表达式的循环 |
| `while` | 条件成立就继续，次数事先不知道 | 条件变假 / `break` | 最贴近 C 系写法 |
| `for` | 遍历一个明确的集合或范围 | 迭代器耗尽 / `break` | 不会产生下标越界，日常首选 |

<Callout type="tip" title="优先用 for" text="Rust 的 for 遍历的是迭代器，不会产生「下标越界」这类错误。while 更适合「次数事先不知道」的场景，loop 常用于服务器主循环和重试逻辑。" />

`1..3` 是左闭右开（1、2），`1..=3` 含右端（1、2、3）。遍历数组时注意 `for x in arr`（拿值）和 `for x in &arr`（拿引用）的区别，[第 26 讲](/core/collections.md) 会讲清楚为什么。

<Predict no="12-2" q="for n in 1..3 会把循环体执行几次？" :options='["1 次", "2 次", "3 次", "4 次"]' answer="1" output="2 次" explain="1..3 是左闭右开，包含 1、2；要含右端得写 1..=3。" />

## `break` / `continue` 与循环标签

`continue` 跳过本轮，`break` 结束循环。嵌套循环里想直接跳出**外层**，需要给循环起一个标签（以单引号开头）。

```rust
fn main() {
    'outer: for i in 1..=3 {
        for j in 1..=3 {
            if j == 2 { continue; }       // 跳过内层这一轮
            if i == 3 { break 'outer; }   // 直接跳出外层循环
            println!("i={} j={}", i, j);
        }
    }
    println!("已退出所有循环");
}
```

循环标签在解析嵌套数据、手写状态机时很省事；但出现得太频繁，往往说明该把这段逻辑抽成函数了。

<Callout type="idea" title="和第 11 讲的表达式接上了" text="`loop` + `break 值` 是 Rust 里一个很特别的写法：整条 loop 本身产生值。它和 `if` 表达式、`match` 表达式、代码块 `{}` 是同一条规则 —— 详见 [第 07 讲](/foundation/callables.md) 与 [第 11 讲](/basics/functions.md)。" />

<FillBlank tpl="fn main() {\n    let mut total = 0;\n    ___ n in 1..=5 {\n        total += n;\n    }\n    println!(&quot;{}&quot;, total);\n}" answers="for" hint="遍历一个范围应该用哪个循环关键字？" explain="for n in 1..=5 会遍历 1 到 5，累加得到 15。" />

<Exercise title="FizzBuzz（简化版）" task="用 for 遍历 1 到 15，能被 3 整除打印 fizz，能被 5 整除打印 buzz，同时整除打印 fizzbuzz，否则打印数字。" hints='["判断整除用 n % 3 == 0", "分支顺序：先判断同时整除，再分别判断", "范围写 1..=15"]' solution="fn main() {\n    for n in 1..=15 {\n        if n % 15 == 0 { println!(&quot;fizzbuzz&quot;); }\n        else if n % 3 == 0 { println!(&quot;fizz&quot;); }\n        else if n % 5 == 0 { println!(&quot;buzz&quot;); }\n        else { println!(&quot;{}&quot;, n); }\n    }\n}" explain="先判断最严格的条件（同时整除），否则会被 3 的分支抢先。" />

<Quiz no="12-3" q="关于 Rust 的三种循环，哪些说法正确？" :options='["loop 可以用 break 带出一个值", "for 遍历范围 1..=3 会得到 1、2、3", "while 的条件必须是 bool", "for 遍历集合时最容易写出下标越界"]' answer="0,1,2" multi="true" explain="for 基于迭代器，反而最不容易越界；越界风险主要来自手动用下标索引数组。" />

## 小结

- `if` 条件必须是 `bool`，且 `if` 本身是表达式。
- `loop` / `while` / `for` 分别对应「无限 + break」「条件循环」「遍历」，日常首选 `for`。
- `1..3` 左闭右开，`1..=3` 含右端；`break 'label` 能跳出指定外层循环。
- `break` / `continue` 控制单轮与整体退出，`loop` 还能用 `break 值` 产生结果。

<Callout type="tip" title="下一讲预告" text="`if` 靠判断条件分叉，遇到「好几种形状要分别处理」就会写一长串 else if。Rust 给了更锋利的工具：`match` 会强制穷举，还能把值直接拆出来 —— 见 [第 13 讲](/basics/match-basics.md)。" />

<CheckList id="control-check" title="学完本节，你应该能…" :items='["写出 if / else if / else 并用作表达式", "区分 1..3 和 1..=3", "用 loop + break 带出值", "说出三种循环各自适合的场景", "用 break 与 continue 控制循环，必要时使用循环标签"]' />

[上一讲：函数、语句与表达式 →](/basics/functions.md) · [下一讲：match 与模式匹配入门 →](/basics/match-basics.md)
