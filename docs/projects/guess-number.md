---
title: 第 39 讲 · 猜数字游戏
description: 用标准库 rand + loop + match 做第一个能玩的程序，练输入处理与错误恢复。
---

<StageHeader stage="L5 · 第 39 讲" level="★☆☆☆☆" time="45 分钟" goal="完成一个能交互、能容错的命令行程序" prereq="L2 全部" />

# 第 39 讲 · 猜数字游戏

**场景**：命令行小游戏。别小看它 —— 一个真正能用的交互程序，需要处理「用户乱输入」「输入不是数字」「猜大猜小」「如何退出」四件事，这正是所有命令行工具的缩影。

## 你会练到什么

- `Cargo.toml` 添加第一个外部依赖
- `std::io::stdin().read_line()` 读取输入（含缓冲区复用）
- `loop` + `break` + `continue` 组织交互循环
- `match` 处理「解析成功 / 失败」和「大了 / 小了 / 对了」
- 把错误**恢复**掉，而不是让程序崩掉

## 项目结构

```toml
[package]
name = "guessing_game"
version = "0.1.0"
edition = "2021"

[dependencies]
rand = "0.8"
```

```text
guessing_game/
├── Cargo.toml
└── src/main.rs      # 单文件就够
```

<StepBox title="分步实现" :steps='[{"title":"生成秘密数字","body":"`use rand::Rng;`，调用 `rand::thread_rng().gen_range(1..=100)` 得到 1 到 100 的随机数。","tip":"把类型写成 let secret: u32，避免后面比较时类型不一致。"},{"title":"读入一次输入","body":"声明 `let mut guess = String::new();`，用 `io::stdin().read_line(&mut guess)` 读取。","tip":"read_line 需要 &mut String，会把用户输入追加到末尾。"},{"title":"解析并容错","body":"`let guess: u32 = match guess.trim().parse() { Ok(n) => n, Err(_) => continue };`","tip":"用 continue 跳过非法输入，比 unwrap 崩溃友好得多。"},{"title":"比较并给提示","body":"`use std::cmp::Ordering;` 然后 match guess.cmp(&secret)，分别打印 太小 / 太大 / 答对了并 break。","tip":"为了每次循环都有干净的输入，把 String::new() 放在 loop 内部。"},{"title":"收尾体验","body":"加上「最多猜 7 次」的计数和开场提示，程序就有完整的产品感了。"}]' />

## 完整代码

```rust
use rand::Rng;
use std::cmp::Ordering;
use std::io;

fn main() {
    println!("🎯 猜数字：我想了一个 1~100 之间的数，你有 7 次机会！");

    let secret: u32 = rand::thread_rng().gen_range(1..=100);
    let max_tries = 7;

    for attempt in 1..=max_tries {
        print!("第 {}/{} 次，请输入：", attempt, max_tries);
        // print! 不换行，需要手动刷新缓冲区
        use std::io::Write;
        io::stdout().flush().unwrap();

        let mut guess = String::new();
        io::stdin()
            .read_line(&mut guess)
            .expect("读取输入失败");

        let guess: u32 = match guess.trim().parse() {
            Ok(num) if (1..=100).contains(&num) => num,
            Ok(_) => { println!("请输入 1~100 之间的数字"); continue; }
            Err(_) => { println!("这不是有效数字，再试一次"); continue; }
        };

        match guess.cmp(&secret) {
            Ordering::Less    => println!("太小了 ↑"),
            Ordering::Greater => println!("太大了 ↓"),
            Ordering::Equal   => {
                println!("🎉 答对了！你用了 {} 次", attempt);
                return;
            }
        }
    }

    println!("机会用完了，答案是 {}", secret);
}
```

运行：

```bash
cargo new guessing_game && cd guessing_game
# 把 rand 加进 Cargo.toml，替换 src/main.rs
cargo run
```

<Callout type="tip" title="为什么用 return 而不是 break" text="这里 `return` 会直接结束 main；如果写成 `break`，循环之后还会执行「机会用完了」的打印。`return` / 标志位 / 把循环包进函数，都是常见解法。" />

## 常见坑

| 现象 | 原因 |
| --- | --- |
| 提示语不显示 | `print!` 不换行会缓冲，要 `io::stdout().flush()` |
| 每次输入都拼在上一次后面 | `String::new()` 写在了 loop 外面 |
| 输入字母程序就崩 | 用了 `.unwrap()`，应改成 `match ... Err => continue` |
| 比较报类型错误 | 忘了给 `secret` 或 `guess` 标注同一个整数类型 |

<Predict no="39-1" q="用户输入 `abc` 时，这段程序会怎样？" :options='["panic 退出", "打印提示并继续下一轮循环", "把 abc 当成 0 处理", "编译失败"]' answer="1" output="这不是有效数字，再试一次" explain="parse() 返回 Err，match 分支里 continue 跳到下一轮，程序不会崩。" />

<Quiz no="39-2" q="`read_line(&mut guess)` 为什么传可变引用？" :options='["因为函数要往 String 里追加读到的内容", "因为 stdin 是全局变量", "因为 Rust 不允许传不可变引用", "因为要清空输入缓冲区"]' answer="0" explain="read_line 会把用户输入追加到传入的 String 末尾，因此需要 &mut。" />

<Exercise title="加一个难度选择" task="让程序启动时询问难度（1 简单 / 2 困难），简单模式范围 1~50 且 10 次机会，困难模式范围 1~200 且 5 次机会。把「范围」和「次数」提取成变量，不要复制两份主循环。" hints='["用 (u32, u32) 元组保存范围和次数", "gen_range(1..=max) 里的 max 换成变量", "主循环用 for attempt in 1..=max_tries"]' solution="let (max, max_tries): (u32, u32) = match read_choice().as_str() {\n    &quot;1&quot; => (50, 10),\n    _      => (200, 5),\n};\nlet secret = rand::thread_rng().gen_range(1..=max);\nfor attempt in 1..=max_tries { /* 原有循环逻辑，提示改用 max */ }" explain="把变化的部分抽成数据，主逻辑只留一份 —— 这就是最朴素的「消除重复」。" />

## 扩展挑战

- 记录历史猜测并打印「你猜过：3, 50, 27」（用 `Vec<u32>`）。
- 用二分策略实现一个「电脑自己猜」的模式，体会循环不变式。
- 把游戏逻辑抽成 `fn play(range: u32, tries: u32) -> bool`，给它写单元测试。

<CheckList id="guess-check" title="验收清单" :items='["程序能正常运行并给出大小提示", "输入非数字不会崩溃", "超出范围会提示而非误判", "猜对和次数用完都有明确结局"]' />

[下一个项目：第 40 讲 mini-grep 文件搜索 →](/projects/mini-grep.md)
