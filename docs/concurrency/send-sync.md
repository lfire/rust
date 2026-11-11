---
title: 第 31 讲 · 并发为什么难：数据竞争与 Send/Sync
description: 数据竞争三要素、内存可见性、Send 与 Sync 的精确定义与自动推导，以及 thread::spawn 的 'static bound。
---

<StageHeader stage="L4 · 第 31 讲" level="★★★☆☆" time="28 分钟" goal="能说清数据竞争的成因并用 Send/Sync 判断跨线程安全性" prereq="第 30 讲 闭包与迭代器" />

# 第 31 讲 · 并发为什么难：数据竞争与 Send/Sync

「无畏并发」是 Rust 最响亮的招牌。它的底气不是更快的锁，而是 L3 那套**所有权 + 借用规则 + 类型系统** —— 只不过把检查范围从「一段代码」扩展到了「多个线程」。这一讲先把问题讲透，再给 Rust 的答案。

## 一、数据竞争的三个条件

进入并发之前，先厘清两个常被混用的词：并发是一种结构，并行是一种手段。

<ConceptDiagram type="concurrent-parallel" title="并发与并行的区别" />

同时满足下面三条，程序就有数据竞争：

1. **两个或以上的执行流**访问同一块内存；
2. 其中**至少有一次是写**；
3. **没有同步机制**规定先后顺序。

```rust
// 概念示意：两个线程同时给计数器 +1
// 每个 "+1" 实际是 读 → 加一 → 写回 三步
线程 A: 读 0            → 算 1      → 写 1
线程 B:      读 0 → 算 1 → 写 1
// 两次 +1，结果却是 1
```

<ConceptDiagram type="thread" title="两个线程交错执行读改写，更新丢失" />

这种 bug 的特点是：**难复现、难调试、压测不一定能抓到、上线才炸**。因为结果取决于线程调度时序，加一行日志可能就"修好了"（时序变了）。

<Callout type="warn" title="不只是「结果不对」" text="编译器和 CPU 都会做**指令重排**，各自还有缓存，所以一个线程写了值，另一个线程未必立刻看到（内存可见性）。即使业务逻辑上「先写后读」，没有同步原语时也不成立。数据竞争在 C/C++ 里属于**未定义行为**，不只是算错数。" />

<Compare title="各语言怎么应对" :panels='[{"label":"JavaScript","code":"主线程单线程\nWorker 之间靠 postMessage\n不共享内存（除非 SharedArrayBuffer）","note":"回避了大部分竞争，但重活要跨线程传数据"},{"label":"Go","code":"go func() { counter++ }()\n// 编译通过，靠 go run -race 事后检测","note":"轻量并发，但检测在运行时"},{"label":"Rust","code":"// 把 Rc 送进线程：编译期直接拒绝\n// Rc&lt;T&gt; cannot be sent between threads safely","note":"把约束写进类型系统"}]' note="Rust 不是让并发更容易写，而是让不安全的并发写法根本编译不过。" />

## 二、`Send` 与 `Sync` 的精确定义

这两个是**标记 trait（marker trait）**：没有方法，只向编译器声明一种能力。

| trait | 定义 | 直觉 |
| --- | --- | --- |
| `Send` | 类型的**所有权**可以安全地转移到另一个线程 | 「这个值可以搬过去」 |
| `Sync` | 类型的**引用 `&T`** 可以安全地被多个线程同时持有 | 「大家可以一起借看」 |

一个非常关键、很多人没注意到的等价关系：

> **`T: Sync` ⟺ `&T: Send`**

因为「把 `&T` 送到另一个线程」正是「多个线程同时持有 `&T`」，两者是同一件事。

<ConceptDiagram type="thread" title="Send 管所有权转移，Sync 管引用共享" />

### 自动推导

编译器对结构体**逐字段**自动推导：所有字段都 `Send`，结构体就 `Send`；所有字段都 `Sync`，结构体就 `Sync`。不用手写实现。

```rust
struct Config { name: String, retries: u32 }   // ✅ 自动 Send + Sync
struct Handle { ptr: *mut u8 }                 // ❌ 裸指针，两者都没有
```

### 常见类型速查

| 类型 | Send | Sync | 原因 |
| --- | --- | --- | --- |
| `i32` / `bool` / `String` / `Vec<T>` | ✅ | ✅ | 无共享可变状态（T 满足条件时） |
| `Box<T>` / `Option<T>` | ✅ | ✅ | 跟随 T |
| `&T` | 需要 `T: Sync` | ✅ | 共享只读引用安全 |
| `&mut T` | 需要 `T: Send` | 需要 `T: Send` | 独占引用可以转移 |
| `Rc<T>` | ❌ | ❌ | 计数是普通整数，并发增减会错 |
| `RefCell<T>` / `Cell<T>` | ✅ | ❌ | 内部可变性没有同步 |
| `*mut T` / `*const T` | ❌ | ❌ | 编译器无法证明 |
| `Arc<T>` | 需 `T: Send + Sync` | 同左 | 原子计数 |
| `Mutex<T>` | 需 `T: Send` | 需 `T: Send` | 锁提供同步 |

<Callout type="idea" title="RefCell 为什么 Send 但不 Sync" text="把它**整个搬**到另一个线程是安全的（只有那一个线程能碰它）；但让两个线程同时持有 `&RefCell<T>` 就危险了，因为双方都能通过 `borrow_mut()` 改内部值，而运行时借用计数不是原子的。这组区别正好说明两个 trait 是独立的能力。" />

## 三、`thread::spawn` 的两个约束

```rust
pub fn spawn<F, T>(f: F) -> JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
```

- **`F: Send`**：闭包要被搬到新线程，捕获的所有东西都得能跨线程。
- **`F: 'static`**：新线程可能比创建它的函数活得久，闭包**不能借用栈上局部变量**。

```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];
    // ❌ 闭包借用了 v，可能活得比 main 里的栈帧久
    // thread::spawn(|| println!("{:?}", v)).join().unwrap();

    // ✅ move 把所有权交进闭包
    let h = thread::spawn(move || println!("{:?}", v));
    h.join().unwrap();
}
```

<Predict no="31-1" q="把 `Rc&lt;Vec&lt;i32&gt;&gt;` 用 move 送进 `thread::spawn`，会？" :options='["正常运行", "编译失败：Rc 不是 Send", "能编译但计数偶尔出错", "运行时 panic"]' answer="1" output="error[E0277]: `Rc<Vec<i32>>` cannot be sent between threads safely" explain="move 只解决生命周期，不解决线程安全；Rc 的计数非原子，必须换 Arc。" />

<CodeTabs title="不安全 → 安全" :tabs='[{"label":"编译不过","code":"let c = Rc::new(RefCell::new(0));\nthread::spawn(move || {\n    *c.borrow_mut() += 1;\n});","note":"Rc 非 Send，RefCell 非 Sync"},{"label":"改成 Arc + Mutex","code":"let c = Arc::new(Mutex::new(0));\nlet c2 = Arc::clone(&c);\nthread::spawn(move || {\n    *c2.lock().unwrap() += 1;\n});","note":"原子计数 + 互斥锁"}]' />

<Callout type="tip" title="读报错的方式" text="看到 `cannot be sent between threads safely`，先找闭包捕获了哪个变量，再查它的类型是否 `Send`。常见元凶：`Rc`、`RefCell`、`&T`（借用栈上数据）、裸指针。换 `Arc` / 加 `move` / 改成拥有所有权的类型即可。" />

## 四、用类型系统消除的到底是哪类 bug

| 类别 | Rust 能否在编译期拦住 |
| --- | --- |
| 两个线程同时写同一数据（无锁） | ✅ 借用规则 + Send/Sync |
| 悬空引用 / 迭代器失效 | ✅ 所有权与生命周期 |
| 悬垂指针跨线程 | ✅ `'static` bound |
| **死锁** | ❌ 逻辑问题，靠设计与测试 |
| **竞态条件**（时序依赖但无数据竞争） | ❌ 需要业务层同步 |
| **业务逻辑错误** | ❌ 任何语言都保证不了 |

<Callout type="warn" title="无畏并发 ≠ 不会写错并发" text="Rust 消灭的是「数据竞争」这一类内存级错误，不是所有并发 bug。用 `Arc<Mutex<T>>` 之后照样可能加锁顺序不一致导致死锁，或者消息顺序不符合业务预期。类型系统给你的是**底线**，不是全部。" />

<Quiz no="31-2" q="`T: Sync` 等价于下面哪一句？" :options='["T 可以被移到别的线程", "&T 可以被送到别的线程（&T: Send）", "T 一定实现了 Send", "T 不含任何引用"]' answer="1" explain="Sync 说的是引用可共享；把 &T 送进另一个线程正是这种共享。" />

<Quiz no="31-3" q="关于 Send / Sync 的自动推导，哪些说法正确？" :options='["结构体所有字段 Send，它就自动 Send", "Rc 不是 Send，因为计数非原子", "RefCell 不是 Sync", "手动实现 Send 是安全操作，不需要 unsafe"]' answer="0,1,2" multi="true" explain="Send/Sync 是 unsafe trait，手动实现必须写 unsafe impl 并自己证明安全（见第 53 讲 FFI）。" />

<Quiz no="31-4" q="`thread::spawn` 要求闭包满足 `+ 'static`，主要是为了？" :options='["提升性能", "新线程可能比当前函数活得久，闭包不能借用栈上局部变量", "让闭包只能调用一次", "避免闭包过大"]' answer="1" explain="配合 move 把所有权交进闭包，是满足这个 bound 最常规的做法。" />

<Exercise title="修好并发计数器" task="下面代码有两个问题：用了 `Rc` 且闭包借用了局部变量。请改成 10 个线程各加 1 次、最终输出 10 的版本；再说明如果改成 `Arc<AtomicUsize>` 可以省掉什么。" hints='["Rc 换 Arc，内部还需要内部可变性", "Arc&lt;Mutex&lt;i32&gt;&gt; 或 Arc&lt;AtomicUsize&gt;", "每个线程 clone 一份 Arc，最后 join 全部 handle"]' solution="use std::sync::{Arc, Mutex};\nuse std::thread;\n\nfn main() {\n    let c = Arc::new(Mutex::new(0));\n    let mut handles = vec![];\n    for _ in 0..10 {\n        let c = Arc::clone(&c);\n        handles.push(thread::spawn(move || {\n            *c.lock().unwrap() += 1;\n        }));\n    }\n    for h in handles { h.join().unwrap(); }\n    println!(&quot;{}&quot;, *c.lock().unwrap());  // 10\n}" explain="AtomicUsize 用一条 fetch_add 完成读改写，可以省掉 Mutex 与显式加锁，但只适用于单变量的原子操作。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `Rc cannot be sent between threads` | 换 `Arc` |
| `closure may outlive the current function` | 加 `move`，或让数据活得更久 |
| `RefCell cannot be shared between threads` | 换 `Mutex` / `RwLock` / 原子类型 |
| 以为加了 `Arc` 就能改数据 | `Arc<T>` 只提供共享，修改仍需 `Mutex`/`Atomic` |
| 加了锁但业务结果仍不对 | 检查临界区是否覆盖完整操作、是否有时序依赖 |

## 小结

- 数据竞争 = 多线程 + 同一内存 + 至少一次写 + 无同步；还附带内存可见性与重排问题。
- `Send` 管**所有权转移**，`Sync` 管**引用共享**；`T: Sync ⟺ &T: Send`。
- 两者对结构体逐字段自动推导；`Rc`、`RefCell`、裸指针是典型反例。
- `thread::spawn` 要求 `F: Send + 'static`，这是 `move` 闭包常出现在并发代码里的原因。
- Rust 消灭的是数据竞争，不保证没有死锁或业务竞态。

<CheckList id="send-sync-check" title="学完本节，你应该能…" :items='["说出数据竞争的三个条件", "区分 Send 与 Sync 的语义", "判断常见类型是否 Send / Sync", "解释 thread::spawn 为什么要求 static", "把 Rc 版本的并发代码改成 Arc + Mutex"]' />

[上一讲：第 30 讲 闭包与迭代器 →](/core/closures-iterators.md) · [下一讲：线程、move 闭包与 JoinHandle →](/concurrency/threads.md)
