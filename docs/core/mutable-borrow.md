---
title: 第 19 讲 · 可变借用 &mut 与借用规则
description: 独占写权限、E0502 冲突、NLL 与缩短借用范围，以及可变引用为什么不是 Copy。
---

<StageHeader stage="L3 · 第 19 讲" level="★★★★☆" time="28 分钟" goal="能判断一处 &mut 是否合法并修好借用冲突" prereq="第 18 讲 借用与引用" />

# 第 19 讲 · 可变借用 `&mut` 与借用规则

[上一讲](/core/borrowing.md) 的 `&T` 只能看不能改。要修改数据又不抢走所有权，就用**可变借用 `&mut T`**。它是 Rust 借用规则里最严、也最容易报错的部分。

## 一、三处都要写清楚

```rust
fn main() {
    let mut s = String::from("hello");   // 1. 变量本身可变
    s.push_str(", world");               //    通过所有者直接改
    append(&mut s);                      // 2. 借出可写权限
    println!("{}", s);
}

fn append(s: &mut String) {              // 3. 签名也是 &mut
    s.push('!');
}
```

`let mut`、`&mut s`、`&mut String` 缺一不可。这是刻意的：**任何可能修改数据的地方，代码里都看得见**，读代码时不用猜谁会偷偷改状态。

<Callout type="idea" title="和只读借用的对比" text="`&T` 是「大家可以一起看」，`&mut T` 是「现在只有我能碰」。后者换来修改权，代价是独占 —— 借用期间，连同所有者在内，谁都不能再访问这份数据。" />

## 二、规则：独占，且不能与只读共存

> 同一时刻，要么任意多个 `&T`，要么**恰好一个** `&mut T`。

```rust
fn main() {
    let mut s = String::from("hello");
    let r1 = &s;
    let r2 = &mut s;    // ❌ E0502
    println!("{} {}", r1, r2);
}
```

<OwnershipLab scene="mut" />

```text
error[E0502]: cannot borrow `s` as mutable
             because it is also borrowed as immutable
```

<ConceptDiagram type="borrow" title="多个 &T 可以共存；&mut T 必须独占" />

### 为什么这么严

「一边读一边写」在别的语言里是两类经典 bug：

| 场景 | 后果 |
| --- | --- |
| 遍历 Vec 时 push 触发扩容 | 迭代器持有的指针指向已释放的旧内存 |
| 两个线程同时读写同一块数据 | 数据竞争，结果不可预测 |
| 只读引用指向的值被改小 | 引用还以为长度没变，越界读 |

Rust 把这些**运行时未定义行为**变成了**编译期错误**。代价是有时需要调整代码结构，收益是这类 bug 根本进不了生产。

## 三、NLL：借用范围到「最后一次使用」为止

现代 Rust 用**非词法生命周期（NLL）**：借用在最后一次被使用处结束，而不是等花括号。所以下面这段代码是合法的：

```rust
fn main() {
    let mut s = String::from("hello");
    let r1 = &s;
    println!("{}", r1);     // r1 最后一次使用，只读借用到此结束
    let r2 = &mut s;        // ✅ 之后就安全了
    r2.push('!');
    println!("{}", r2);
}
```

<Predict no="19-1" q="上面这段能编译吗？输出什么？" :options='["能，输出 hello 和 hello!", "不能：s 同时被不可变和可变借用", "能，但 r1 的值变成空", "能编译但运行时崩溃"]' answer="0" output="hello\nhello!" explain="r1 在第一个 println! 之后不再使用，NLL 让借用提前结束，随后的 &mut s 合法。" />

**修 E0502 的四种常用手法**：

| 手法 | 做法 |
| --- | --- |
| 调整顺序 | 让只读引用最后一次使用发生在 `&mut` 之前（最常用） |
| 缩小作用域 | 把只读借用包进一个内层 `{ }` |
| 提前取值 | 需要的是数据而非引用：`let n = r1.len();` 之后借用结束 |
| 克隆一份 | 确实需要两份数据时才用，别当默认解 |

<Compare title="冲突与修法" :panels='[{"label":"冲突","code":"let r1 = &s;\nlet r2 = &mut s;  // E0502\nprintln!(\"{} {}\", r1, r2);","note":"r1 后面还要用，借用不能结束"},{"label":"修好","code":"let r1 = &s;\nprintln!(\"{}\", r1);\nlet r2 = &mut s;  // OK","note":"只读借用提前结束"}]' note="编译器报错里的 note 会直接标出「immutable borrow later used here」，顺着它找就行。" />

## 四、可变引用不是 Copy

```rust
let mut s = String::from("hi");
let r = &mut s;
// let r2 = r;      // 移动，r 之后失效
let r2 = &mut *r;   // ✅ 显式「重借用」，r 暂时让出权限
r2.push('!');
println!("{}", r);  // r2 结束后 r 恢复可用
```

`&mut T` 没有实现 `Copy`（否则随便一赋值就出现两个「独占」写者）。它会被**移动**；想再借一次要用重借用 `&mut *r`，或者把 `&mut` 传给函数后靠返回交回。

<Callout type="warn" title="函数参数里的 &mut 也一样" text="`fn f(x: &mut String)` 调用时传 `r`（一个 &mut 引用）会**移动** r，之后 r 不能用。写 `f(&mut *r)` 是重借用，f 返回后 r 还能用。这个细节在写链表 / 树结构时天天遇到。" />

## 五、安全地拿到多个可变借用

规则说「恰好一个 `&mut`」，但有时确实要同时改一个集合的两半。标准库提供了拆分 API：

```rust
fn main() {
    let mut v = vec![1, 2, 3, 4, 5, 6];
    let (left, right) = v.split_at_mut(3);
    left[0] = 10;
    right[0] = 40;
    println!("{:?}", v);    // [10, 2, 3, 40, 5, 6]
}
```

`split_at_mut` 内部用 `unsafe` 证明两段不重叠，但对调用方暴露的是**安全 API** —— 这正是 Rust 封装不安全代码的典型方式（[第 53 讲 FFI](/projects/ffi.md) 会再见到）。自己写容器时，也可以用 `iter_mut()` / 模式匹配拿到多个互不重叠的可变借用：

```rust
let mut pair = (String::from("a"), String::from("b"));
let (x, y) = &mut pair;      // 两个字段各自的可变借用，互不冲突
x.push('1');
y.push('2');
```

<Quiz no="19-2" q="同一时刻，下面哪种组合合法？" :options='["一个 &mut T 与一个 &T 共存", "两个 &mut T 指向同一数据", "三个 &T 共存", "一个 &mut T，且之前所有 &T 已不再使用"]' answer="2,3" multi="true" explain="只读借用可任意多个；可变借用必须独占，但可以等之前的只读借用结束后再创建。" />

<Quiz no="19-3" q="函数想修改调用方传进来的 String，签名应该写？" :options='["fn f(s: String)", "fn f(s: &String)", "fn f(s: &mut String)", "fn f(s: str)"]' answer="2" explain="&mut String 借出可写权限；调用处写 &mut s，变量本身需要 let mut。" />

<Quiz no="19-4" q="关于 `&mut T`，哪个说法正确？" :options='["它是 Copy，赋值会复制指针", "它不是 Copy，赋值会移动；重借用要写 &mut *r", "它能在任意多个线程间共享", "它不需要变量声明为 mut"]' answer="1" explain="独占语义决定了 &mut T 不能被悄悄复制；这也是它不能实现 Copy 的根本原因。" />

<FillBlank tpl="fn append(s: ___ String) {\n    s.push('!');\n}\nfn main() {\n    let mut text = String::from(&quot;hi&quot;);\n    append(&mut text);\n}" answers="&mut" hint="调用处是 &mut text，函数签名要写什么类型？" explain="可变引用类型写作 &mut String。" />

<Exercise title="修好三处冲突" task="下面代码同时有三处借用问题：只读引用后面还用、直接把 &mut 传进函数导致移动、以及持有切片时 push。逐一指出并给出修好的完整代码。" hints='["第一处：把 println!(r1) 提前到 &mut 之前", "第二处：函数参数用重借用 &mut *r，或传完后重新借", "第三处：先打印切片，再 push"]' solution="fn main() {\n    let mut s = String::from(&quot;hello rust&quot;);\n    let r1 = &amp;s[0..5];\n    println!(&quot;{}&quot;, r1);          // 切片借用到此结束\n    s.push('!');                 // 现在可以改\n\n    let r = &amp;mut s;\n    append(&amp;mut *r);            // 重借用，r 之后仍可用\n    append(r);                  // 或最后一次直接移动进去\n}\n\nfn append(x: &amp;mut String) { x.push('?'); }" explain="核心思路都是让借用在被需要的地方结束，而不是靠 clone 绕开规则。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| E0502 但觉得「明明没冲突」 | 看报错里的 `later used here`，把那次使用提前 |
| `use of moved value: r` | `&mut` 被移动了，改重借用 `&mut *r` |
| 持有切片时不能 push | 切片是只读借用，用完再改 |
| 想同时改 Vec 两半 | 用 `split_at_mut` / `iter_mut`，别用两个下标硬凑 |
| 以为加 `mut` 就能改 | 三处都要一致：变量、借用表达式、函数签名 |

## 小结

- `&mut T` 借出独占写权限，三处写法要一致。
- 任意多个 `&T` **或**唯一一个 `&mut T`，不能并存；引用必须有效。
- NLL 让借用止于最后一次使用，调整顺序常是最简单的修法。
- `&mut T` 不是 Copy；重借用写 `&mut *r`，多段写入用 `split_at_mut`。
- [第 20 讲](/core/slices.md) 深入切片的内存布局，第 21 讲把「引用必须有效」展开成生命周期。

<CheckList id="mut-borrow-check" title="学完本节，你应该能…" :items='["说出借用规则并解释其来由", "判断 &mut 与 & 是否冲突", "解释 NLL 为什么让某些代码能编译", "用调整顺序 / 缩小作用域 / 重借用修好 E0502", "知道 &mut T 不是 Copy 以及 split_at_mut 的用途"]' />

[上一讲：借用与引用 →](/core/borrowing.md) · [下一讲：切片 &str 与 &[T]（第 20 讲）→](/core/slices.md) · [第 21 讲 生命周期 →](/core/lifetime.md)
