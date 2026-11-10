---
title: 第 40 讲 · mini-grep 文件搜索
description: 一个真正的命令行工具：参数解析、读文件、大小写开关、退出码与单元测试。
---

<StageHeader stage="L5 · 第 40 讲" level="★★☆☆☆" time="60 分钟" goal="做出符合命令行惯例、可测试的工具" prereq="L2 + L3 错误处理" />

# 第 40 讲 · mini-grep 文件搜索

**场景**：在文件里搜索关键词并打印匹配行。这是经典的教学项目（原始课程的期中测试也是它），因为它麻雀虽小、五脏俱全：**参数 → 读取 → 处理 → 输出 → 错误 → 测试**。

## 你会练到什么

- 用 `clap` 的 derive 宏解析命令行参数
- `Result` + `?` 做一条完整的错误链
- 把「配置」「逻辑」「入口」拆开，让核心函数可单测
- 环境变量控制行为、退出码告知调用方
- 写第一个真正意义上的集成测试

## 依赖与结构

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
anyhow = "1"
```

```text
mini-grep/
├── Cargo.toml
├── src/
│   ├── main.rs     # 入口：解析参数、处理错误
│   └── lib.rs      # 配置 + 搜索逻辑（便于测试）
└── tests/
    └── cli.rs      # 集成测试
```

<Callout type="idea" title="为什么要拆 lib.rs" text="把逻辑放进库、让 main 只做「读参数 + 调库」，是 Rust 项目最常见的结构。好处是核心逻辑能被单元测试，将来同一份代码还能被别的二进制或 Web 服务复用。" />

<StepBox title="分步实现" :steps='[{"title":"定义参数结构体","body":"用 `#[derive(Parser)] struct Cli { query: String, path: PathBuf, #[arg(short, long)] ignore_case: bool }`。","tip":"clap 会自动生成 --help 和友好的参数错误提示。"},{"title":"拆出 Config","body":"`pub struct Config { query, file_path, ignore_case }`，写一个 `impl Config { pub fn build(args: &Cli) -&gt; Result&lt;Self&gt; }`。","tip":"先别急着加校验，留一个返回 Result 的位置，之后补校验很自然。"},{"title":"实现 search","body":"`pub fn search&lt;F&gt;(query: &str, content: &str, matcher: F) -&gt; Vec&lt;&str&gt;`，遍历 `content.lines()` 收集匹配行。","tip":"返回借用 content 的切片，零拷贝；这也是生命周期的实际应用。"},{"title":"错误链","body":"main 里 `fn run() -&gt; anyhow::Result&lt;()&gt;`，`fs::read_to_string(&amp;config.file_path)?`，失败时打印到 stderr 并设置退出码。","tip":"用 std::process::exit(1) 让脚本能感知失败。"},{"title":"加测试","body":"在 lib.rs 的 #[cfg(test)] 里写三个用例：大小写敏感、忽略大小写、无匹配。"}]' />

## 完整代码

```rust
// src/main.rs
use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use std::process;

#[derive(Parser, Debug)]
#[command(name = "mini-grep", about = "在文件里搜索关键词")]
struct Cli {
    /// 要搜索的关键词
    query: String,
    /// 文件路径
    path: PathBuf,
    /// 忽略大小写
    #[arg(short, long)]
    ignore_case: bool,
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    let ignore_case = cli.ignore_case || std::env::var("IGNORE_CASE").is_ok();
    let content = std::fs::read_to_string(&cli.path)
        .map_err(|e| anyhow::anyhow!("读取 {} 失败：{}", cli.path.display(), e))?;

    let matched = mini_grep::search(&cli.query, &content, ignore_case);

    if matched.is_empty() {
        eprintln!("没有找到匹配的行");
        process::exit(2);
    }
    for (i, line) in matched {
        println!("{}:{}", i, line);
    }
    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("错误：{:#}", e);
        process::exit(1);
    }
}
```

```rust
// src/lib.rs
pub struct Config {
    pub query: String,
    pub ignore_case: bool,
}

/// 返回 (行号, 行内容) 的列表；行内容借用 content，不做拷贝。
pub fn search<'a>(
    query: &str,
    content: &'a str,
    ignore_case: bool,
) -> Vec<(usize, &'a str)> {
    let needle = if ignore_case { query.to_lowercase() } else { query.to_string() };

    content
        .lines()
        .enumerate()
        .filter(|(_, line)| {
            let hay = if ignore_case { line.to_lowercase() } else { line.to_string() };
            hay.contains(&needle)
        })
        .map(|(i, line)| (i + 1, line))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEXT: &str = "Rust is fast\nrust is safe\nGo is fine";

    #[test]
    fn case_sensitive() {
        assert_eq!(search("Rust", TEXT, false).len(), 1);
    }

    #[test]
    fn case_insensitive() {
        assert_eq!(search("rust", TEXT, true).len(), 2);
    }

    #[test]
    fn no_match() {
        assert!(search("python", TEXT, false).is_empty());
    }
}
```

```bash
cargo run -- Rust poem.txt
cargo run -- -i rust poem.txt
IGNORE_CASE=1 cargo run -- rust poem.txt
cargo test
cargo run -- --help
```

<ConceptDiagram type="error" title="读取文件、解析参数、搜索结果三处错误，统一汇入 run() 的错误链" />

## 命令行工具的四条惯例

1. 正常输出走 **stdout**，错误走 **stderr**（`eprintln!`）。
2. 成功返回 `0`，失败返回非 0 退出码，方便脚本串联。
3. 提供 `--help`，参数错误时给出可读提示（`clap` 免费给）。
4. 支持环境变量作为「不改变命令行的配置开关」。

<Quiz no="40-1" q="为什么把搜索逻辑放进 lib.rs？" :options='["main.rs 不能写函数", "让核心逻辑可以被单元测试、也可被其他程序复用", "这样编译更快", "clap 要求必须这样"]' answer="1" explain="库 + 薄入口是 Rust 项目的标准结构，可测试性与复用性都更好。" />

<Quiz no="40-2" q="`search` 返回 `Vec&lt;(usize, &str)&gt;` 里的引用，指向谁？" :options='["函数内部新建的 String", "传入的 content 参数", "静态字符串", "堆上复制的副本"]' answer="1" explain="返回值借用 content，因此签名里必须标注生命周期 a，说明引用的存活范围跟着 content。" />

<Predict no="40-3" q="文件不存在时，这个程序会？" :options='["panic 并打印栈回溯", "在 stderr 打印错误并以退出码 1 结束", "静默结束，退出码 0", "创建一个空文件"]' answer="1" output="错误：读取 xxx 失败：No such file or directory (os error 2)" explain="run() 用 ? 把错误交给 main，main 打印到 stderr 后 process::exit(1)。" />

<Exercise title="补全一个功能" task="加 `--invert` 参数：只打印**不**包含关键词的行。要求复用同一个 search 函数，不要复制过滤逻辑。" hints='["给 Cli 加一个 bool 字段", "把 invert 作为参数传进 search", "filter 里返回 found ^ invert（异或）"]' solution="let found = hay.contains(&needle);\nif invert { !found } else { found }" explain="用一个布尔参数控制谓词取反，比复制整段迭代好维护。" />

## 扩展挑战

- 支持 `-n` 只输出行号、`-c` 只输出匹配计数。
- 用 `regex` crate 支持正则，比较它在性能与功能上的取舍。
- 递归遍历目录（`walkdir`），把单文件工具升级成项目级搜索。
- 加基准测试（`criterion`），看看 `to_lowercase()` 在大文件上的开销。

<CheckList id="minigrep-check" title="验收清单" :items='["--help 能显示参数说明", "大小写开关与环境变量都生效", "错误输出到 stderr 且退出码非 0", "cargo test 三个用例全绿"]' />

[下一个项目：第 41 讲 网页抓取转 Markdown →](/projects/scrape-url.md)
