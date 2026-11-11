---
title: 第 51 讲 · 手写 MPSC channel
description: 用 Mutex + Condvar 从零实现多生产者单消费者队列，并用测试驱动把语义一点点补齐。
---

<StageHeader stage="L5 · 第 51 讲" level="★★★★☆" time="90 分钟" goal="理解队列、阻塞、背压与通道关闭的底层实现" prereq="L4 全部" />

# 第 51 讲 · 手写 MPSC channel

**场景**：上一阶段用 `std::sync::mpsc` 用得很顺，但它是怎么做到「多个生产者、一个消费者、空队列阻塞、通道关闭唤醒」的？这一篇从零造一个，是理解并发原语最好的练习。

原教材用的是**测试驱动（TDD）**：先写测试描述需求，再一步步让测试变绿。我们沿用这个节奏。

## 你会练到什么

- `Arc<Mutex<...>>` 保护共享队列
- `Condvar` 实现「没数据时等待、来数据时唤醒」
- `Sender` 可克隆、`Receiver` 唯一
- 背压（有界队列）、通道关闭（`send` 端全部 drop 时 `recv` 返回 `None`）
- 用 `#[cfg(test)]` 描述并发语义

## 四个需求，四组测试

<StepBox title="测试驱动的实现顺序" :steps='[{"title":"需求 1：能发能收","body":"`let (tx, rx) = channel(); tx.send(1); assert_eq!(rx.recv(), Some(1));`","tip":"先用 VecDeque 当队列，不加任何阻塞，跑通最基本路径。"},{"title":"需求 2：空队列要阻塞","body":"起一个线程 100ms 后 send，主线程 recv 应该等到数据而不是立刻返回 None。","tip":"这里引入 Condvar：队列空时 wait，send 后 notify_one。"},{"title":"需求 3：多生产者","body":"clone 出多个 Sender 并发 send，Receiver 能收到全部消息。","tip":"Sender 要 Clone，内部用 Arc 共享同一个队列。"},{"title":"需求 4：通道关闭","body":"所有 Sender 被 drop 后，recv 立即返回 None，而不是永远等下去。","tip":"维护 sender 计数：Sender::clone 加一，Drop 减一，归零时 notify_all。"},{"title":"加分：有界队列与背压","body":"`sync_channel(2)`：队列满时 send 阻塞，直到消费者取走一个。","tip":"再加一个 Condvar 专门等「有空位」，注意别和「有数据」混用。"}]' />

## 完整实现（无界版本）

```rust
use std::{
    collections::VecDeque,
    sync::{Arc, Condvar, Mutex},
};

struct Shared<T> {
    queue: Mutex<VecDeque<T>>,
    available: Condvar,   // 消费者等「有数据」
    senders: Mutex<usize>,
}

pub struct Sender<T> { shared: Arc<Shared<T>> }
pub struct Receiver<T> { shared: Arc<Shared<T>> }

pub fn channel<T>() -> (Sender<T>, Receiver<T>) {
    let shared = Arc::new(Shared {
        queue: Mutex::new(VecDeque::new()),
        available: Condvar::new(),
        senders: Mutex::new(1),
    });
    (
        Sender { shared: Arc::clone(&shared) },
        Receiver { shared },
    )
}

impl<T> Clone for Sender<T> {
    fn clone(&self) -> Self {
        *self.shared.senders.lock().unwrap() += 1;
        Sender { shared: Arc::clone(&self.shared) }
    }
}

impl<T> Sender<T> {
    pub fn send(&self, value: T) -> Result<(), T> {
        if *self.shared.senders.lock().unwrap() == 0 { return Err(value); }
        self.shared.queue.lock().unwrap().push_back(value);
        self.shared.available.notify_one();
        Ok(())
    }
}

impl<T> Drop for Sender<T> {
    fn drop(&mut self) {
        let mut n = self.shared.senders.lock().unwrap();
        *n -= 1;
        if *n == 0 {
            // 唤醒可能在等待的消费者，让它发现「通道已关闭」
            self.shared.available.notify_all();
        }
    }
}

impl<T> Receiver<T> {
    pub fn recv(&self) -> Option<T> {
        let mut q = self.shared.queue.lock().unwrap();
        loop {
            if let Some(v) = q.pop_front() { return Some(v); }
            if *self.shared.senders.lock().unwrap() == 0 { return None; }
            q = self.shared.available.wait(q).unwrap();
        }
    }
}
```

<Callout type="warn" title="注意锁的顺序" text="`recv` 里先拿 queue 的锁，再去读 senders 的锁；`Drop` 里只拿 senders 的锁。如果出现「A 持有 queue 等 senders、B 持有 senders 等 queue」就会死锁。实现并发原语时，**固定加锁顺序**是铁律。" />

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn send_recv() {
        let (tx, rx) = channel();
        tx.send(42).unwrap();
        assert_eq!(rx.recv(), Some(42));
    }

    #[test]
    fn recv_blocks_until_send() {
        let (tx, rx) = channel::<i32>();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            tx.send(7).unwrap();
        });
        assert_eq!(rx.recv(), Some(7));
    }

    #[test]
    fn multiple_producers() {
        let (tx, rx) = channel::<i32>();
        let mut handles = vec![];
        for i in 0..4 {
            let t = tx.clone();
            handles.push(thread::spawn(move || t.send(i).unwrap()));
        }
        drop(tx);
        for h in handles { h.join().unwrap(); }
        let mut got: Vec<i32> = (0..4).map(|_| rx.recv().unwrap()).collect();
        got.sort();
        assert_eq!(got, vec![0, 1, 2, 3]);
    }

    #[test]
    fn closes_when_all_senders_dropped() {
        let (tx, rx) = channel::<i32>();
        drop(tx);
        assert_eq!(rx.recv(), None);
    }
}
```

```bash
cargo test
```

<ConceptDiagram type="thread" title="多个 Sender 共享一个队列；Condvar 负责等待与唤醒" />

## 三个容易写错的地方

| 问题 | 后果 | 正确做法 |
| --- | --- | --- |
| 用 `if` 而不是 `loop` 检查队列 | **虚假唤醒**时取出空值 | 永远在 `loop` 里 `wait` |
| 只 `notify_one` 关闭事件 | 多个消费者只有一个醒来 | 关闭时 `notify_all` |
| 持锁做耗时操作 | 生产者被卡住，吞吐暴跌 | 缩小临界区，尽快释放 guard |

<Callout type="idea" title="和标准库的区别" text="`std::sync::mpsc` 还有 `try_recv`、`recv_timeout`、有界 `sync_channel`、以及更精细的断开语义。但核心骨架就是上面这几十行：队列 + 互斥锁 + 条件变量 + 计数。" />

<Quiz no="51-1" q="`Condvar::wait` 为什么要放在 loop 里？" :options='["为了循环打印日志", "可能发生虚假唤醒，醒来后必须重新检查条件", "Rust 语法要求", "为了等待多个消息"]' answer="1" explain="即使没人 notify，wait 也可能返回；只有重新检查谓词才安全。" />

<Quiz no="51-2" q="所有 Sender 被 drop 时，为什么需要 notify_all？" :options='["让队列清空", "唤醒正在等待的消费者，让它们发现通道关闭并返回 None", "释放内存", "通知操作系统"]' answer="1" explain="否则消费者会永远阻塞，即使再也不会有新消息。" />

<Predict no="51-3" q="`sync_channel(2)` 队列已满时，第 3 次 send 会？" :options='["丢弃最旧的消息", "直接返回 Err", "阻塞，直到消费者取走一个", "自动扩容"]' answer="2" output="阻塞等待" explain="这就是背压：生产者被限速，内存不会被无限增长的队列吃光。" />

<Exercise title="实现 try_recv" task="给 Receiver 增加 `pub fn try_recv(&self) -&gt; Result&lt;T, TryRecvError&gt;`，空队列返回 Empty，通道关闭返回 Disconnected，都不阻塞。" hints='["直接 lock 一次队列，不进入 Condvar 等待循环", "先尝试 pop_front，再看 senders 计数", "简单起见用 enum TryRecvError { Empty, Disconnected }"]' solution="pub enum TryRecvError { Empty, Disconnected }\n\nimpl&lt;T&gt; Receiver&lt;T&gt; {\n    pub fn try_recv(&self) -&gt; Result&lt;T, TryRecvError&gt; {\n        let mut q = self.shared.queue.lock().unwrap();\n        if let Some(v) = q.pop_front() { return Ok(v); }\n        if *self.shared.senders.lock().unwrap() == 0 {\n            Err(TryRecvError::Disconnected)\n        } else {\n            Err(TryRecvError::Empty)\n        }\n    }\n}" explain="非阻塞版本的关键就是「不 wait」，只做一次状态检查。" />

## 扩展挑战

- 实现有界队列 `sync_channel(cap)`：需要第二个 `Condvar` 等「有空位」。
- 实现 `recv_timeout(Duration)`：`wait_timeout` 返回后区分超时与有数据。
- 用 `AtomicUsize` 替代 `Mutex<usize>` 维护 sender 计数，比较实现复杂度。
- 加基准测试，看看你的实现和标准库差多少。

<CheckList id="mpsc-check" title="验收清单" :items='["四组测试全部通过", "能解释为什么 wait 要放在 loop 里", "知道关闭时为什么用 notify_all", "理解有界队列的背压语义"]' />

[下一讲：第 52 讲 Actor 模型与任务分发 →](/projects/actor.md) · [进入贯穿项目：KV Server 总览 →](/projects/kv/index.md)
