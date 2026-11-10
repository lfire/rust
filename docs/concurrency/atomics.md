---
title: 第 34 讲 · Atomic、Condvar 与 RwLock
description: 原子类型与内存序、CAS 循环、Condvar 等待唤醒、RwLock 读写锁与锁选型。
---

<StageHeader stage="L4 · 第 34 讲" level="★★★★☆" time="30 分钟" goal="能在 Mutex 之外按场景选对底层同步原语" prereq="第 33 讲 Arc + Mutex" />

# 第 34 讲 · Atomic、Condvar 与 RwLock

[上一讲](/concurrency/shared-state.md) 用 `Arc<Mutex<T>>` 解决了共享可变状态。但锁不是唯一答案：只改一个整数时，加锁的开销可能比计算本身还大；读远多于写时，独占锁又会把并发度压到 1。这一讲看标准库提供的另外三种工具。

## 一、原子类型：一条指令完成读改写

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

fn main() {
    let counter = Arc::new(AtomicUsize::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let c = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..1000 {
                c.fetch_add(1, Ordering::Relaxed);
            }
        }));
    }
    for h in handles { h.join().unwrap(); }
    println!("{}", counter.load(Ordering::Relaxed));   // 10000
}
```

`fetch_add` 由 CPU 的原子指令实现，不需要互斥、不会阻塞、也不会死锁。常见类型：`AtomicBool`、`AtomicI32`/`AtomicUsize`、`AtomicPtr<T>`。

<Compare title="Mutex 与 Atomic 的取舍" :panels='[{"label":"Mutex&lt;T&gt;","code":"let mut n = m.lock().unwrap();\n*n += 1;","note":"可保护任意复杂的不变量，但会阻塞、可能死锁"},{"label":"AtomicUsize","code":"n.fetch_add(1, Ordering::Relaxed);","note":"只适合单个值的原子操作，无阻塞、极快"}]' note="判断标准：临界区里是不是只有一个标量？是就用 Atomic，涉及多个字段的一致性就必须用锁。" />

### CAS 与 `compare_exchange`

所有原子操作的基石是 **CAS（Compare-And-Swap）**：「如果当前值还是我看到的那个，就换成新值」。

```rust
use std::sync::atomic::{AtomicU32, Ordering};

fn capped_increment(n: &AtomicU32, cap: u32) -> u32 {
    let mut cur = n.load(Ordering::Relaxed);
    loop {
        if cur >= cap { return cur; }
        match n.compare_exchange_weak(cur, cur + 1, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return cur + 1,
            Err(actual) => cur = actual,   // 被别的线程抢先改了，用新值重试
        }
    }
}
```

<Callout type="tip" title="weak 与 strong 的区别" text="`compare_exchange_weak` 允许**虚假失败**（值没变也返回 Err），但在循环里用没有区别且某些平台更快。单次判断用 `compare_exchange`（strong）。" />

### 内存序（`Ordering`）怎么选

| Ordering | 保证 | 典型用途 |
| --- | --- | --- |
| `Relaxed` | 只保证原子性，**不保证顺序/可见性** | 计数器、统计 |
| `Acquire` / `Release` | 配对使用，建立 happens-before | 发布数据、锁的实现 |
| `AcqRel` | 读改写同时具备两者 | 引用计数、队列 |
| `SeqCst` | 全局单一顺序，最强最慢一点 | 拿不准时的安全默认 |

```rust
// 典型「发布」模式：先写数据，再用 Release 打标记
data.store(42, Ordering::Relaxed);
ready.store(true, Ordering::Release);
// 另一线程 Acquire 读到 true，就一定能看到 data = 42
```

<Callout type="warn" title="Relaxed 不等于「随便」" text="它只保证这个变量自身的操作是原子的，不保证其它写的可见顺序。上面计数器用 Relaxed 没问题（只关心最终总数），但用 Relaxed 做「先写数据再置标志」就会踩内存可见性的坑。初学阶段除了纯计数，一律用 `SeqCst` 更稳妥。" />

## 二、`Condvar`：等待条件成立

`Mutex` 能保护数据，但「等某个条件变为真」如果写成忙等（循环里反复加锁检查）会白烧 CPU。`Condvar` 让线程**睡下去，被通知再醒**。

```rust
use std::sync::{Arc, Condvar, Mutex};
use std::thread;

fn main() {
    let pair = Arc::new((Mutex::new(false), Condvar::new()));
    let p2 = Arc::clone(&pair);

    thread::spawn(move || {
        let (lock, cvar) = &*p2;
        let mut ready = lock.lock().unwrap();
        *ready = true;
        cvar.notify_one();                 // 唤醒一个等待者
    });

    let (lock, cvar) = &*pair;
    let mut ready = lock.lock().unwrap();
    // 必须用 while：可能发生虚假唤醒，或被别人抢先改回 false
    while !*ready {
        ready = cvar.wait(ready).unwrap();  // 释放锁 → 睡 → 被唤醒后重新拿锁
    }
    println!("条件已满足");
}
```

三个要点：

1. `wait` 会**原子地释放锁并进入等待**，被唤醒时重新持锁返回。
2. **必须在 `while` 里检查条件**，不能用 `if` —— 虚假唤醒、通知先于等待、多个等待者竞争都会让 `if` 版本出错。
3. `notify_one` 唤醒一个，`notify_all` 唤醒全部（广播场景）。

<ConceptDiagram type="thread" title="Condvar 与 Mutex 配合：改条件 → notify → 等待者重新检查条件" />

<Callout type="idea" title="和 [L5 手写 MPSC](/projects/mpsc-channel.md) 的关系" text="有界队列的「队列空时消费者等」「队列满时生产者等」正是 Condvar 的经典用法，通常需要两个条件变量分别等空/等满。第 51 讲会把它从零实现一遍。" />

## 三、`RwLock`：读多写少的并发读

```rust
use std::sync::{Arc, RwLock};
use std::thread;

fn main() {
    let config = Arc::new(RwLock::new(vec![1, 2, 3]));
    let mut handles = vec![];
    for _ in 0..4 {
        let c = Arc::clone(&config);
        handles.push(thread::spawn(move || {
            let r = c.read().unwrap();     // 多个读锁可同时持有
            println!("{:?}", *r);
        }));
    }
    {
        let mut w = config.write().unwrap();  // 写锁独占
        w.push(4);
    }
    for h in handles { h.join().unwrap(); }
}
```

| | `Mutex<T>` | `RwLock<T>` |
| --- | --- | --- |
| 同时读者数 | 1 | 任意多 |
| 同时写者数 | 1 | 1（且排斥所有读者） |
| 实现复杂度 | 低 | 高，读锁本身也有开销 |
| 适合 | 读写均衡 / 临界区极短 | **读远多于写** |

<Callout type="warn" title="RwLock 不一定更快" text="读锁需要维护读者计数，单次开销可能比 Mutex 还大；写频繁时还可能让读者饥饿（取决于实现的公平策略）。**先用 Mutex 写对，再靠压测决定要不要换** —— 别凭直觉优化。" />

### 死锁：这些工具都拦不住

```rust
// 线程 A: 先锁 m1 再锁 m2
// 线程 B: 先锁 m2 再锁 m1   → 互相等待，死锁
```

防线只有设计层面的：固定加锁顺序、用 `try_lock` + 回退、缩短临界区、不要把 `await` 放进持锁代码（异步版见第 38 讲）。

<Quiz no="34-1" q="`fetch_add(1, Ordering::Relaxed)` 保证什么？" :options='["该变量的操作是原子的，不保证其它内存写的可见顺序", "所有线程看到完全一致的全局操作顺序", "临界区内任意多字段的一致性", "会自动给其它普通变量的读写加锁"]' answer="0" explain="Relaxed 只保证原子性；顺序与可见性要靠 Acquire/Release 或 SeqCst。" />

<Quiz no="34-2" q="`Condvar` 等待时为什么必须用 `while` 检查条件？" :options='["语法要求", "可能虚假唤醒，或条件已被其他等待者改回去", "while 比 if 快", "编译器不允许 if"]' answer="1" explain="虚假唤醒、通知丢失、多等待者竞争都要求醒来后重新检查谓词。" />

<Quiz no="34-3" q="哪些场景适合用 `RwLock` 而不是 `Mutex`？" :options='["配置表：启动后基本只读，偶尔热更新", "读操作耗时明显长于写操作且读远多于写", "高频写计数器", "只保护一个 AtomicUsize 就够的标量"]' answer="0,1" multi="true" explain="高频写让写锁成为瓶颈；单标量用 Atomic 更合适。" />

<Predict no="34-4" q="两个线程分别以相反顺序锁同一对 Mutex，Rust 会？" :options='["编译期拒绝", "运行期可能死锁", "自动调整加锁顺序", "panic 并给出提示"]' answer="1" output="（可能永久阻塞）" explain="死锁是逻辑错误，类型系统管不了；靠固定加锁顺序等设计约束避免。" />

<Exercise title="用 Atomic 实现限流器" task="用 `AtomicU32` 实现 `struct Limiter { count, cap }`：`fn try_acquire(&self) -&gt; bool`，用 CAS 循环在 count 小于 cap 时加一并返回 true，否则 false；再用 `Condvar + Mutex` 写一个「等待直到有空位」的阻塞版本，说明两者取舍。" hints='["compare_exchange_weak 循环里用 Err(actual) 更新当前值", "注意 cap 边界：cur &gt;= cap 直接返回 false", "阻塞版要在 while 里 wait，改动 count 后 notify_one"]' solution="use std::sync::atomic::{AtomicU32, Ordering};\n\nstruct Limiter { count: AtomicU32, cap: u32 }\n\nimpl Limiter {\n    fn try_acquire(&amp;self) -&gt; bool {\n        let mut cur = self.count.load(Ordering::Relaxed);\n        loop {\n            if cur &gt;= self.cap { return false; }\n            match self.count.compare_exchange_weak(cur, cur + 1, Ordering::AcqRel, Ordering::Relaxed) {\n                Ok(_) =&gt; return true,\n                Err(actual) =&gt; cur = actual,\n            }\n        }\n    }\n}" explain="非阻塞版适合快速失败；阻塞版适合任务队列，但引入锁与唤醒开销。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `Relaxed` 下标志位与数据顺序错乱 | 用 `Release`/`Acquire` 配对或 `SeqCst` |
| `compare_exchange` 偶发失败 | 用循环重试，`weak` 允许虚假失败 |
| `Condvar` 用了 `if` 导致条件没满足就往下走 | 改 `while` |
| RwLock 换了反而变慢 | 读锁有自身开销，回退 Mutex 并压测 |
| 持锁时调用外部回调 | 可能回调里又加锁 → 死锁；先取快照再释放锁 |
| `PoisonError` | 有线程持锁时 panic；用 `into_inner()` 恢复或让进程退出 |

## 小结

- 原子类型用一条 CPU 指令完成读改写，`Relaxed` 只保证原子性；发布数据要 `Release`/`Acquire` 或 `SeqCst`。
- CAS 循环能实现无锁的复合操作，注意弱比较的虚假失败。
- `Condvar` 让线程睡到条件成立，必须配 `Mutex` + `while` 检查。
- `RwLock` 只在读远多于写时划算；死锁是逻辑问题，类型系统不管。
- 下一讲从「共享内存」切到「消息传递」。

<CheckList id="atomics-check" title="学完本节，你应该能…" :items='["说出 Relaxed 与 SeqCst 的区别", "写出 CAS 循环并解释为什么要重试", "用 Condvar 实现等待/唤醒并说明为什么用 while", "判断 RwLock 是否适合当前场景", "说出两种典型死锁成因与预防办法"]' />

[上一讲：共享状态 Arc + Mutex →](/concurrency/shared-state.md) · [下一讲：消息传递 Channel →](/concurrency/channels.md)
