---
title: 第 33 讲 · 共享状态 Arc + Mutex
description: Arc 与 Mutex 的两层包装、Guard 自动解锁、锁粒度与死锁预防。
---

<StageHeader stage="L4 · 第 33 讲" level="★★★★☆" time="18 分钟" goal="能安全地让多个线程改同一份数据" prereq="第 32 讲 线程与 move 闭包" />

# 第 33 讲 · 共享状态 `Arc` + `Mutex`

[上一讲](/concurrency/threads.md) 用「各拿一份数据」避开了竞争。但很多时候确实需要多个线程改同一份状态（比如全局计数器、连接池、缓存）。Rust 提供的组合是 `Arc<Mutex<T>>`。原子类型、条件变量与读写锁见 [第 34 讲](/concurrency/atomics.md)。

## 为什么是两层包装

```text
Arc&lt;Mutex&lt;T&gt;&gt;
 │      └─ Mutex：同一时刻只允许一个线程访问 T（互斥）
 └──────── Arc：让多个线程都能「拥有」这把锁（原子引用计数）
```

单独用 `Mutex` 不够：它得先被多个线程共享，而共享就会撞上「单一所有者」规则。单独用 `Arc` 也不够：它只保证「都能拿到」，不保证「不会同时写」。两者叠加才完整。

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let c = Arc::clone(&counter);
        let h = thread::spawn(move || {
            let mut num = c.lock().unwrap();   // 拿到锁，返回 MutexGuard
            *num += 1;
        });                                    // guard 在此 drop，自动解锁
        handles.push(h);
    }

    for h in handles { h.join().unwrap(); }
    println!("结果：{}", *counter.lock().unwrap());  // 10
}
```

<Callout type="tip" title="锁是自动释放的" text="`lock()` 返回的 `MutexGuard` 实现了 Drop，离开作用域自动解锁。你不会忘记 unlock —— 又一处 RAII 替你兜底的地方。" />

<OwnershipLab scene="mut" />

<ConceptDiagram type="thread" title="多个线程各持一份 Arc，但同一时刻只有一个能拿到 Mutex" />

## 三条实践建议

1. **锁的粒度要小**：不要把耗时的 IO 或计算放在持锁代码块里。需要时先取出数据的副本，出了作用域再处理。
2. **避免嵌套多把锁**：两个线程以不同顺序获取两把锁会死锁。确实需要时，固定加锁顺序。
3. **简单计数用原子类型**：`AtomicUsize` 比 `Mutex<usize>` 更轻。

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

fn main() {
    let n = Arc::new(AtomicUsize::new(0));
    let mut handles = vec![];
    for _ in 0..10 {
        let c = Arc::clone(&n);
        handles.push(thread::spawn(move || {
            c.fetch_add(1, Ordering::SeqCst);
        }));
    }
    for h in handles { h.join().unwrap(); }
    println!("结果：{}", n.load(Ordering::SeqCst));  // 10
}
```

`Ordering::SeqCst` 是最保守、最好理解的内存序，初学阶段一律用它即可。

## 三种工具怎么选

| 需求 | 工具 |
| --- | --- |
| 只是整数计数 / 标志位 | `AtomicUsize` / `AtomicBool` |
| 一块数据要被多线程读写 | `Arc<Mutex<T>>` |
| 读多写少 | `Arc<RwLock<T>>`（多个读或一个写） |
| 能改成消息传递 | 优先用 channel（下一节） |

<Callout type="warn" title="RwLock 不一定更快" text="读写锁的实现更复杂，读多写少才划算；写频繁时可能比 Mutex 更慢。先用 Mutex 写对，再靠压测决定要不要换。" />

<Quiz no="33-1" q="`Arc&lt;Mutex&lt;i32&gt;&gt;` 里，Arc 和 Mutex 各自负责什么？" :options='["Arc 管互斥，Mutex 管共享所有权", "Arc 管多所有者共享，Mutex 管同一时刻只一个线程访问", "两者都是锁", "Arc 是原子整数，Mutex 是计数器"]' answer="1" explain="Arc 解决「谁能拿到这份数据」，Mutex 解决「同一时刻谁能改」。" />

<Quiz no="33-2" q="关于 MutexGuard，哪些说法正确？" :options='["离开作用域会自动解锁", "需要手动调用 unlock()", "通过解引用可以修改里面的值", "持锁期间做耗时 IO 会拖慢其他线程"]' answer="0,2,3" multi="true" explain="Guard 的 Drop 自动解锁，不需要也不应该手动 unlock。" />

<Predict no="33-3" q="10 个线程各对 `Arc&lt;Mutex&lt;i32&gt;&gt;` 加 1，结果一定是？" :options='["可能小于 10", "一定是 10", "一定 panic", "编译失败"]' answer="1" output="10" explain="Mutex 保证每次加一都是原子的读改写，不会丢更新。若没有锁，结果可能小于 10。" />

<Exercise title="共享日志缓冲" task="创建 `Arc&lt;Mutex&lt;Vec&lt;String&gt;&gt;&gt;`，启动 3 个线程各往里 push 一条带线程编号的消息，join 之后在主线程打印所有消息。" hints='["每个线程先 Arc::clone，再 move 进闭包", "lock().unwrap().push(...)", "打印时用 {:?} 输出整个 Vec"]' solution="use std::sync::{Arc, Mutex};\nuse std::thread;\n\nfn main() {\n    let log = Arc::new(Mutex::new(Vec::new()));\n    let mut handles = vec![];\n    for i in 1..=3 {\n        let l = Arc::clone(&log);\n        handles.push(thread::spawn(move || {\n            l.lock().unwrap().push(format!(&quot;来自线程 {}&quot;, i));\n        }));\n    }\n    for h in handles { h.join().unwrap(); }\n    println!(&quot;{:?}&quot;, *log.lock().unwrap());\n}" explain="注意消息顺序不确定，这恰恰是并发的正常表现。" />

## 小结

- `Arc` 提供多所有者，`Mutex` 提供互斥，组合起来才是线程安全的共享可变状态。
- `MutexGuard` 自动解锁；缩小临界区、避免嵌套锁。
- 简单计数用 `AtomicUsize`、等待条件用 `Condvar`、读多写少考虑 `RwLock` —— 见 [第 34 讲](/concurrency/atomics.md)。
- 能通过 [消息传递](/concurrency/channels.md) 解决的，通常比共享状态更好推理。

<CheckList id="shared-check" title="学完本节，你应该能…" :items='["解释 Arc 与 Mutex 各自解决什么", "写出 Arc&lt;Mutex&lt;T&gt;&gt; 的多线程计数器", "说明 Guard 为什么能自动解锁", "按需求在 Atomic / Mutex / RwLock 之间做选择"]' />

[上一讲：线程与 move 闭包 →](/concurrency/threads.md) · [下一讲：Atomic、Condvar 与 RwLock →](/concurrency/atomics.md)
