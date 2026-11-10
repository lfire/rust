---
title: 第 30 讲（上）· 智能指针
description: Box、Rc、RefCell、Cow 的实现原理、循环引用与 Weak，以及按场景选型。
---

<StageHeader stage="L3 · 第 30 讲（上）" level="★★★★☆" time="25 分钟" goal="能按场景选出合适的智能指针并说清原理" prereq="第 29 讲 泛型与 trait bound" />

# 第 30 讲（上）· 智能指针

第 30 讲分上下两篇：上篇讲**智能指针**，下篇讲 [闭包与迭代器](/core/closures-iterators.md)。合起来是 L3 的阶段收束。

名字听起来很高深，其实就一句话：**智能指针是「带额外能力的所有权包装」**。它们本身是普通结构体，只是实现了 `Deref`（能像引用一样用）和 `Drop`（离开作用域时做清理）。

## 一、`Deref` 与 `Drop`：两个底层 trait

```rust
use std::ops::Deref;

struct MyBox<T>(T);

impl<T> Deref for MyBox<T> {
    type Target = T;
    fn deref(&self) -> &T { &self.0 }
}

fn main() {
    let x = MyBox(String::from("hi"));
    println!("{}", x.len());     // ✅ 自动解引用到 String::len
}
```

| trait | 作用 |
| --- | --- |
| `Deref` | 让 `*x`、方法调用、函数参数自动解引用（deref coercion） |
| `Drop` | 作用域结束时自动清理，编译器插入调用 |

`&String → &str`、`&Vec<T> → &[T]` 这些[第 20 讲](/core/slices.md) 见过的转换，背后就是 `Deref`。

## 二、一张选择表

| 类型 | 解决什么问题 | 所有权 | 检查时机 |
| --- | --- | --- | --- |
| `Box<T>` | 堆分配、递归类型、trait object | 单一 | 编译期 |
| `Rc<T>` | 单线程**多个所有者**共享 | 引用计数 | 编译期 |
| `RefCell<T>` | 只读引用下也能改（内部可变性） | 单一 | **运行时** |
| `Arc<T>` | 多线程版 Rc | 原子计数 | 编译期（第 33 讲） |
| `Cow<'a, B>` | 能不改就不复制 | 借用或拥有 | 编译期 |

## 三、`Box<T>`：最朴素的一个

```rust
fn main() {
    let b = Box::new(5);
    println!("{} {}", *b, b);     // 两种写法都行
}
```

三个经典用途：

```rust
// 1. 把大对象放堆上，避免栈上搬运
let big = Box::new([0u8; 1024 * 1024]);

// 2. 递归类型：编译器必须知道大小
enum List {
    Cons(i32, Box<List>),
    Nil,
}

// 3. trait object：运行时分发
let drawables: Vec<Box<dyn std::fmt::Debug>> = vec![Box::new(1), Box::new("a")];
```

进阶用法：`Box::leak(b)` 故意泄漏出一份 `&'static mut T`（框架初始化时偶尔用）；`Box<[T]>` 是固定长度的堆切片，比 `Vec<T>` 少一个 capacity 字段；`Pin<Box<T>>` 用于自引用结构（第 37 讲）。

## 四、`Rc<T>`：一个值多个所有者

```rust
use std::rc::Rc;

fn main() {
    let a = Rc::new(String::from("共享数据"));
    let b = Rc::clone(&a);        // 只增加计数，不复制字符串
    println!("{} / 计数 {}", a, Rc::strong_count(&a));
    drop(b);
    println!("计数 {}", Rc::strong_count(&a));
}
```

<ConceptDiagram type="ownership" title="Rc 用引用计数让多个变量共同拥有同一份堆数据" />

<Callout type="warn" title="Rc 不是线程安全的" text="计数是普通整数，多线程同时增减会出错。跨线程必须换 `Arc`（原子计数）。编译器会直接拦住把 `Rc` 送进线程的代码 —— 详见 [第 31 讲 Send/Sync](/concurrency/send-sync.md)。" />

### 循环引用与 `Weak`

两个 `Rc` 互相指向会让计数永远不归零，造成泄漏：

```rust
use std::rc::{Rc, Weak};
use std::cell::RefCell;

struct Node {
    parent: Option<Weak<RefCell<Node>>>,   // 弱引用，不增加计数
    children: Vec<Rc<RefCell<Node>>>,      // 强引用
}
```

原则：**父子关系里父→子用 `Rc`，子→父用 `Weak`**。`Weak::upgrade()` 返回 `Option<Rc<T>>`，原对象已释放时是 `None`。

## 五、`RefCell<T>`：把借用检查挪到运行时

```rust
use std::cell::RefCell;

fn main() {
    let data = RefCell::new(vec![1, 2, 3]);
    data.borrow_mut().push(4);                  // 运行时可变借用
    println!("{:?}", data.borrow());            // 运行时只读借用

    // 违反规则会 panic，而不是编译错误
    // let a = data.borrow_mut();
    // let b = data.borrow_mut();   // ❌ already mutably borrowed
}
```

| | `RefCell<T>` | `Cell<T>` |
| --- | --- | --- |
| 取值方式 | `borrow()` / `borrow_mut()` 返回守卫 | `get()` / `set()` |
| 能否拿引用 | 能 | 不能（只能整体拷贝进出） |
| 适用 | 任意 T | Copy 类型 |

`Rc<RefCell<T>>` 是单线程「多个所有者 + 都能改」的经典组合（[L5 手写 MPSC](/projects/mpsc-channel.md) 会用到类似思路）。

<Callout type="idea" title="优先让编译期规则通过" text="`RefCell` 只应用在「编译期无法表达、但逻辑上确实安全」的场景：实现某些数据结构、mock 对象、观察者模式。能用 `&mut` 或调整结构解决的，别用 RefCell —— 把错误从编译期推到运行时是明显的退让。" />

## 六、`Cow`：写时复制

```rust
use std::borrow::Cow;

fn ensure_exclaim(input: &str) -> Cow<str> {
    if input.ends_with('!') {
        Cow::Borrowed(input)                     // 不用改 → 零拷贝
    } else {
        Cow::Owned(format!("{}!", input))        // 要改 → 才分配
    }
}

fn main() {
    let a = ensure_exclaim("hi!");
    let b = ensure_exclaim("hello");
    println!("{} {} / {:?} {:?}", a, b, a, b);
}
```

`Cow` 实现了 `Deref`，可以直接当 `&str` 用。文本清洗、配置归一化这类「大多数输入不需要改」的场景收益最明显。

<Predict no="30-1" q="`Rc::clone(&a)` 之后堆上的字符串有几份？" :options='["一份", "两份", "三份", "取决于字符串长度"]' answer="0" output="一份" explain="只增加引用计数（一个整数），不复制堆数据；这正是它比深拷贝便宜的原因。" />

<Quiz no="30-2" q="关于 Box 与 RefCell，哪些说法正确？" :options='["Box 能把递归类型的大小固定成一根指针", "Box&lt;dyn Trait&gt; 可以装 trait object", "RefCell 把借用检查推迟到运行时", "RefCell 违反规则时会产生编译错误"]' answer="0,1,2" multi="true" explain="RefCell 在运行时违反规则会 panic，不是编译错误。" />

<Quiz no="30-3" q="两个 Rc 互相引用导致内存泄漏，标准解法是？" :options='["改用 Box", "其中一侧用 Weak 弱引用", "加 unsafe", "调用 Rc::force_drop"]' answer="1" explain="Weak 不增加强引用计数，upgrade() 返回 Option 处理对象已释放的情况。" />

<Quiz no="30-4" q="`Deref` trait 的作用包括？" :options='["让方法调用自动解引用", "支持 &String 到 &str 的强制转换", "离开作用域时释放内存", "让类型能被多个线程共享"]' answer="0,1" multi="true" explain="释放内存是 Drop 的职责；线程共享靠 Send/Sync（第 31 讲）。" />

<Exercise title="为三个场景选工具" task="1. 定义递归的树节点；2. 单线程里多个组件共享一份只读配置；3. 函数接收文本，多数情况原样返回、少数情况追加后缀。分别选一个智能指针并说明理由；再说明如果场景 2. 要跨线程该换成什么。" hints='["1. 需要把大小固定下来", "2. 多所有者、只读", "3. 写时才复制", "跨线程共享要原子引用计数"]' solution="1. Box&lt;Node&gt;：把递归部分变成固定大小的指针。\n2. Rc&lt;Config&gt;：引用计数，多所有者共享，计数归零自动释放。\n3. Cow&lt;str&gt;：Borrowed 零拷贝，需要改时 Owned 才分配。\n跨线程时 2. 换成 Arc&lt;Config&gt;（必要时 Arc&lt;Mutex&lt;Config&gt;&gt;）。" explain="这三类需求在真实项目里很常见；判断顺序是「要不要多所有者 → 要不要修改 → 要不要跨线程」。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `already borrowed: BorrowMutError` | 运行时借用冲突；缩短 `borrow()` 守卫的作用域 |
| Rc 造成内存泄漏 | 环状引用的一侧改 `Weak` |
| 循环里反复 `borrow()` | 把守卫提出来复用，减少运行时检查 |
| 跨线程编译报 `Rc cannot be sent` | 换 `Arc` |
| Cow 到处 `into_owned()` | 失去了写时复制的意义，检查是否真的需要拥有 |

## 小结

- `Deref` / `Drop` 是智能指针能「像引用一样用 + 自动清理」的两个底层 trait。
- `Box` 管堆分配与递归，`Rc` 管多所有者（环状用 `Weak`），`RefCell` 把检查推到运行时，`Cow` 做写时复制。
- 优先让编译期规则通过；`RefCell` 是最后手段。
- 跨线程用 `Arc` —— 这正是 L4 的起点。

<CheckList id="smart-check" title="学完本节，你应该能…" :items='["说出 Deref 与 Drop 各自的职责", "说出 Box 的三个典型用途", "用 Weak 解决 Rc 循环引用", "说明 RefCell 的检查时机与代价", "在 Box / Rc / RefCell / Cow / Arc 之间选型"]' />

[上一讲：泛型与 trait bound →](/core/generics.md) · [下篇：闭包与迭代器 →](/core/closures-iterators.md)
