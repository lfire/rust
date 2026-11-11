---
title: 第 15 讲 · 阶段综合 · 写一个成绩统计程序
description: 把 L2 的变量、类型、函数、控制流、match、Cargo 测试串成一个完整小程序，并做一次代码评审。
---

<StageHeader stage="L2 · 第 15 讲" level="★★☆☆☆" time="60 分钟" goal="独立写出并测试一个几十行的完整程序" prereq="L2 全部" />

# 第 15 讲 · 阶段综合 · 写一个成绩统计程序

学完 L2 前几讲的语法零件，是时候把它们装成一台能跑的机器了。这一讲不引入新知识，只做三件事：**写一个完整程序 → 写测试 → 回头评审自己的代码**。

## 需求

读取一组学生成绩（姓名 + 分数），输出：

- 平均分、最高分、最低分
- 每个学生的等级（优秀 / 及格 / 不及格）
- 按分数从高到低排序后的表格
- 空输入、非法分数要有明确处理，不能 panic

<StepBox title="分步实现" :steps='[{"title":"建模","body":"`struct Student { name: String, score: i32 }`，等级用 enum Grade 表达。","tip":"先定类型，再写逻辑 —— 这是 Rust 最舒服的顺序。"},{"title":"写纯函数","body":"`fn average(&amp;[Student]) -&gt; Option&lt;f64&gt;`、`fn grade(score) -&gt; Grade`、排序单独一个函数。","tip":"纯函数不碰 IO，才能被单元测试直接调用。"},{"title":"解析输入","body":"`fn parse(line: &amp;str) -&gt; Result&lt;Student, String&gt;`，空行、缺字段、非数字、越界都给可读错误。","tip":"用 Result 而不是 unwrap，是这一讲的重点验收项。"},{"title":"主流程","body":"main 里读样例数据、逐行解析、收集 Vec、调用各函数、格式化打印。"},{"title":"补测试","body":"至少四个用例：正常、空输入、非法数字、分数越界。"},{"title":"评审","body":"对照下面的评审清单逐条检查，改掉至少两处。"}]' />

## 完整代码

```rust
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
struct Student {
    name: String,
    score: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Grade {
    Excellent,
    Pass,
    Fail,
}

impl fmt::Display for Grade {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Grade::Excellent => "优秀",
            Grade::Pass => "及格",
            Grade::Fail => "不及格",
        };
        write!(f, "{}", s)
    }
}

fn grade(score: i32) -> Grade {
    match score {
        90..=100 => Grade::Excellent,
        60..=89  => Grade::Pass,
        _        => Grade::Fail,
    }
}

fn average(list: &[Student]) -> Option<f64> {
    if list.is_empty() { return None; }
    let sum: i32 = list.iter().map(|s| s.score).sum();
    Some(sum as f64 / list.len() as f64)
}

fn parse(line: &str) -> Result<Student, String> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return Err("空行或注释".into());
    }
    let mut parts = line.split(',');
    let name = parts.next().unwrap_or("").trim().to_string();
    let raw = parts.next().ok_or("缺少分数字段")?.trim();
    if name.is_empty() { return Err("姓名为空".into()); }
    if parts.next().is_some() { return Err("字段过多".into()); }

    let score: i32 = raw.parse().map_err(|_| format!("不是有效分数：{}", raw))?;
    if !(0..=100).contains(&score) {
        return Err(format!("分数越界：{}", score));
    }
    Ok(Student { name, score })
}

fn report(input: &str) -> (Vec<Student>, Vec<String>) {
    let mut students = Vec::new();
    let mut errors = Vec::new();
    for (i, line) in input.lines().enumerate() {
        match parse(line) {
            Ok(s) => students.push(s),
            Err(e) => errors.push(format!("第 {} 行：{}", i + 1, e)),
        }
    }
    students.sort_by(|a, b| b.score.cmp(&a.score).then(a.name.cmp(&b.name)));
    (students, errors)
}

fn main() {
    let input = "\
# 姓名,分数
小明,95
小红,58
小刚,73
小丽,101
坏数据,abc
小美,88";

    let (students, errors) = report(input);
    for e in &errors { eprintln!("跳过：{}", e); }
    if students.is_empty() {
        eprintln!("没有有效成绩");
        return;
    }

    println!("{:<8} {:>6}  {}", "姓名", "分数", "等级");
    for s in &students {
        println!("{:<8} {:>6}  {}", s.name, s.score, grade(s.score));
    }

    let avg = average(&students).unwrap();
    let max = students.iter().map(|s| s.score).max().unwrap();
    let min = students.iter().map(|s| s.score).min().unwrap();
    println!("\n共 {} 人，平均 {:.1}，最高 {}，最低 {}", students.len(), avg, max, min);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_line() {
        assert_eq!(parse("小明,95").unwrap(), Student { name: "小明".into(), score: 95 });
    }

    #[test]
    fn rejects_bad_input() {
        assert!(parse("小明,abc").is_err());
        assert!(parse("小明,101").is_err());
        assert!(parse("小明").is_err());
        assert!(parse("").is_err());
    }

    #[test]
    fn empty_average_is_none() {
        assert_eq!(average(&[]), None);
    }

    #[test]
    fn report_sorts_desc_and_collects_errors() {
        let (s, e) = report("甲,60\n乙,90\n丙,abc");
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].name, "乙");
        assert_eq!(e.len(), 1);
    }

    #[test]
    fn grade_boundaries() {
        assert_eq!(grade(90), Grade::Excellent);
        assert_eq!(grade(89), Grade::Pass);
        assert_eq!(grade(59), Grade::Fail);
    }
}
```

```bash
cargo test     # 5 个用例全绿
cargo run
```

<Callout type="idea" title="为什么要先写纯函数" text="`average` / `grade` / `parse` / `report` 都不碰 IO，所以能直接在 `#[cfg(test)]` 里调用。如果把所有逻辑塞进 main，就只能靠端到端跑一遍看输出 —— 那是脚本，不是可维护的程序。" />

## 代码评审清单

对照原教材「期中测试：参考实现讲解」的思路，逐条检查自己的实现：

| 检查项 | 常见扣分点 |
| --- | --- |
| 错误处理 | 用 `unwrap()` 处理用户输入；错误没带行号 |
| 边界 | 忘了空输入、0 分、100 分、多余逗号 |
| 命名 | `a` / `b` / `tmp` 满天飞；函数同时做了解析和打印 |
| 重复 | 最高/最低各写一遍循环，而不是用迭代器 |
| 类型 | 等级用字符串硬编码，而不是 enum |
| 测试 | 只测了正常路径，没测非法输入 |

<Predict no="15-1" q="`average(&[])` 返回什么？" :options='["0.0", "None", "NaN", "panic"]' answer="1" output="None" explain="空列表没有平均值，用 Option 显式表达「没有」，比返回 0 更诚实。" />

<Quiz no="15-2" q="把解析逻辑放进 `parse()` 而不是 main，最大好处是？" :options='["代码更短", "纯函数可单元测试，且不依赖 IO", "编译更快", "可以不用 Result"]' answer="1" explain="可测试性与职责分离是这一讲的核心训练目标。" />

<Exercise title="加中位数与及格率" task="新增 `fn median(&amp;[Student]) -&gt; Option&lt;f64&gt;` 和 `fn pass_rate(&amp;[Student]) -&gt; Option&lt;f64&gt;`，并在输出里打印；各补一个单元测试（偶数个数据时中位数取中间两数平均）。" hints='["中位数要先排序，可以用传入已排序的切片或内部克隆后排序", "偶数个取 (a+b)/2，注意转 f64 后再除", "空列表仍返回 None"]' solution="fn median(sorted: &amp;[Student]) -&gt; Option&lt;f64&gt; {\n    let n = sorted.len();\n    if n == 0 { return None; }\n    let mid = n / 2;\n    Some(if n % 2 == 0 {\n        (sorted[mid - 1].score + sorted[mid].score) as f64 / 2.0\n    } else {\n        sorted[mid].score as f64\n    })\n}\n\nfn pass_rate(list: &amp;[Student]) -&gt; Option&lt;f64&gt; {\n    if list.is_empty() { return None; }\n    let n = list.iter().filter(|s| s.score &gt;= 60).count();\n    Some(n as f64 / list.len() as f64 * 100.0)\n}" explain="注意 median 依赖已排序切片；在签名或注释里写清前置条件，比在函数里偷偷排序更好。" />

## 扩展挑战

- 把输入改成从文件 / stdin 读取，错误用 `anyhow::Context` 加上下文。
- 用 `clap` 加 `--sort-by name|score` 与 `--min-score` 过滤。
- 输出 CSV / JSON（串起 [第 42 讲 待办清单](/projects/todo-cli.md) 的 serde 用法）。
- 用 `proptest` 做属性测试：任意输入都不应 panic。

<CheckList id="capstone-check" title="验收清单" :items='["cargo test 全部通过且覆盖非法输入", "程序不因坏数据 panic", "至少有一个 enum 表达业务概念", "逻辑拆成可单测的纯函数", "按评审清单改掉了至少两处问题"]' />

[上一讲：第 14 讲 Cargo 与项目结构 →](/basics/cargo.md) · [接下来：所有权初体验（补充）→](/basics/ownership-first-look.md) · [进入阶段三：核心机制 →](/core/)
