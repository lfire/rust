---
title: 第 17 讲 · Copy、Clone 与自动 drop
description: 为什么整数赋值不移动、Copy 与 Clone 的界限、手动实现 Drop 与作用域释放顺序。
---

<StageHeader stage="L3 · 第 17 讲" level="★★★☆☆" time="25 分钟" goal="判断一个类型是移动、复制还是克隆，并说清释放时机" prereq="第 16 讲 所有权与 Move" />

# 第 17 讲 · Copy、Clone 与自动 drop

[上一讲](/core/ownership.md) 说「赋值会移动」，但下面这段代码却没事：

```rust
let x = 5;
let y = x;
println!("{} {}", x, y);   // ✅ 5 5
```

不是编译器双重标准，而是 `i32` 这类类型**没有堆资源可释放**，复制它既便宜又不可能造成 double free。Rust 给这类类型一个明确的例外：`Copy`。

## 一、哪些类型是 Copy

| 类别 | 例子 |
| --- | --- |
| 所有整数 / 浮点 | `i8`…`i128`、`u8`…`u128`、`isize`、`usize`、`f32`、`f64` |
| 标量 | `bool`、`char` |
| 裸指针 / 函数指针 | `*const T`、`fn()` |
| 复合（**全部字段都 Copy**） | `(i32, f64)`、`[i32; 4]` |
| 引用 | `&T`（注意：`&mut T` **不是** Copy） |
| `Option`/`Result` 等 | 内部类型都 Copy 时才 Copy |

**不是 Copy**：`String`、`Vec<T>`、`Box<T>`、`Rc<T>`、任何持有堆资源或需要自定义析构的类型。

<Callout type="warn" title="一条判断规则" text="问自己：这个类型离开作用域时，除了把栈上那几个字节丢掉，还需要做别的事吗？需要（释放堆内存、关文件、断连接）就不是 Copy。所以 **`Drop` 与 `Copy` 互斥**：实现了 `Drop` 的类型不能是 `Copy`，编译器会直接拒绝。" />

<OwnershipLab scene="copy" />

<Predict no="17-1" q="这段代码能编译吗？" :options='["能，输出 3 3", "不能：t 被移动了", "能，但输出 3 0", "能编译但运行时崩溃"]' answer="0" output="3 3" explain="元组 (i32, i32) 的两个字段都是 Copy，整个元组随之是 Copy，赋值按位复制。" />

```rust
fn main() {
    let t = (3, 4);
    let u = t;
    println!("{} {}", t.0, u.0);
}
```

<Predict no="17-2" q="换成带 String 的元组呢？" :options='["能，输出两份 hi", "不能：t 已被移动", "能，输出空字符串", "能编译但内存泄漏"]' answer="1" output="error[E0382]: borrow of moved value: `t`" explain="只要有一个字段不是 Copy，整个复合类型就不是 Copy；赋值会移动整个元组。" />

```rust
fn main() {
    let t = (String::from("hi"), 4);
    let u = t;
    println!("{}", t.0);
}
```

## 二、Copy / Clone / 移动，三者别混

| | 触发方式 | 堆数据 | 原变量 |
| --- | --- | --- | --- |
| 移动 | `let b = a;`（非 Copy） | 不复制，只搬栈上指针 | 失效 |
| Copy | `let b = a;`（Copy 类型） | 没有堆数据 | 仍可用 |
| Clone | `a.clone()` | **深拷贝一份** | 仍可用 |

```rust
let s1 = String::from("hello");
let s2 = s1.clone();       // 堆上也复制一份
println!("{} {}", s1, s2); // ✅ 两个都在
```

Rust 的哲学是：**昂贵的操作应该显眼**。字符串复制可能涉及内存分配，所以它不会被藏在一次普通的 `=` 里。

<Compare title="两种「多一份」" :panels='[{"label":"clone（复制数据）","code":"let a = String::from(\"hi\");\nlet b = a.clone();\n// 堆上有两份 hi","note":"内存与 CPU 都有成本"},{"label":"Rc::clone（只加计数）","code":"let a = Rc::new(String::from(\"hi\"));\nlet b = Rc::clone(&a);\n// 堆上仍只有一份","note":"只增加一个整数，见智能指针"}]' note="看到 .clone() 先确认克隆的到底是什么，别默认它一定很贵。" />

自己实现 `Clone`：

```rust
#[derive(Debug)]
struct Point { x: i32, y: i32 }

impl Clone for Point {
    fn clone(&self) -> Self {
        println!("执行了一次 clone");   // 能直观看到调用时机
        Self { x: self.x, y: self.y }
    }
}

fn main() {
    let p = Point { x: 1, y: 2 };
    let q = p.clone();
    println!("{:?} {:?}", p, q);
}
```

`#[derive(Clone)]` 本质就是自动生成上面这段（逐字段调用 `clone()`）。而 `Copy` 是标记 trait，没有方法可写，只有 `#[derive(Copy)]` 加上 `Clone`：

```rust
#[derive(Copy, Clone, Debug)]
struct Point { x: i32, y: i32 }   // Copy 必须先实现 Clone
```

## 三、作用域与自动 drop

```rust
fn main() {
    let a = String::from("A");
    {
        let b = String::from("B");
        println!("{} {}", a, b);
    }   // b 在此 drop
    println!("{}", a);
}   // a 在此 drop
```

<OwnershipLab scene="scope" />

编译器在每个作用域结束处自动插入 `drop` 调用。你不用写、也不会忘。释放顺序是**变量声明的逆序**（后创建的先销毁），结构体字段按声明顺序销毁。

<ConceptDiagram type="stack-heap" title="栈变量自动出栈，堆数据由 Drop 归还" />

### 手写 `Drop`

类型若需要在释放时做别的事（关文件、断连接、归还连接池），实现 `Drop` trait：

```rust
struct Connection { name: String }

impl Drop for Connection {
    fn drop(&mut self) {
        println!("关闭连接 {}", self.name);
    }
}

fn main() {
    let c = Connection { name: "db-1".into() };
    println!("使用连接");
    // c 离开作用域，drop 自动调用
}
```

### 提前释放：`std::mem::drop`

想在一块作用域中间就释放，用 `std::mem::drop(x)`（它只是个空函数，靠**移动进去再立即离开作用域**实现）：

```rust
let lock = acquire_lock();
// ... 临界区 ...
std::mem::drop(lock);      // 立刻释放，不必等花括号
// 后面可以做耗时 IO
```

<Callout type="warn" title="不要手动调用 `x.drop()`" text="Rust 不允许直接调用 `Drop::drop`，否则作用域结束时还会再调一次，造成 double free。要么用 `std::mem::drop(x)`，要么加一层内部作用域让它自然结束。" />

<Quiz no="17-3" q="一个 impl 了 Drop 的结构体，能同时 derive(Copy) 吗？" :options='["能，两者无关", "不能，Copy 与 Drop 互斥", "只有字段全为整数时能", "加了 unsafe 就能"]' answer="1" explain="Copy 意味着「丢掉字节即可、无需清理」，与自定义析构语义冲突，编译器会报 E0184。" />

<Quiz no="17-4" q="关于 Clone，哪些说法正确？" :options='["derive(Clone) 会逐字段调用 clone", "String::clone 会复制堆上的数据", "Rc::clone 也会复制堆上的数据", "实现 Copy 的类型必须同时实现 Clone"]' answer="0,1,3" multi="true" explain="Rc::clone 只增加引用计数，不复制被指向的数据 —— 这是它和深拷贝最大的区别。" />

<Quiz no="17-5" q="`std::mem::drop(x)` 为什么能提前释放？" :options='["它调用了 Drop::drop 方法", "它把 x 移动进一个空函数，函数返回时 x 立即离开作用域", "它把内存清零", "它通知 GC 回收"]' answer="1" explain="Rust 不允许直接调用 Drop::drop；mem::drop 借移动语义让值在函数结束时被销毁。" />

<Exercise title="给类型加上 Copy" task="定义 `struct Point { x: i32, y: i32 }`，先让它只能 clone，再加上 Copy 并验证「赋值后 p 仍可用」；然后给结构体加一个 String 字段，观察编译器给出什么错误，并说明原因。" hints='["derive(Copy, Clone) 两个都要写", "加 String 字段后 Copy 会失效，报错 E0204", "含堆资源的类型必须走移动或 clone"]' solution="#[derive(Copy, Clone, Debug)]\nstruct Point { x: i32, y: i32 }\n\nfn main() {\n    let p = Point { x: 1, y: 2 };\n    let q = p;\n    println!(&quot;{:?} {:?}&quot;, p, q);  // p 仍可用\n}\n\n// 加 label: String 后：\n// error[E0204]: the trait `Copy` may not be implemented for this type\n// 因为 String 不是 Copy（它需要释放堆内存）" explain="Copy 是「按位复制就安全」的承诺，只要有一个字段需要析构，这个承诺就不成立。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `use of moved value` 但明明是整数 | 检查是否包在含 String 的元组 / 结构体里 |
| `E0204: Copy may not be implemented` | 有字段不 Copy，去掉 derive(Copy)，改用 clone |
| `E0184: Copy not allowed on type with Drop` | Drop 与 Copy 互斥，二选一 |
| `clone()` 很多、性能差 | 看能否改成借用 `&T`，或用 `Rc`/`Arc` 共享 |
| 锁一直没释放 | `std::mem::drop` 或加内部作用域缩短临界区 |

## 小结

- `Copy` 是没有堆资源、按位复制就安全的类型；`&mut T` 不是 Copy。
- `Clone` 是显式深拷贝；`Rc::clone` 只加计数，别和深拷贝混为一谈。
- 离开作用域自动 `drop`，顺序为声明逆序；`Drop` trait 让类型自带清理逻辑。
- `std::mem::drop` 靠移动语义提前释放，不能手动调 `Drop::drop`。
- 下一讲开始，我们看「不转移所有权也能用值」的办法：借用。

<CheckList id="copy-drop-check" title="学完本节，你应该能…" :items='["判断一个类型是不是 Copy", "说清移动 / Copy / Clone 三者的区别", "解释为什么 Copy 与 Drop 互斥", "写出带 Drop 的类型并用 mem::drop 提前释放", "知道 Rc::clone 与深拷贝的区别"]' />

[上一讲：所有权三法则与 Move →](/core/ownership.md) · [下一讲：借用与引用 →](/core/borrowing.md)
