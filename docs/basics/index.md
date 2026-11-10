---
title: 阶段二 · Rust 语法入门
description: 变量、基本类型、函数、控制流、Cargo，最后先和所有权打个照面。
---

<StageHeader stage="L2 · 阶段导览" level="★★☆☆☆" time="约 105 分钟（7 讲）" goal="能独立写出几十行的小程序" prereq="L1" />

# 阶段二 · Rust 语法入门

这一阶段的目标是**让你写得出代码**。我们会按「变量 → 字符串 → 函数 → 控制流 → 模式匹配 → 工程组织 → 综合练习」七讲推进，每讲都配可运行示例和随堂练习。

## 本阶段地图

| 讲 | 核心问题 | 关键语法 |
| --- | --- | --- |
| [09 变量、可变性与类型推导](/basics/variables.md) | 数据怎么存、有哪几种 | `let` / `mut` / 标量 / 元组 / 数组 |
| [10 字符串：&str 与 String](/basics/strings.md) | 借看 vs 拥有，UTF-8 怎么算长度 | `&str` / `String` / `format!` |
| [11 函数、语句与表达式](/basics/functions.md) | 逻辑怎么复用 | `fn` / 参数 / 返回值 / 表达式 |
| [12 控制流](/basics/control-flow.md) | 程序怎么分叉和重复 | `if` / `loop` / `while` / `for` |
| [13 match 与模式匹配入门](/basics/match-basics.md) | 按值的形状分派 | `match` / 模式 / `if let` |
| [14 Cargo 与项目结构](/basics/cargo.md) | 代码怎么组织成项目 | `Cargo.toml` / 模块 / 依赖 / 测试 |
| [15 阶段综合：成绩统计](/basics/capstone.md) | 把前面串成一个程序 | 综合练习 |
| [所有权初体验（补充）](/basics/ownership-first-look.md) | 为什么有的代码编译不过 | 移动 / 克隆 / 作用域 |

<Callout type="tip" title="本阶段的节奏建议" text="每节代码都不长，务必亲手敲一遍并故意改错几次（比如去掉 mut、给表达式加上分号）。看编译器怎么回你，比看十遍讲解都管用。" />

## 你会造出什么

学完这一阶段，你就能写出一个像这样的「成绩统计」小程序 —— 用到变量、Vec、循环、函数、模式匹配：

```rust
fn grade(score: i32) -> &'static str {
    match score {
        90..=100 => "优秀",
        60..=89  => "及格",
        _        => "再接再厉",
    }
}

fn main() {
    let scores = vec![88, 95, 42, 73];
    let mut total = 0;
    for s in &scores {
        total += s;
        println!("{} 分：{}", s, grade(*s));
    }
    println!("平均分：{}", total / scores.len() as i32);
}
```

先别急着看懂每一行，学完本阶段再回头看这段，会有「原来都认识」的成就感。

<Quiz no="A-1" q="下面哪个说法符合本阶段的学习顺序？" :options='["先背所有权规则，再学变量", "先写得出小程序，再在 L3 深入所有权", "先做网络项目，语法用到再查", "先学异步，再回头学函数"]' answer="1" explain="教程刻意把所有权拆成「L2 先建立直觉 → L3 系统展开」两步，避免一开始就被规则淹没。" />

<CheckList id="basics-intro" title="开始之前" :items='["我已经能运行 Hello World", "我知道栈和堆大概是怎么回事", "我准备好每节亲手敲代码了"]' />

[开始第 09 讲：变量、可变性与类型推导 →](/basics/variables.md)
