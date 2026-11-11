---
title: 第 21 讲 · 生命周期：引用不能比活得更久
description: 用一句话建立生命周期直觉，读懂 E0597，区分作用域与生命周期，理解 NLL。
---

<StageHeader stage="L3 · 第 21 讲" level="★★★☆☆" time="22 分钟" goal="能判断一个引用会不会悬空并读懂 E0597" prereq="第 19/20 讲 可变借用与切片" />

# 第 21 讲 · 生命周期：引用不能比活得更久

「生命周期」大概是 Rust 里名字最吓人、概念其实最简单的东西。它只保证一句话：

> **引用不能比它指向的值活得更久。**

标注语法 `'a`、三条省略规则留到 [第 22 讲](/core/lifetime-annotations.md)。本讲只建立直觉：**编译器在比较两个范围**。

## 一、先看一个错误

```rust
fn main() {
    let r;
    {
        let x = 5;
        r = &x;          // ❌ x 活得太短
    }                    // x 在这里销毁
    println!("{}", r);   // r 指向的地方已经没了
}
```

```text
error[E0597]: `x` does not live long enough
```

<ConceptDiagram type="lifetime" title="外层引用 r 的存活范围，超过了内层值 x" />

把 `r` 的使用挪进内层块，或者让 `r` 指向一个活得更久的值，就好了。编译器做的事，本质上是画两条时间线：

```text
x  :        ┌──────┐
r  :        │  └──────────┐
            ↑      ↑      ↑
          x 创建  x 销毁  r 最后使用   ← 越界，拒绝
```

<Callout type="idea" title="生命周期是编译期的概念" text="它不产生任何运行时代码，也不会延长或缩短任何变量的寿命。编译器只是给每个引用推导出一个「有效区间」，然后检查区间有没有越界。所有工作都在编译期完成，运行时零开销。" />

## 二、作用域 ≠ 生命周期

这是新手最容易混的一组概念：

| | 作用域（scope） | 生命周期（lifetime） |
| --- | --- | --- |
| 属于谁 | 变量 / 绑定 | **引用** |
| 由什么决定 | 花括号、代码结构 | 引用从创建到**最后一次使用** |
| 可见性 | 名字在哪里能被访问 | 引用在这段区间内有效 |
| 能否提前结束 | 不能（要等 `}`） | **能**（NLL） |

```rust
fn main() {
    let mut s = String::from("hello");
    let r = &s;                  // r 的作用域到函数末尾
    println!("{}", r);           // 但 r 的生命周期到这里就结束了
    s.push('!');                 // ✅ 由于 NLL，这里可以改
}
```

<Callout type="warn" title="NLL 让「生命周期」不等于花括号" text="Rust 2018 之后，借用的有效范围止于最后一次使用，不必等到 `}`。所以看到「引用还活着」的报错时，别只看花括号，要找报错里标出的 `borrow later used here`。[第 19 讲](/core/mutable-borrow.md) 已经用过这条规则修 E0502。" />

## 三、常见的悬空场景

### 1. 返回局部变量的引用

```rust
fn dangle() -> &String {
    let s = String::from("hi");
    &s                          // E0515
}
```

函数返回时 `s` 被释放，引用无处可指。改成返回拥有所有权的值。

### 2. 临时值没有绑定

```rust
// ❌ 临时 String 在语句结束就销毁
// let r = &String::from("hi");

// ✅ 先绑定，让值活得够久
let owner = String::from("hi");
let r = &owner;
println!("{}", r);
```

Rust 对「直接借一个临时值」有**临时值生命周期延长**规则：`let r = &String::from("hi");` 在这个特定写法里其实是合法的（临时值被延长到 `r` 的作用域）。但把它传给函数再返回引用就不行：

```rust
fn first(s: &String) -> &str { &s[0..1] }
// ❌ let r = first(&String::from("hi")); 临时值在语句结束就销毁
```

### 3. 集合扩容让旧引用失效

```rust
let mut v = vec![1, 2, 3];
let first = &v[0];
v.push(4);              // ❌ E0502，且逻辑上 first 确实可能悬空
println!("{}", first);
```

这里既有借用规则约束，也有生命周期直觉：扩容可能搬迁堆内存，`first` 指向的旧地址不再有效。

## 四、`'static`：活得和程序一样久

```rust
let s: &'static str = "我写在程序的只读数据段里";
```

字符串字面量是 `'static`，因为那片内存在程序整个运行期都存在。注意两点：

- `'static` 是「**足够久**」的承诺，不是「永远不能释放」；但它确实是很强的约束。
- 看到 `T: 'static` 的 bound（如 `thread::spawn`），意思是「这个类型里不能含有指向短命数据的引用」，而不是「这个值必须活到程序结束」。

<Callout type="tip" title="别急着写标注" text="绝大多数情况编译器能自己推导，你一行生命周期参数都不用写。真正需要手写标注的典型场景只有一个：**多个引用参数 + 返回引用，且编译器无法判断返回值来自谁**。第 22 讲专门处理它。" />

<Predict no="21-1" q="下面这段能编译吗？" :options='["能，输出 hello", "不能：result 引用的值已被销毁", "能，输出空字符串", "能编译但输出乱码"]' answer="1" output="error[E0597]: `inner` does not live long enough" explain="inner 在内层块结束时销毁，而 result 在外层还被使用；返回引用的有效区间取两个输入中较短者。" />

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

fn main() {
    let outer = String::from("hi");
    let result;
    {
        let inner = String::from("hello");
        result = longest(&outer, &inner);
    }
    println!("{}", result);
}
```

<Quiz no="21-2" q="生命周期检查在什么时候进行？" :options='["运行时，由 GC 协助", "编译期，运行时零开销", "程序启动时一次性", "每次解引用时"]' answer="1" explain="编译器静态推导区间并检查越界，不生成任何运行时检查代码。" />

<Quiz no="21-3" q="关于作用域与生命周期，哪些说法正确？" :options='["作用域属于变量，生命周期属于引用", "NLL 之后引用可以在花括号结束前就失效", "生命周期标注会延长变量寿命", "\x27static str 字面量活到程序结束"]' answer="0,1,3" multi="true" explain="标注只描述约束，不改变任何值的实际存活时间。" />

<Quiz no="21-4" q="`let r = &String::from(&quot;hi&quot;);` 在很多情况下能编译，是因为？" :options='["String 是 Copy", "临时值生命周期延长规则把临时值活到 r 的作用域", "编译器自动改成 String", "运行时才分配"]' answer="1" explain="这是 Rust 对直接借用临时值的特殊延长规则；但把临时值传进函数再返回引用仍然不行。" />

<Exercise title="修好三处悬空" task="下面三段代码分别有问题，逐一给出修法：1. 返回局部变量引用；2. 内层块里创建的 String 被外层引用；3. 持有 Vec 元素引用时 push。要求都不使用 clone。" hints='["1. 改成返回 String（交出所有权）", "2. 把使用挪进内层块，或把值提到外层创建", "3. 先使用引用，作用域结束后再 push"]' solution="// 1. \nfn make() -&gt; String { String::from(&quot;hi&quot;) }\n\n// 2. \nfn main() {\n    let owner = String::from(&quot;hello&quot;);\n    let r = &amp;owner;\n    println!(&quot;{}&quot;, r);\n}\n\n// 3. \nlet mut v = vec![1, 2, 3];\nlet n = v[0];        // 直接取值，借用立刻结束\nv.push(4);\nprintln!(&quot;{}&quot;, n);" explain="共同思路：让引用的使用落在被引用值的存活区间内，或者干脆不持有引用（取值 / 交出所有权）。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| E0597 `does not live long enough` | 引用用到值销毁之后；提前使用或把值提到外层 |
| E0515 返回局部变量引用 | 返回拥有所有权的值 |
| E0106 `missing lifetime specifier` | 编译器推不出返回值来自谁 → 第 22 讲 |
| 觉得「明明还在作用域里」 | NLL 看最后一次使用，不是花括号 |
| 误以为 `'static` 能随便加 | 它是很强的承诺，先看能否改成拥有所有权的类型 |

## 小结

- 生命周期的唯一目标：**保证引用不悬空**。
- 编译器比较两个区间：引用的有效范围 vs 被引用值的存活范围。
- 作用域属于变量、生命周期属于引用；NLL 让后者可以提前结束。
- 所有检查在编译期完成，运行时零开销。
- 绝大多数情况无需手写标注；需要时见下一讲。

<CheckList id="lifetime-check" title="学完本节，你应该能…" :items='["用一句话解释生命周期要解决什么问题", "读懂 E0597 并指出哪个值活得太短", "区分作用域与生命周期", "解释 NLL 为什么让某些代码能编译", "知道什么时候才需要手写标注"]' />

[上一讲：第 20 讲 切片与借用 →](/core/slices.md) · [下一讲：第 22 讲 生命周期标注与省略规则 →](/core/lifetime-annotations.md)
