---
title: 第 41 讲 · 网页抓取转 Markdown
description: 复刻原课程的第一个实用程序，并把 unwrap 重构成可交付的错误处理与 CLI。
---

<StageHeader stage="L5 · 第 41 讲" level="★★☆☆☆" time="50 分钟" goal="第一次真正用外部 crate，并学会检查 HTTP 状态" prereq="L2 Cargo + L3 Result" />

# 第 41 讲 · 网页抓取转 Markdown

**场景**：给一个 URL，抓下网页 HTML，转成 Markdown 存成文件。这个例子来自原始教材的开篇第一课 —— 它一口气展示了 Cargo 依赖、HTTP 客户端、文件写入和宏，是理解「Rust 项目长什么样」的绝佳样本。我们把它重构成对零基础更友好的版本，并补上原版省略的错误处理。

## 你会练到什么

- 在 `Cargo.toml` 里配置带 feature 的依赖
- `reqwest::blocking` 发同步 HTTP 请求
- 检查状态码、设置超时与 User-Agent
- `Result` + `?` + `context()` 组装可读错误
- 把「一次性的脚本」重构成可传参的 CLI

## 依赖

```toml
[dependencies]
reqwest = { version = "0.11", features = ["blocking"] }
html2md = "0.2"
anyhow = "1"
clap = { version = "4", features = ["derive"] }
```

<Callout type="tip" title="关于版本" text="直接使用原教材里的 reqwest 0.11 / html2md 0.2 便于对照学习；新项目可换成 reqwest 0.12（默认使用 rustls）。API 基本一致，遇到编译提示再调整即可。" />

## 先看原版（十行跑通）

```rust
use std::fs;

fn main() {
    let url = "https://www.rust-lang.org/";
    let output = "rust.md";

    println!("Fetching url: {}", url);
    let body = reqwest::blocking::get(url).unwrap().text().unwrap();
    println!("Converting html to markdown...");
    let md = html2md::parse_html(&body);
    fs::write(output, md.as_bytes()).unwrap();
    println!("Converted markdown has been saved in {}.", output);
}
```

这段代码能跑，但有三处 `.unwrap()`：网络断了、站点返回 404、文件写不进去，任何一种都会 panic。真实工具不能这样。

<CodeTabs title="从脚本到工具" :tabs='[{"label":"原版：unwrap 三连","code":"let body = reqwest::blocking::get(url).unwrap().text().unwrap();\nlet md = html2md::parse_html(&body);\nfs::write(output, md).unwrap();","note":"演示够用，上线不行"},{"label":"重构：错误可解释","code":"let resp = client.get(url).send()?.error_for_status()?;\nlet md = html2md::parse_html(&resp.text()?);\nfs::write(path, md).context(\"保存文件失败\")?;","note":"每步都有上下文，失败原因清楚"}]' />

## 完整代码（重构版）

```rust
use anyhow::{Context, Result};
use clap::Parser;
use std::{fs, path::PathBuf, time::Duration};

#[derive(Parser, Debug)]
#[command(about = "把网页转成 Markdown 文件")]
struct Args {
    /// 目标网址
    url: String,
    /// 输出文件
    #[arg(short, long, default_value = "output.md")]
    output: PathBuf,
}

fn build_client() -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent("rust-zero-to-builder/1.0")
        .timeout(Duration::from_secs(15))
        .build()
        .context("创建 HTTP 客户端失败")
}

fn scrape(url: &str) -> Result<String> {
    let client = build_client()?;
    let resp = client
        .get(url)
        .send()
        .with_context(|| format!("请求 {} 失败", url))?
        .error_for_status()                    // 4xx / 5xx 变成 Err
        .with_context(|| format!("{} 返回了错误状态", url))?;

    let html = resp.text().context("读取响应体失败")?;
    Ok(html2md::parse_html(&html))
}

fn run() -> Result<()> {
    let args = Args::parse();
    println!("抓取：{}", args.url);
    let md = scrape(&args.url)?;
    fs::write(&args.output, md.as_bytes())
        .with_context(|| format!("写入 {} 失败", args.output.display()))?;
    println!("已保存 {}（{} 字节）", args.output.display(), md.len());
    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("错误：{:#}", e);
        std::process::exit(1);
    }
}
```

```bash
cargo run -- https://www.rust-lang.org/ -o rust.md
head -20 rust.md
```

<Callout type="warn" title="第一次编译会比较慢" text="reqwest 会拉进 TLS、HTTP、编码等一批依赖，首次 `cargo run` 可能要一两分钟。之后增量编译就快了。这是 Rust 项目依赖图较大的正常现象，不是环境坏了。" />

<StepBox title="理解这十来行里藏着的 Rust 特性" :steps='[{"title":"Cargo 管依赖","body":"`[dependencies]` 里写 crate，Cargo 负责下载、版本解析、编译。`features` 按需开启功能。"},{"title":":: 与 .","body":"`reqwest::blocking::Client` 是路径（双冒号），`client.get(url)` 是方法调用（点号）。"},{"title":"类型推导","body":"`let md = ...` 没写类型，编译器从 parse_html 的签名推出是 String。"},{"title":"宏","body":"`println!`、`format!`、`vec!` 都带感叹号，是编译期展开的宏。"},{"title":"错误即值","body":"`?` 把 Err 提前返回，`context` 给错误加人类可读的说明。"}]' />

<ConceptDiagram type="cargo" title="Cargo 把四个外部 crate 编进同一个可执行文件" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 404 页面也被转成了 Markdown | 加 `.error_for_status()` |
| 请求一直挂着 | 用 `Client::builder().timeout(...)` |
| 部分站点返回 403 | 设置 `user_agent` |
| 中文变乱码 | `html2md` 默认按 UTF-8 处理，确认源站声明了 charset |

<Quiz no="41-1" q="`.error_for_status()` 的作用是什么？" :options='["自动重试请求", "把 4xx / 5xx 响应转成 Err", "打印 HTTP 头", "把响应体转成 Markdown"]' answer="1" explain="不加它，404 页面也会被当成正常 HTML 继续解析。" />

<Quiz no="41-2" q="`with_context(|| format!(...))` 相比 `context(&quot;...&quot;)` 的好处是？" :options='["能带上运行时的具体信息（如 URL），且只在出错时才构造字符串", "能加快请求速度", "能绕过编译检查", "能自动重试"]' answer="0" explain="闭包是惰性求值的，只有出错时才执行，适合拼接动态信息。" />

<Exercise title="加个预览开关" task="给 CLI 加 `--stdout` 参数：为 true 时把 Markdown 打印到终端而不写文件；为 false 时保持原有写文件行为。" hints='["给 Args 加 #[arg(long)] stdout: bool", "在 run() 里用 if args.stdout 分支", "写文件前可以先判断，避免创建空文件"]' solution="if args.stdout {\n    println!(&quot;{}&quot;, md);\n} else {\n    fs::write(&args.output, md.as_bytes())\n        .with_context(|| format!(&quot;写入 {} 失败&quot;, args.output.display()))?;\n    println!(&quot;已保存 {}&quot;, args.output.display());\n}" explain="命令行工具常见做法：默认落盘，加开关改走标准输出，方便管道组合。" />

## 扩展挑战

- 批量处理：接受多个 URL，用 `Vec<PathBuf>` 输出多个文件。
- 改成异步版：`reqwest` 异步 + `tokio`，用 `futures::join_all` 并发抓取（对照 L4）。
- 只提取正文：配合 `scraper` crate 按 CSS 选择器取 `<article>` 再转换。
- 加简单缓存：用 URL 的哈希做文件名，命中就不请求。

<CheckList id="scrape-check" title="验收清单" :items='["能成功抓取并生成 Markdown 文件", "404 会给出清晰错误而非 panic", "超时与 User-Agent 已配置", "--stdout 开关可用"]' />

[下一个项目：第 42 讲 待办清单（serde 持久化）→](/projects/todo-cli.md)
