---
title: 第 43 讲 · CLI 工程化
description: 给命令行工具补上子命令、退出码、配置分层、集成测试与发布流程，从能跑变成能交付。
---

<StageHeader stage="L5 · 第 43 讲" level="★★★☆☆" time="65 分钟" goal="写出符合命令行惯例、可测试可发布的 CLI" prereq="第 40 讲 mini-grep + L3 错误处理" />

# 第 43 讲 · CLI 工程化

[第 40 讲 mini-grep](/projects/mini-grep.md) 已经能搜索文件，但还只是「一个能跑的 main」。真实 CLI 要能被脚本调用、能被 CI 测试、能给用户清晰的错误，还要能装到别人机器上。这一讲把这些补齐。

## 命令行工具的六条惯例

| 惯例 | 做法 | 为什么 |
| --- | --- | --- |
| 正常输出走 stdout | `println!` | 可被管道 / 重定向消费 |
| 错误走 stderr | `eprintln!` | 不污染正常输出 |
| 退出码 | 成功 0、用法错 2、运行错 1 | 脚本靠它判断成败 |
| `--help` / `--version` | clap 自动生成 | 用户不用查文档 |
| 配置分层 | 默认 < 配置文件 < 环境变量 < 参数 | 本地与 CI 都能用 |
| 错误带上下文 | `anyhow::Context` | 用户能自己定位 |

<Callout type="idea" title="把 main 变薄" text="`fn main()` 只做三件事：解析参数、调用 `run()`、把错误打印到 stderr 并设置退出码。所有逻辑放在返回 `Result` 的函数里 —— 这样既能单测，也保证错误只有一条出口。" />

## 依赖与结构

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
anyhow = "1"
serde = { version = "1", features = ["derive"] }
toml = "0.8"

[dev-dependencies]
assert_cmd = "2"
predicates = "3"
```

```text
cli-tool/
├── Cargo.toml
├── src/
│   ├── main.rs       # 薄入口
│   ├── cli.rs        # 参数定义
│   └── lib.rs        # 业务逻辑
└── tests/cli.rs      # 端到端测试
```

<StepBox title="分步实现" :steps='[{"title":"定义子命令","body":"用 `#[derive(Parser)]` + `#[derive(Subcommand)]` 组织 search / config / completion 三个子命令。","tip":"clap 自动产出 --help 与参数错误提示。"},{"title":"薄 main","body":"`if let Err(e) = run() { eprintln!(\"错误：{:#}\", e); process::exit(code) }`。","tip":"用自定义错误携带退出码，别一律返回 1。"},{"title":"配置分层","body":"读 config.toml，再用环境变量与命令行参数逐层覆盖。","tip":"优先级写进 --help 的说明里。"},{"title":"集成测试","body":"`assert_cmd::Command::cargo_bin(...)` 断言 stdout、stderr 与退出码。","tip":"测试要覆盖成功与失败两条路径。"},{"title":"发布优化","body":"release 构建加 strip / lto，测二进制体积与冷启动时间。"},{"title":"分发","body":"`cargo install --path .` 本地验证，或 GitHub Actions 出多平台二进制。"}]' />

## 完整代码

```rust
// src/main.rs
use clap::Parser;
use std::process;

mod cli;
use cli::{Cli, Command};

#[derive(Debug)]
struct AppError { message: String, code: i32 }

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

fn run() -> Result<(), AppError> {
    let cli = Cli::parse();
    match cli.command {
        Command::Search { pattern, path, ignore_case } => {
            let text = std::fs::read_to_string(&path).map_err(|e| AppError {
                message: format!("读取 {} 失败：{}", path.display(), e),
                code: 1,
            })?;
            let hits: Vec<String> = text
                .lines()
                .filter(|l| {
                    if ignore_case {
                        l.to_lowercase().contains(&pattern.to_lowercase())
                    } else {
                        l.contains(&pattern)
                    }
                })
                .map(|s| s.to_string())
                .collect();

            if hits.is_empty() {
                eprintln!("没有匹配");
                return Err(AppError { message: String::new(), code: 2 });
            }
            for h in hits { println!("{}", h); }
            Ok(())
        }
        Command::Config { key } => {
            match key.as_deref() {
                Some(k) => println!("{}={}", k, std::env::var(k).unwrap_or_default()),
                None => println!("使用配置文件或环境变量提供配置"),
            }
            Ok(())
        }
    }
}

fn main() {
    if let Err(e) = run() {
        if !e.message.is_empty() { eprintln!("错误：{}", e); }
        process::exit(e.code);
    }
}
```

```rust
// src/cli.rs
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "cli-tool", version, about = "一个工程化的命令行示例")]
pub struct Cli {
    /// 配置文件路径
    #[arg(short, long, global = true)]
    pub config: Option<PathBuf>,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// 在文件里搜索关键词
    Search {
        pattern: String,
        path: PathBuf,
        #[arg(short, long)]
        ignore_case: bool,
    },
    /// 查看配置
    Config {
        key: Option<String>,
    },
}
```

```rust
// tests/cli.rs
use assert_cmd::Command;
use predicates::prelude::*;

#[test]
fn help_works() {
    Command::cargo_bin("cli-tool").unwrap()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Search"));
}

#[test]
fn missing_file_reports_error_and_code_1() {
    Command::cargo_bin("cli-tool").unwrap()
        .args(["search", "rust", "/definitely/not/here"])
        .assert()
        .code(1)
        .stderr(predicate::str::contains("读取"));
}

#[test]
fn no_match_uses_code_2() {
    // 准备一个不含关键词的临时文件后断言退出码 2
    let dir = std::env::temp_dir();
    let path = dir.join("cli_tool_empty.txt");
    std::fs::write(&path, "hello\n").unwrap();
    Command::cargo_bin("cli-tool").unwrap()
        .args(["search", "zzz", path.to_str().unwrap()])
        .assert()
        .code(2);
    std::fs::remove_file(path).ok();
}
```

```bash
cargo test
cargo run -- --help
cargo run -- search rust Cargo.toml -i
cargo build --release && ls -lh target/release/cli-tool
```

## 发布优化

```toml
[profile.release]
strip = true
lto = true
codegen-units = 1
panic = "abort"     # CLI 不需要展开，体积更小
```

| 项 | 参考 |
| --- | --- |
| 冷启动 | Rust 原生二进制通常 < 5 ms，Node/Python CLI 常高一个量级 |
| 二进制体积 | strip + lto 后可压到几百 KB～几 MB，取决于依赖树 |
| 分发 | `cargo install`、GitHub Releases 多平台二进制、Homebrew tap |

<Callout type="warn" title="退出码别一律用 1" text="脚本经常靠退出码区分「用法错」与「运行错」：参数缺失 / 无匹配给 2，IO 失败给 1，成功 0。`assert_cmd` 的 `.code(n)` 能把这条约定固化成测试，防止以后被无意改坏。" />

<Quiz no="43-1" q="为什么错误输出要写 stderr 而不是 stdout？" :options='["stderr 打印更快", "正常输出可被管道消费，错误信息不应混进数据流", "Rust 要求", "stdout 有长度限制"]' answer="1" explain="这是 Unix 工具链的基本约定，也是脚本组合能正常工作的前提。" />

<Quiz no="43-2" q="把 main 写成薄入口、逻辑放 `run() -&gt; Result`，主要收益是？" :options='["编译更快", "错误只有一条出口且业务逻辑可测试", "可以不用 clap", "自动支持多线程"]' answer="1" explain="薄 main 让退出码与错误格式集中处理，逻辑则能被集成测试直接覆盖。" />

<Exercise title="加 shell 补全子命令" task="用 `clap_complete` 生成 bash / zsh 补全脚本：加子命令 `completion --shell bash`，把结果输出到 stdout，并写一个集成测试断言输出里包含 `cli-tool`。" hints='["依赖 clap_complete = 4", "用 clap_complete::generate(Shell::Bash, &amp;mut Cli::command(), ...) 写到 stdout", "测试用 predicate::str::contains 检查关键字符串"]' solution="Command::Completion { shell } =&gt; {\n    let mut cmd = Cli::command();\n    let name = cmd.get_name().to_string();\n    clap_complete::generate(shell, &amp;mut cmd, name, &amp;mut std::io::stdout());\n    Ok(())\n}" explain="补全脚本输出到 stdout，用户可重定向到文件；别写成默认落盘，那样脚本组合会变麻烦。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `assert_cmd` 找不到二进制 | `Command::cargo_bin` 的名字要等于 `[[bin]]` 或 package name |
| 退出码总是 0 | 忘了 `process::exit`，或错误被 `let _ = run()` 吞掉 |
| `--help` 缺子命令说明 | 给枚举变体与字段补 `///` 文档注释 |
| 配置文件找不到就崩 | 首次运行无配置是正常情况，返回默认值 |
| release 体积过大 | 检查是否误引入 GUI / TLS 全家桶依赖，开 strip + lto |

## 扩展挑战

- 加 `--json` 输出模式，方便其他程序解析（对照 [第 49 讲 数据工具](/projects/sql-data-tool.md)）。
- 用 `clap_mangen` 生成 man page，用 `clap_complete` 生成四种 shell 补全。
- 在 CI 里用 `cargo-dist` / `cross` 出 linux / macOS / Windows 三平台二进制。
- 加 `tracing` 结构化日志到 stderr，用 `RUST_LOG` 控制级别。
- 对照 [第 57 讲 软件架构、生态与持续精进](/projects/production.md)，补 CHANGELOG 与 ADR。

<CheckList id="cli-eng-check" title="验收清单" :items='["--help 与 --version 正常", "子命令与参数校验可用", "stdout / stderr 分离且退出码有区分", "cargo test 覆盖成功与失败路径", "release 体积与启动时间有实测数据"]' />

[上一个项目：第 42 讲 待办清单 →](/projects/todo-cli.md) · [下一个项目：第 44 讲 图片服务器 →](/projects/image-server.md)
