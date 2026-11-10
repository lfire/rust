---
title: 第 16 讲 · 所有权三法则与 Move
description: 三条规则从哪来、赋值/传参/返回时所有权怎么转移、以及怎么读 E0382 报错。
---

<StageHeader stage="L3 · 第 16 讲" level="★★★☆☆" time="25 分钟" goal="能逐行预判一段代码里值的所有权归谁" prereq="L2 所有权初体验" />

# 第 16 讲 · 所有权三法则与 Move

这一讲只做一件事：把「谁拥有这个值」讲透。Copy、Clone、drop 留到 [下一讲](/core/copy-drop.md) 专门展开。

## 一、三条规则，以及它们从哪来

1. **Rust 中的每个值都有一个所有者**（owner）。
2. **同一时刻，值只能有一个所有者。**
3. **当所有者离开作用域，值会被自动释放（`drop`）。**

这三句不是设计者拍脑袋定的，而是从 L1 那个问题一步步推出来的：

| 前提 | 推出 |
| --- | --- |
| 没有 GC，必须有人负责释放 | 规则 1：得有明确的所有者 |
| 不能对同一块内存释放两次 | 规则 2：所有者必须唯一 |
| 不想手写 `free` | 规则 3：把释放时机绑在作用域上 |

<Callout type="idea" title="和别的语言对照" text="C/C++ 把规则 2、3 交给人（忘了就泄漏，早了就悬空）；Java / Go / Python 交给 GC（安全，但有运行时与停顿）；Rust 交给**编译期**——你写的时候被拦下来，跑起来既不用 GC 也不用手动释放。" />

<OwnershipLab scene="move" />

点开实验台逐句执行：注意 `let s2 = s1` 之后，**堆上的 `"hello"` 并没有搬家**，只是栈上那三个机器字（指针 / 长度 / 容量）换了主人，`s1` 随即作废。

## 二、移动发生在三个地方

**1. 赋值**

```rust
let s1 = String::from("hello");
let s2 = s1;          // 所有权移交，s1 失效
```

**2. 函数传参**

```rust
fn consume(s: String) { println!("{}", s); }

fn main() {
    let s = String::from("hello");
    consume(s);
    // println!("{}", s);   // ❌ borrow of moved value: `s`
}
```

**3. 函数返回（把所有权交还调用方）**

```rust
fn make() -> String {
    let s = String::from("hello");
    s                      // 移动出去，不在这里被释放
}

fn main() {
    let s = make();        // main 成为新所有者
    println!("{}", s);
}
```

<ConceptDiagram type="ownership" title="移动只搬栈上的三个机器字，堆数据原封不动" />

<Callout type="tip" title="一个很实用的心智模型" text="把函数签名看成一份合同：`s: String` 是「把东西送出去」，`s: &String` 是「借给别人看一眼」，`-> String` 是「对方还你一个新值」。看到签名就知道调用之后原变量还在不在。" />

还有几处容易忽略的移动：

- 把值 `push` 进 `Vec`、插入 `HashMap`，所有权归容器。
- 把变量放进闭包并加 `move`，所有权归闭包（L4 讲）。
- 对 `Option` 用 `unwrap()`、对 `Result` 用 `?` 取出内部值，也会移动。
- 把值放进 `Box::new(...)`，所有权交给堆上那个盒子。

## 三、怎么读 `E0382` 报错

```text
error[E0382]: borrow of moved value: `s`
 --> src/main.rs:6:20
  |
4 |     let s = String::from("hello");
  |         - move occurs because `s` has type `String`
5 |     consume(s);
  |             - value moved here
6 |     println!("{}", s);
  |                    ^ value borrowed here after move
```

按三行读就够：**谁被移动了 → 在哪一行移动的 → 之后还在哪用**。修法通常三选一：

| 修法 | 适用 | 代价 |
| --- | --- | --- |
| 改成借用 `&s` | 函数只需要读数据（最常见） | 零拷贝 |
| `.clone()` | 确实需要两份独立数据 | 一次堆分配 |
| 让函数 `-> String` 还回来 | 函数要拿走并加工后交回 | 多一次移动 |

<Callout type="warn" title="报错里出现 `String` 不是偶然" text="编译器会明确指出「因为 s 的类型是 String 所以发生移动」。如果换成 i32，同样的代码却能编译 —— 那不是编译器宽松，而是 i32 实现了 Copy。下一讲专门讲这个例外。" />

<Predict no="16-1" q="下面这段能编译吗？" :options='["能，输出 hello", "不能：s 已被移动", "能但输出空字符串", "能编译但运行时 panic"]' answer="0" output="hello" explain="返回 String 会把所有权交还调用方，s 在 main 里是新的所有者，可以正常使用。" />

```rust
fn make() -> String { String::from("hello") }
fn main() {
    let s = make();
    println!("{}", s);
}
```

<Quiz no="16-2" q="所有权「同一时刻只有一个所有者」，最主要是为了？" :options='["让代码更短", "避免同一块堆内存被释放两次", "提升运行速度", "支持多线程"]' answer="1" explain="GC 与手动管理分别用别的办法解决重复释放；Rust 用唯一所有者在编译期消除它。" />

<Quiz no="16-3" q="下面哪些操作会发生所有权移动？" :options='["把 String 传给签名为 s: String 的函数", "把 String push 进 Vec&lt;String&gt;", "对 i32 执行 let y = x;", "在闭包前加 move 并捕获 String"]' answer="0,1,3" multi="true" explain="i32 是 Copy，赋值按位复制不移动；其余三项都转移所有权。" />

<Exercise title="找出所有移动点" task="读下面代码，指出哪几行发生了所有权移动，并把 `consume` 改成借用版本让程序能编译。" hints='["count 是 i32，传参不会移动", "consume 的签名是 String，调用处会移动", "改成 &amp;String 后，调用处要加 &amp;"]' solution="fn consume(s: &String) { println!(&quot;{}&quot;, s); }\n\nfn main() {\n    let name = String::from(&quot;Rust&quot;);\n    let count = 5;\n    consume(&name);\n    println!(&quot;{} {}&quot;, name, count);\n}" explain="name 的移动点在修改前的 consume(name)；count 是 Copy，传参只是复制。" />

## 小结

- 三法则：唯一所有者、同时只有一个、离开作用域自动 drop。
- 赋值、传参、返回、进容器、`move` 闭包都会转移所有权。
- `E0382` 按「谁 / 在哪移动 / 之后在哪用」三步读，修法通常是借用、clone 或返回。
- 整数赋值不移动的原因，是 `Copy` —— 下一讲的主题。

<CheckList id="ownership-check" title="学完本节，你应该能…" :items='["背出所有权三法则并解释其来由", "指出一段代码里所有发生移动的行", "从函数签名判断调用后原变量是否可用", "读懂 E0382 并给出至少两种修法"]' />

[下一讲：Copy、Clone 与自动 drop →](/core/copy-drop.md) · [回到阶段三导览 →](/core/)
