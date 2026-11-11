---
title: 第 06 讲 · 指针、引用与地址
description: 从内存地址讲到 Rust 的引用：& 取地址、* 解引用、{:p} 打印，以及为什么引用不会悬空。
---

<StageHeader stage="L1 · 第 06 讲" level="★★☆☆☆" time="20 分钟" goal="能区分地址、指针、引用与解引用，知道引用为什么不悬空" prereq="第 05 讲 栈与堆" />

# 第 06 讲 · 指针、引用与地址

[第 04 讲](/foundation/concepts.md) 说清了「值是什么」，[第 05 讲](/foundation/memory.md) 说清了「值住在哪」。这一讲补上最后一块：**怎么找到它，以及谁能看它**。

<Callout type="idea" title="先记住一句话" text="地址是内存字节的编号，指针是记着这个编号的值；引用是被编译器加了约束的指针 —— 保证有效、不悬空，且不抢走所有权。Rust 的所有权体系，正是从「谁能借看」这一步长出来的。" />

## 一、地址：内存的门牌号

内存可以想象成一排编了号的格子，每个字节一个号，习惯写成十六进制（如 `0x7ffd...`）。**地址**就是这个编号本身。

```text
地址          内容
0x7ffd1000    2a          ← 一个字节，值是 42
0x7ffd1001    00
0x7ffd1002    ...
```

日常写 Rust 几乎不需要关心具体数值，但要知道：**变量在栈上占一小块连续地址，`String` / `Vec` 的真正数据则住在堆上另一串地址里**（[第 05 讲](/foundation/memory.md) 有图解）。用 `{:p}` 可以把地址打印出来看一眼：

```rust
fn main() {
    let x = 42;
    let r = &x;
    println!("值 {} · 地址 {:p}", x, r);
}
```

## 二、指针：存着地址的值

**指针**就是「一个记录地址的数字」，它本身也是个值，可以被复制、被传递、被存起来。跟着地址找回去的动作叫**解引用**。

Rust 里有两种指针形态：

| 形态 | 写法 | 谁负责安全 |
| --- | --- | --- |
| 引用（安全指针） | `&T` / `&mut T` | 编译器保证有效、不悬空、遵守借用规则 |
| 原始指针 | `*const T` / `*mut T` | 写代码的人；解引用必须放在 `unsafe` 块里（[第 53 讲](/projects/ffi.md)） |

```rust
let x = 42;
let p: *const i32 = &x;   // 原始指针，可以随便造
// println!("{}", unsafe { *p });  // 解引用必须 unsafe
```

初学阶段**只用引用**就够了。原始指针主要出现在 FFI、自引用结构和少数性能敏感场景，不必提前担心。

## 三、引用：受约束的指针

引用是 Rust 对指针加了一组编译期约束后的产物：

1. 一定指向一个**有效**的值（不会是空、不会是野指针）；
2. 一定**不会比它指向的值活得更久**（不悬空）；
3. 同一时刻，要么任意多个只读借用 `&T`，要么恰好一个可写借用 `&mut T`；
4. 借用**不转移所有权**，原值仍然可用。

```rust
fn main() {
    let s = String::from("rust");
    let r = &s;              // r 只是「借看」，不拥有 s
    println!("{} {}", s, r); // s 依然属于原来的所有者
}
```

<ConceptDiagram type="borrow" title="引用只「借看」数据，不抢走所有权" />

<Term word="悬空引用" text="指向已被销毁对象的引用。C/C++ 里是常见 bug；Rust 在编译期直接拒绝生成这种引用。" />

## 四、`&` 与 `*`：取地址和解引用

把变量、地址、引用与解引用放在一张图里，四者的关系就清楚了。

<ConceptDiagram type="pointer-deref" title="取地址、借用与解引用" />

| 写法 | 名字 | 作用 |
| --- | --- | --- |
| `&x` | 取地址 / 借用 | 得到一个指向 `x` 的引用 |
| `&mut x` | 可变借用 | 得到可写引用，同一时刻只能有一个 |
| `*r` | 解引用 | 顺着引用取回它指向的值 |
| `{:p}` | 指针格式化 | 打印地址，调试时看布局用 |
| `r.len()` | 自动解引用 | 方法调用会按需自动 `*` / `&`，不必手写 |

```rust
fn main() {
    let x = 42;
    let r = &x;                  // & 取地址，得到引用
    println!("值 {}", *r);        // * 解引用，顺着地址取回那个值
    println!("地址 {:p}", r);     // {:p} 打印指针地址
    println!("原值 {}", x);       // 借用不抢走所有权，x 依然可用
}
```

<Compare title="同一件事，C 与 Rust 的差别" :panels='[{"label":"C","code":"int *p = malloc(sizeof(int));\nfree(p);\nprintf(\"%d\", *p); // 悬空，未定义行为","note":"释放后还能解引用，靠人记住别用"},{"label":"Rust","code":"let r = &String::from(\"hi\"); // 临时值\n// 编译错误：temporary value dropped while borrowed","note":"编译器在编译期就拦下悬空引用"}]' note="Rust 把「别用已释放的内存」从约定变成了编译期检查。" />

## 五、为什么引用不会悬空

关键在于**生命周期**：编译器给每个引用标出它能合法使用的范围，并确保这个范围不超过被引用值的存活范围。

```rust
fn main() {
    let r;
    {
        let x = 5;
        r = &x;      // x 只活到这个花括号
    }
    // println!("{}", r); // 编译错误：x does not live long enough
}
```

这段在 C 里能编过、运行时随机出错；Rust 直接不给编译。规则本身不复杂，但它撑起了后面整章：[第 18 讲](/core/borrowing.md) 讲借用规则、[第 19 讲](/core/mutable-borrow.md) 讲可变借用、[第 21 讲](/core/lifetime.md) 建立生命周期直觉、[第 22 讲](/core/lifetime-annotations.md) 讲标注与省略规则。

<Predict no="06-1" q="下面这段输出什么？" :options='["5", "一个地址", "编译错误：x does not live long enough", "0"]' answer="2" output="error[E0597]: `x` does not live long enough" explain="x 在内层块结束时销毁，r 却想活到外面；编译器拒绝生成悬空引用。" />

<Quiz no="06-2" q="关于地址、指针与引用，哪个说法正确？" :options='["&x 会复制 x 的值", "*r 是顺着引用取回它指向的值", "Rust 的引用可以随时指向已销毁的对象", "{:p} 用来打印值的十进制大小"]' answer="1" explain="& 取地址得到引用，* 解引用取回值；{:p} 打印地址；引用绝不悬空。" />

<Quiz no="06-3" q="关于引用与所有权，哪些说法正确？" :options='["借用不转移所有权，原值仍可使用", "引用保证一定指向有效的值", "同一时刻可以有很多个只读借用", "解引用原始指针不需要 unsafe"]' answer="0,1,2" multi="true" explain="原始指针 *const T / *mut T 的解引用必须放在 unsafe 块里。" />

<Quiz no="06-4" q="`{:p}` 在 println! 里的作用是？" :options='["按十进制打印整数", "按十六进制打印指针地址", "打印值的类型名", "格式化百分比"]' answer="1" explain="{:p} 是 Pointer 格式化，用来观察引用指向哪里。" />

<FillBlank tpl="fn main() {\n    let n = 7;\n    let r = ___n;\n    println!(&quot;{} {}&quot;, *r, n);\n}" answers="&" hint="取地址 / 创建只读借用，用一个符号。" explain="&n 得到 &i32；*r 解引用取回 7，n 本身仍然可用，输出 7 7。" />

<Exercise title="打印一个值的地址和它本身" task="声明 let n: i32 = 42; 与 let r = &n;，分别打印 r 解引用后的值、r 的地址，以及 n 本身的值，验证「借用不影响原值」。" hints='["解引用写 *r", "打印地址用 {:p}", "println! 的三个值可以一次输出"]' solution="fn main() {\n    let n: i32 = 42;\n    let r = &amp;n;\n    println!(&quot;解引用 {} · 地址 {:p} · 原值 {}&quot;, *r, r, n);\n}" explain="*r 顺着地址取回 42；{:p} 打印地址；n 仍然可用，说明 & 只是借用。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `borrow of moved value` | 值的所有权已被移走，先借用再移动，或改传引用 |
| `x does not live long enough` | 引用想活过被引用值；把值的作用域扩大或缩小引用范围 |
| 以为 `&x` 复制了一份数据 | 它只是借用；真要独立副本用 `.clone()` |
| `*r` 报 `expected i32, found &i32` | 忘了写 `*`；或该用自动解引用的方法调用 |
| 想同时改又想读 | 同一时刻只能有一个 `&mut`，见第 19 讲 |

## 小结

- **地址**是内存字节的编号，**指针**是存地址的值，**引用**是受编译期约束的指针。
- `&` 取地址得到引用，`*` 解引用取回值，`{:p}` 打印地址，方法调用会自动解引用。
- 引用保证有效、不悬空、**不抢走所有权**；原始指针的解引用必须 `unsafe`。
- 「谁能借看、能借多久」正是 L3 所有权体系的入口。

<CheckList id="pointers-check" title="学完本讲，你应该能…" :items='["区分地址、指针、引用与解引用", "写出 &x、*r 和 {:p} 并解释各自作用", "说清引用为什么不悬空、为什么不抢所有权", "知道原始指针与引用的分工", "看到 does not live long enough 知道去哪找原因"]' />

[上一讲：第 05 讲 栈与堆 →](/foundation/memory.md) · [下一讲：第 07 讲 函数、方法、闭包与表达式 →](/foundation/callables.md)
