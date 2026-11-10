---
title: 阶段三 · 核心机制
description: 15 讲系统拆解所有权、借用、生命周期、类型系统、错误处理、trait 与智能指针。
---

<StageHeader stage="L3 · 阶段导览" level="★★★★☆" time="约 3 小时（15 讲）" goal="能读懂并独立修复编译器的报错" prereq="L2 全部" />

# 阶段三 · 核心机制

这里是整套教程的分水岭。跨过去之后，Rust 会从「处处跟我作对」变成「帮我提前挡掉 bug」。

## 为什么这一阶段有 15 讲

Rust 的其他概念几乎都能从**一条主线**推出来：**一个值，谁拥有它，谁能借用它，它能活多久**。

```text
所有权 (ownership)  ──►  借用 (borrowing)  ──►  生命周期 (lifetime)
        │                       │                       │
        ▼                       ▼                       ▼
   移动 / Copy              & / &mut / 切片        引用不能比值活得久
        │                       │                       │
        └──────────────►  struct / enum / Option / Result / trait
                                │
                                ▼
                   集合容器 / 错误处理 / 并发安全
```

这 15 讲按这个依赖顺序排列，每节只加一个新概念，并立刻用练习固定下来。

## 本阶段目录

| 节 | 关键词 |
| --- | --- |
| [所有权三法则与 Move](/core/ownership.md) | 三法则、移动点、E0382 |
| [Copy、Clone 与自动 drop](/core/copy-drop.md) | Copy 边界、深拷贝、Drop 与释放顺序 |
| [借用与引用 &T](/core/borrowing.md) | 多个只读借用、解引用、悬空引用 |
| [可变借用 &mut 与借用规则](/core/mutable-borrow.md) | 独占、E0502、NLL、重借用 |
| [切片 &str 与 &[T]](/core/slices.md) | 胖指针、UTF-8 字节索引、Deref 强制转换、零拷贝解析 |
| [生命周期：引用不能比活得更久](/core/lifetime.md) | E0597、作用域 vs 生命周期 |
| [生命周期标注与省略规则](/core/lifetime-annotations.md) | `'a`、三条省略规则、`'static` |
| [struct、impl 与方法](/core/struct-enum.md) | 三种 struct、四种 self、可见性、关联函数 |
| [enum、Option 与 Result](/core/enums.md) | 变体带数据、和类型、niche 优化、穷举检查 |
| [模式匹配进阶](/core/patterns.md) | 解构、守卫、`@` 绑定、`let else`、穷举检查 |
| [集合容器 Vec / HashMap](/core/collections.md) | 容量与扩容、entry API、容器选型 |
| [错误处理](/core/error-handling.md) | `panic!` / `Result` / `?` / 错误类型设计 |
| [Trait：定义与实现](/core/traits.md) | 默认方法、关联类型、孤儿规则、派生 |
| [泛型与 trait bound](/core/generics.md) | 单态化、`impl Trait` / `dyn Trait`、对象安全 |
| [智能指针](/core/smart-pointers.md) | `Box` / `Rc` / `RefCell` / `Cow` |
| [闭包与迭代器](/core/closures-iterators.md) | `FnOnce` / `FnMut` / `Fn`、适配器链 |

本阶段共 15 讲：第 30 讲由上下两篇组成，其余 14 讲各占一页，全部已独立成页。完整讲次索引见 [66 讲完整目录](/guide/curriculum.md)。

<Callout type="warn" title="这一阶段请放慢速度" text="常见症状是：看讲解都懂，一写代码就被编译器拦。这是正常的。请务必做每节的预测题和填空题，它们专门挑最典型的误区。" />

<OwnershipLab scene="move" />

<Quiz no="A-1" q="Rust 里「引用不能比它指向的值活得更久」，这条约束属于哪个概念？" :options='["所有权", "借用", "生命周期", "泛型"]' answer="2" explain="生命周期就是编译器用来证明「引用有效」的一套标注与检查机制。" />

<CheckList id="core-intro" title="开始之前" :items='["我已在 L2 用过 let、函数、match", "我大概知道 String 的赋值会发生移动", "我愿意接受先被编译器拦几次"]' />

[开始第 16 讲：所有权与 Move →](/core/ownership.md)
