---
title: 零基础常见问题
description: 收集学习 Rust 最常卡住的问题：借用报错、生命周期、String、编译慢、unwap 等。
---

<StageHeader stage="附录 · 练习与速查" level="★★☆☆☆" time="随时查阅" goal="卡住时能自己找到出路" prereq="无" />

# 零基础常见问题

这份清单整理自学习 Rust 时最高频的困惑（原始教材里也有一篇「愚昧之巅」专门讲这个）。按症状查，比按概念查更快。

## 所有权与借用

### Q：为什么 `let b = a;` 之后 `a` 就用不了？

因为 `a` 若是 `String` / `Vec` 这类带堆资源的类型，赋值会**移动所有权**，避免同一块内存被释放两次。三种修法见下表。

| 我想要 | 写法 |
| --- | --- |
| 只让函数看一眼 | 参数改 `&T`，调用处加 `&` |
| 让函数修改 | 参数改 `&mut T`，变量 `let mut` |
| 确实需要两份独立数据 | `a.clone()` |
| 函数加工完再还给我 | 让函数 `-> T` 返回 |

详见 [所有权三法则与 Move](/core/ownership.md)、[Copy 与 Clone](/core/copy-drop.md) 与 [借用与引用 &T](/core/borrowing.md)。

### Q：`E0502: cannot borrow as mutable because it is also borrowed as immutable`

只读借用还活着的时候不能开可变借用。**最常见的修法是调整顺序**：让只读引用最后一次使用发生在可变借用之前（NLL 会自动在此结束借用）。详见 [可变借用与借用规则](/core/mutable-borrow.md)。

<CodeTabs title="冲突与修法" :tabs='[{"label":"冲突","code":"let r1 = &s;\nlet r2 = &mut s;  // E0502\nprintln!(\"{} {}\", r1, r2);","note":"r1 后面还要用，借用不能结束"},{"label":"修好","code":"let r1 = &s;\nprintln!(\"{}\", r1);   // 最后一次使用\nlet r2 = &mut s;      // 现在合法","note":"借用范围到此为止"}]' />

### Q：为什么不能返回局部变量的引用？

函数返回时局部变量就销毁了，返回它的引用会造成悬空指针（`E0515`）。改成**返回拥有所有权的值**：`fn make() -> String { String::from("hi") }`。

### Q：生命周期标注 `'a` 会延长变量的寿命吗？

不会。它只是向编译器**描述**参数和返回值之间的约束关系，所有检查都在编译期完成，运行时零开销。详见 [生命周期直觉](/core/lifetime.md) 与 [生命周期标注与省略规则](/core/lifetime-annotations.md)。

## 字符串

### Q：`&str` 和 `String` 到底用哪个？

| 场景 | 用 |
| --- | --- |
| 函数只读一个字符串参数 | `&str`（最通用） |
| 需要拼接、修改、拥有数据 | `String` |
| struct 字段需要长期持有文本 | `String` |
| 字面量 | 天然是 `&str` |

`String::from("x")`、`"x".to_string()`、`"x".into()` 都能造出 `String`；`&s` 或 `s.as_str()` 能拿到 `&str`。

### Q：中文字符串切片为什么 panic？

`s[0..2]` 的索引是**字节**位置，UTF-8 里一个汉字占 3 字节，切在中间就会 panic。要按字符处理请用 `s.chars()`、`char_indices()`，或用 `s.get(a..b)` 拿 `Option`。详见 [切片 &str 与 &[T]](/core/slices.md)。

## 类型与编译

### Q：`expected i32, found u32` 怎么办？

Rust 不做隐式数值转换。用 `as` 显式转换（`x as i32`），或用 `i32::try_from(x)` 处理可能溢出的情况。索引长度用 `usize`，别硬转。

### Q：`expected i32, found ()` 是怎么回事？

多半是函数最后一行**多写了分号**，把返回值降级成了语句。去掉分号即可。详见 [函数、语句与表达式](/basics/functions.md)。

### Q：第一次 `cargo run` 特别慢，正常吗？

正常。首次会下载并编译整棵依赖树（尤其 reqwest / tokio 这类 crate）。之后增量编译很快。可以用 `cargo check` 做日常快速检查。

### Q：为什么 `unwrap()` 有人说不能用？

它在 `Err` / `None` 时直接 panic，程序会终止。学习阶段跑示例没问题，但处理用户输入、文件、网络时应该换成 `?` 或 `match`。详见 [错误处理](/core/error-handling.md)。

## 并发与异步

### Q：为什么 `thread::spawn` 总提示要加 `move`？

新线程可能比创建它的函数活得久，不能借用栈上的局部变量。`move` 把所有权交给闭包就安全了。详见 [数据竞争与 Send/Sync](/concurrency/send-sync.md) 与 [线程与 Send](/concurrency/threads.md)。

### Q：写了 `async fn` 但什么都没发生？

`Future` 是**惰性**的，必须 `.await` 或交给运行时（如 `tokio::spawn`）才会被轮询。单独写 `let f = fetch();` 不会执行任何逻辑。

### Q：`Rc` 为什么不能跨线程，`RefCell` 为什么不被推荐？

`Rc` 的引用计数不是原子操作，多线程会改坏，请换 `Arc`。`RefCell` 把借用检查推迟到运行时，违反规则会 panic；能靠调整结构通过编译期检查就别用它。详见 [智能指针](/core/smart-pointers.md)。

## 学习与工具

<Exercise title="自测：给报错找原因" task="下面五条报错，试着不看答案说出各自最可能的原因：E0382 / E0502 / E0597 / E0308 / E0277。" hints='["E0382 与「移动」有关", "E0502 与「只读 + 可变借用」有关", "E0277 通常是「缺少某个 trait 实现」，比如没 derive(Debug)"]' solution="E0382：使用了已被移动的值。\nE0502：不可变借用与可变借用同时存在。\nE0597：被借用的值活得不够久（生命周期）。\nE0308：类型不匹配（常见：末尾多分号，或 i32 / u32 混用）。\nE0277：类型没有实现需要的 trait（如 {:?} 需要 Debug）。" explain="能对着编号说出原因，就说明你已经会读 Rust 编译器的「辅导」了。" />

<Callout type="tip" title="调试三板斧" text="1. `{:?}` 打印中间值（记得 derive(Debug)）；2. `dbg!(&x)` 快速看值和位置；3. 读编译器报错的最后一行的 `help:` —— 它经常直接给出改法。" />

## 还有问题？

回到 [综合自测](/practice/) 定位薄弱阶段，或按左侧目录重看对应章节。Rust 的学习曲线是「前陡后平」：卡住最狠的地方，往往就是最后一道坎。

[查阅语法速查表 →](/practice/cheatsheet.md)
