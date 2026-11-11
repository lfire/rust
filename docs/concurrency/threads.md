---
title: 第 32 讲 · 线程与 Send
description: 用 thread::spawn 创建线程、理解 move 闭包为什么必需，以及 JoinHandle 的作用。
---

<StageHeader stage="L4 · 第 32 讲" level="★★★☆☆" time="14 分钟" goal="能创建线程并安全地传递数据" prereq="第 31 讲 Send/Sync" />

# 第 32 讲 · 线程与 Send

Rust 标准库自带 1:1 的操作系统线程，开箱即用。

## 第一个多线程程序

```rust
use std::thread;
use std::time::Duration;

fn main() {
    let handle = thread::spawn(|| {
        for i in 1..4 {
            println!("子线程：{}", i);
            thread::sleep(Duration::from_millis(10));
        }
    });

    for i in 1..3 {
        println!("主线程：{}", i);
        thread::sleep(Duration::from_millis(10));
    }

    handle.join().unwrap();   // 等子线程结束
    println!("全部完成");
}
```

`thread::spawn` 返回一个 `JoinHandle`；`join()` 会阻塞当前线程直到它结束。如果忘了 `join`，主线程结束时子线程会被直接终止。

## 为什么几乎总要写 `move`

```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];

    let handle = thread::spawn(move || {   // move 把 v 的所有权移进闭包
        println!("子线程拿到 {:?}", v);
    });

    handle.join().unwrap();
    // println!("{:?}", v);   // ❌ v 已被移走
}
```

去掉 `move` 会报：

```text
error[E0373]: closure may outlive the current function,
             but it borrows `v`, which is owned by the current function
```

原因很实在：新线程可能比创建它的函数活得久，编译器不能允许它借用栈上的局部变量。解决方案有两个：

- 加 `move` 把所有权交出去（最常用）；
- 用带 `'static` 生命周期的数据（如字符串字面量）。

<Term word="Send" text="标记 trait：类型的所有权可以安全地在线程之间转移。绝大多数类型自动实现，Rc 等不是。" />

## `Send` / `Sync` 怎么工作

```rust
use std::{rc::Rc, thread};

fn main() {
    let data = Rc::new(vec![1, 2, 3]);
    // thread::spawn(move || println!("{:?}", data));  // ❌ Rc 不是 Send
}
```

```text
error[E0277]: `Rc<Vec<i32>>` cannot be sent between threads safely
```

编译器读的是类型，不是你的意图：`Rc` 的引用计数用普通整数，两个线程同时 `clone` / `drop` 会把计数改坏，所以它没实现 `Send`。换成 `Arc` 就好了（下一讲）。

<Callout type="idea" title="这就是「无畏并发」" text="其他语言靠 code review 和压测去发现「这个对象不能跨线程」，Rust 把它变成一个编译错误。你不需要记住规则表，编译器会替你查。" />

<ConceptDiagram type="thread" title="线程之间转移的是所有权，不是共享的栈引用" />

<Quiz no="32-1" q="`thread::spawn` 的闭包常需要 `move`，主要因为？" :options='["让闭包运行更快", "新线程可能比当前函数活得久，不能借用局部变量", "move 会自动加锁", "spawn 要求闭包必须是 FnOnce"]' answer="1" explain="本质上是生命周期约束：借用栈上局部变量不安全，转移所有权最稳妥。" />

<Quiz no="32-2" q="关于 Send 与 Sync，哪些说法正确？" :options='["Send 表示所有权可在线程间转移", "Sync 表示引用可被多个线程同时持有", "Rc 不是 Send，应换成 Arc", "所有类型都自动实现 Send 和 Sync"]' answer="0,1,2" multi="true" explain="Rc、RefCell、裸指针等并不自动实现这两个标记 trait。" />

<Predict no="32-3" q="把 `Rc::new(5)` 用 move 送进 thread::spawn，会发生什么？" :options='["正常运行", "编译失败：Rc 不能安全地在线程间发送", "能编译但计数偶尔出错", "运行时 panic"]' answer="1" output="error[E0277]: `Rc<i32>` cannot be sent between threads safely" explain="move 只解决生命周期，不解决线程安全；这里必须换成 Arc。" />

<Exercise title="并行求和" task="把 Vec 中的 8 个数字分成两块，用两个线程分别求和，main 里用 join 收集两个结果并打印总和。" hints='["用 move 把切好的 Vec 移进闭包", "闭包最后一行写 sum 作为返回值", "JoinHandle::join() 返回 Result，返回值在 Ok 里"]' solution="use std::thread;\n\nfn main() {\n    let nums = vec![1, 2, 3, 4, 5, 6, 7, 8];\n    let a = nums[..4].to_vec();\n    let b = nums[4..].to_vec();\n\n    let h1 = thread::spawn(move || a.iter().sum::<i32>());\n    let h2 = thread::spawn(move || b.iter().sum::<i32>());\n\n    let total = h1.join().unwrap() + h2.join().unwrap();\n    println!(&quot;总和 {}&quot;, total);\n}" explain="每个线程独占一份数据，完全不需要锁 —— 这是最安全也最易推理的并发写法。" />

## 小结

- `thread::spawn` 创建线程，`JoinHandle::join()` 等待结束。
- `move` 把捕获变量的所有权交进闭包，满足生命周期要求。
- `Send` / `Sync` 是编译器判断线程安全的标记 trait；`Rc` 不是 `Send`。

<CheckList id="threads-check" title="学完本节，你应该能…" :items='["创建线程并等待它结束", "解释 move 在 spawn 里为什么必需", "读懂 E0373 与 E0277 的区别", "说出 Send 与 Sync 的含义"]' />

[上一讲：数据竞争与 Send/Sync →](/concurrency/send-sync.md) · [下一讲：共享状态 Arc / Mutex →](/concurrency/shared-state.md)
