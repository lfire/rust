---
title: 第 02 讲 · 装好你的 Rust 环境
description: 安装 rustup、cargo、编辑器插件，并验证环境可用；不会装也能先用在线 Playground。
---

<StageHeader stage="L0 · 第 02 讲" level="★☆☆☆☆" time="15 分钟" goal="本地能编译并运行 Rust" prereq="无" />

# 第 02 讲 · 装好你的 Rust 环境

学编程的第一道坎往往不是语法，而是环境。这一节只做一件事：让你的电脑上出现一个能跑的 `cargo`。

## 先认识三个名字

| 名字 | 是什么 | 类比 |
| --- | --- | --- |
| `rustc` | Rust 编译器，把 `.rs` 源文件变成可执行程序 | 把菜谱变成菜 |
| `cargo` | 项目管家：建项目、装依赖、编译、运行、测试 | npm / pip + 构建工具 |
| `rustup` | 工具链管理器：安装和切换 Rust 版本 | nvm / pyenv |

日常你几乎只用 `cargo`，它会在背后替你调用 `rustc`。

## 分步安装

<StepBox title="安装 Rust 工具链" :steps='[{"title":"安装 rustup","body":"macOS / Linux 打开终端执行下方代码块里的 curl 命令。Windows 到 rustup.rs 下载 `rustup-init.exe` 双击运行。","tip":"安装过程一路回车用默认选项即可。"},{"title":"让命令生效","body":"安装完成后重开一个终端，或执行 `source $HOME/.cargo/env`。","tip":"如果输入 cargo 提示 command not found，多半就是这一步没做。"},{"title":"验证版本","body":"依次运行 `rustc --version` 和 `cargo --version`，能看到版本号和日期就成功了。","tip":"形如 rustc 1.8x.0 (xxxxx 2025-xx-xx)。"},{"title":"装编辑器","body":"安装 VS Code，再装扩展 `rust-analyzer`。它会实时标出类型、报错和补全。","tip":"不要装名字叫 Rust 的老扩展，rust-analyzer 才是现在的官方推荐。"},{"title":"建一个项目验证","body":"执行 `cargo new hello` 然后 `cd hello` 再 `cargo run`，屏幕应输出 Hello, world!","tip":"这一步跑通，环境就算完全就绪了。"}]' />

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 验证
rustc --version
cargo --version

# 第一个项目
cargo new hello
cd hello
cargo run
```

<Callout type="warn" title="暂时不想装？" text="完全可以。本站每个 Rust 代码块左上角的「在线运行」按钮会打开官方 Rust Playground，零安装就能跑代码。建议先在 Playground 学完 L0～L2，等确定要继续了再回来装本地环境。" />

## 认识 `cargo new` 生成了什么

```text
hello/
├── Cargo.toml        # 项目配置：名字、版本、依赖
├── Cargo.lock        # 依赖的精确版本（自动生成，别手改）
└── src/
    └── main.rs       # 程序入口
```

`Cargo.toml` 长这样，现在只需要看得懂「依赖写在 `[dependencies]` 下面」：

```toml
[package]
name = "hello"
version = "0.1.0"
edition = "2021"

[dependencies]
```

<ConceptDiagram type="cargo" title="Cargo 帮你把依赖、编译、运行串成一条流水线" />

## 五条最常用的命令

| 命令 | 作用 |
| --- | --- |
| `cargo new 项目名` | 新建项目 |
| `cargo run` | 编译并运行 |
| `cargo build` | 只编译，产物在 `target/debug/` |
| `cargo check` | 只检查能否编译，速度最快，写代码时常用 |
| `cargo test` | 跑测试 |

<Callout type="tip" title="小技巧" text="写一会儿就随手 `cargo check` 一次。它比 `cargo build` 快很多，能让你在几秒内知道代码有没有写错，非常适合新手养成「小步验证」的习惯。" />

<Quiz no="02-1" q="想最快地确认「代码能不能通过编译」，应该用哪条命令？" :options='["cargo run", "cargo build", "cargo check", "cargo new"]' answer="2" explain="cargo check 只做类型检查、不生成可执行文件，因此最快；cargo run 和 cargo build 都要完整编译链接。" />

<Quiz no="02-2" q="关于 rustup / cargo / rustc，下面哪些说法是对的？" :options='["rustup 用来安装和切换 Rust 版本", "cargo 会替你管理依赖并调用编译器", "每次改代码都必须手动运行 rustc，cargo 帮不上忙", "Cargo.toml 里写项目依赖"]' answer="0,1,3" multi="true" explain="日常只需要 cargo；rustc 由 cargo 在背后调用，不需要手动执行。" />

## 环境自检

<CheckList id="setup-check" title="开工前打个勾" :items='["rustc --version 能输出版本号", "cargo --version 能输出版本号", "cargo new hello 成功创建了目录", "cargo run 打印出了 Hello, world!", "编辑器装好了 rust-analyzer"]' />

<Exercise title="自己动手" task="用 cargo 新建一个名为 `my-first` 的项目，把 `main.rs` 里打印的文字改成你的名字，再运行一次。" hints='["命令是 cargo new my-first，然后用 cd 进入目录", "字符串写在 println! 的引号里"]' solution="cargo new my-first\ncd my-first\n# 编辑 src/main.rs：\nfn main() {\n    println!(&quot;你好，我是小明&quot;);\n}\ncargo run" explain="改完保存，回到终端执行 cargo run 就能看到新输出。" />

[下一节：写下第一行 Rust 代码 →](/guide/hello.md)
