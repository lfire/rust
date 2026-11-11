---
title: 第 57 讲 · 软件架构、生态与持续精进
description: F 类收尾：仓库与文档、特性管理、架构四层次、质量属性与上线清单，外加 crate 生态选型；也是进入 58–66 讲新宿主场景前的阶段性复盘。
---

<StageHeader stage="L5 · 第 57 讲" level="★★★★★" time="70 分钟" goal="能说清生产级项目的要素、会选 crate、知道接下来怎么进阶" prereq="第 56 讲 KV 第 5 步 生产化" />

# 第 57 讲 · 软件架构、生态与持续精进

这是 L5 里 **A–F 类（39–57 讲）的阶段收尾**：前面十几讲都跑在「服务器 / 本机进程」这一种宿主上，本讲把写功能之外的通用工程能力补齐 —— **一个能被团队长期维护的 Rust 项目还需要什么**、**去哪儿找可信的轮子**、**往后按什么方向精进**。

<Callout type="note" title="本讲与第 56 讲怎么配合" text="[第 56 讲](/projects/kv/5-production.md) 在 KV Server 里把配置、测试、压测、监控与 CI/CD 实际跑了一遍；本讲把这些做法抽成通用原则，再补上生态选型与持续精进。一实一虚，合看最省力。" />

## 一、代码仓库管理

```text
my-service/
├── Cargo.toml / Cargo.lock
├── rust-toolchain.toml      # 固定工具链版本，团队和 CI 完全一致
├── clippy.toml / rustfmt.toml
├── .github/workflows/       # CI：fmt / clippy / test / build
├── config/                  # 分环境配置，不含密钥
├── docs/                    # 架构决策记录 ADR、接口文档
├── src/  tests/  benches/
└── CHANGELOG.md
```

`rust-toolchain.toml` 常被忽略，却极其重要：

```toml
[toolchain]
channel = "1.78.0"
components = ["rustfmt", "clippy"]
profile = "minimal"
```

<Callout type="tip" title="为什么锁工具链版本" text="Rust 每六周一个版本。不锁版本时，同一份代码在同事机器上可能因为新版编译器的 lint 变化而报不同结果。锁住之后，升级变成一次有计划的、可评审的改动。" />

## 二、文档：三种不同用途

| 类型 | 写在哪 | 给谁看 |
| --- | --- | --- |
| API 文档 | `///` 文档注释，`cargo doc` 生成 | 使用这个库的人 |
| 架构文档 | `docs/` 下的 Markdown、ADR | 维护这个系统的人 |
| 使用手册 | README / 站点 | 部署和运维的人 |

文档注释里可以写**可编译的示例**，`cargo test` 会真的跑它们（doctest），文档因此不会悄悄过时：

```rust
/// 把字符串转成大写。
///
/// # Examples
/// ```
/// use my_service::shout;
/// assert_eq!(shout("hi"), "HI");
/// ```
pub fn shout(s: &str) -> String { s.to_uppercase() }
```

## 三、特性管理与条件编译

```toml
[features]
default = ["tls"]
tls = ["dep:tokio-rustls"]
metrics = ["dep:metrics"]
mock = []

[dependencies]
tokio-rustls = { version = "0.25", optional = true }
metrics = { version = "0.22", optional = true }
```

```rust
#[cfg(feature = "metrics")]
fn record_latency(d: std::time::Duration) { /* 埋点 */ }

#[cfg(not(feature = "metrics"))]
fn record_latency(_: std::time::Duration) {}
```

配合 `#[cfg(test)]`、`#[cfg(target_os = "linux")]`，可以在编译期裁剪功能。**原则**：可选依赖要真的可选，别让默认构建拉进一堆用不上的 crate。

## 四、架构：四个思考层次

架构讨论可以拆成四层，从「系统怎么分块」一路收敛到「日常怎么取舍」。

<ConceptDiagram type="arch-four" title="架构的四个思考层次" />

原教材把架构讨论拆成四层，非常好用：

| 层次 | 要回答的问题 | 例子 |
| --- | --- | --- |
| **Structure（风格）** | 系统分成哪几块 | 分层 / 六边形 / 微服务 / 事件驱动 |
| **Characteristics（质量属性）** | 最在意什么 | 低延迟、可伸缩、可观测、可恢复 |
| **Decisions（硬性规则）** | 哪些事不许破例 | 所有 IO 必须走异步层；存储只通过 trait 访问 |
| **Design Principles（原则）** | 日常取舍的偏好 | 优先组合而非继承；错误必须带上下文 |

<ConceptDiagram type="pipeline" title="KV Server 的 Decisions：网络层不直接碰存储，必须经 Service" />

<Callout type="idea" title="Rust 怎么帮架构落地" text="很多团队的「架构规则」靠文档和 code review 维持，容易被绕过。Rust 可以用模块可见性（`pub(crate)`）、trait 边界、类型系统把一部分规则变成**编译期约束** —— 比如让网络层根本拿不到 Storage 的具体类型，就只能走 trait。" />

## 五、常见质量属性与 Rust 工具

质量属性列得出来很多，关键是给当前系统排出优先级，而不是全都要。

<ConceptDiagram type="arch-metrics" title="质量属性与取舍" />

| 质量属性 | 关注点 | 常用工具 |
| --- | --- | --- |
| 正确性 | 边界、错误路径 | 单元测试 / `proptest` 属性测试 / `miri` |
| 性能 | 吞吐、P99、内存 | `criterion` / `flamegraph` / `tokio-console` |
| 可观测 | 出问题时能定位 | `tracing` / `metrics` / OpenTelemetry |
| 安全 | 依赖漏洞、不安全代码 | `cargo audit` / `cargo deny` / 审查 `unsafe` |
| 可维护 | 改动成本 | `cargo clippy` / 模块边界 / ADR |

```bash
cargo install cargo-audit cargo-deny cargo-flamegraph
cargo audit                 # 检查依赖里的已知漏洞
cargo deny check           # 许可证、重复依赖、来源策略
cargo tree -d              # 找出同一 crate 的多个版本
```

## 六、一份可以直接抄的上线清单

<CheckList id="production-list" title="发布前自检" :items='["rust-toolchain.toml 固定了版本", "CI 里 fmt / clippy -D warnings / test / release build 全绿", "配置外置，仓库里没有任何密钥", "结构化日志 + 关键指标 + 健康检查就绪", "所有网络请求都有超时与大小上限", "cargo audit 无高危漏洞", "unsafe 代码有书面说明与测试覆盖", "有回滚方案和 CHANGELOG"]' />

<Quiz no="57-1" q="`rust-toolchain.toml` 的主要作用是？" :options='["加快编译", "固定工具链版本，保证团队与 CI 构建结果一致", "自动生成文档", "替代 Cargo.lock"]' answer="1" explain="工具链升级应是可评审的显式改动，而不是某天 CI 突然变红。" />

<Quiz no="57-2" q="把架构规则写成编译期约束，Rust 主要靠什么？" :options='["注释与文档", "模块可见性、trait 边界与类型系统", "运行时断言", "代码格式化"]' answer="1" explain="让「不该访问的东西」在类型层面就不可见，规则才不会被无意绕过。" />

<Predict no="57-3" q="文档注释里的 ``` 代码块，cargo test 会？" :options='["完全忽略", "作为 doctest 编译并运行，示例过时会导致测试失败", "只做语法高亮", "只在 cargo doc 时检查"]' answer="1" output="running 1 test ... test src/lib.rs - shout (line 4) ... ok" explain="doctest 是防止文档与实现脱节的低成本手段。" />

<Exercise title="给项目加一个 ADR" task="在 docs/adr/0001-async-runtime.md 写一份简短架构决策记录：说明为什么选择 tokio 作为异步运行时，包含「背景 / 决策 / 备选方案 / 后果」四节。" hints='["ADR 是不可变记录，后续改变应写新文件而不是改旧的", "备选方案至少写两个，如 async-std、smol", "后果要写清付出的代价，比如生态绑定"]' solution="# ADR 0001：选择 tokio 作为异步运行时\n\n## 背景\nKV Server 需要同时处理大量 TLS 连接与 Pub/Sub 推送。\n\n## 决策\n采用 tokio，并统一使用 tokio::sync 与 tokio::net。\n\n## 备选方案\nasync-std（生态较小）、smol（更轻但需自建更多设施）。\n\n## 后果\n生态最成熟，tracing / axum / tonic 天然兼容；代价是运行时绑定，\n后续更换运行时需要改动所有 IO 与同步原语。" explain="ADR 的价值不在文档本身，而在于把「为什么」沉淀下来，避免半年后反复争论。" />

## 七、生态地图：怎么选一个 crate

Rust 标准库刻意保持精简，真实项目里大量能力来自 [crates.io](https://crates.io)。会挑依赖，和会写 Rust 一样重要。

| 需求 | 先看这些 | 选型时盯什么 |
| --- | --- | --- |
| 异步运行时 | `tokio` / `async-std` / `smol` | 生态配套（`tracing`、`axum`、`tonic`）、要不要多线程调度 |
| Web 服务 | `axum` / `actix-web` | 中间件生态、与 tokio 的绑定程度、类型是否顺手 |
| 序列化 | `serde` + `serde_json` / `bincode` | 格式、零拷贝、derive 支持 |
| 错误处理 | `anyhow` / `thiserror` | 应用用 `anyhow`、库用 `thiserror`，别混着来 |
| 命令行 | `clap` | derive 风格、子命令与补全生成 |
| 数据库 | `sqlx` / `diesel` | 编译期校验 SQL vs ORM、异步支持 |
| 日志与观测 | `tracing` + `tracing-subscriber` / `metrics` | 结构化字段、span、能否导出到 OpenTelemetry |
| 测试 | `proptest` / `criterion` / `mockall` | 属性测试、基准、mock 生成 |
| WASM 与前端 | `wasm-bindgen` / `web-sys` / `js-sys` | target 与 feature 粒度（[第 58 讲](/projects/frontend/wasm.md)） |

```bash
cargo search axum                  # 找候选
cargo add serde --features derive  # 加依赖并写进 Cargo.toml
cargo tree -i serde                # 反查：谁依赖它、共有哪些版本
cargo tree -d                      # 找出重复依赖
```

**选型六问**，按顺序过一遍再决定：

1. 最近一次发布是什么时候？issue / PR 还有人回吗？
2. 下载量与被依赖数如何（crates.io、lib.rs）？有没有大项目在用？
3. [docs.rs](https://docs.rs) 上的文档是否完整，有没有可运行示例？
4. License 与 `cargo deny` 策略冲突吗？
5. MSRV（最低支持的 Rust 版本）和 `rust-toolchain.toml` 匹配吗？
6. `cargo tree` 会不会拉进一大堆重复依赖？`unsafe` 集中在哪些模块？

<Callout type="tip" title="少依赖也是一种架构能力" text="每加一个 crate，就多一份升级、安全公告与许可证的长期成本。能用标准库解决的别引依赖；真的要引，优先选「依赖树浅、feature 可裁剪、维护活跃」的那个，并把选择理由写进 ADR。" />

<Quiz no="57-4" q="给一个要发布的库选错误类型，哪种做法更合适？" :options='["用 anyhow，把具体错误擦掉", "用 thiserror 定义具体错误枚举，让调用方能 match", "全部转成字符串", "直接 panic"]' answer="1" explain="库要暴露可匹配的错误类型（thiserror）；应用层才适合用 anyhow 做错误聚合与上下文。" />

## 八、持续精进：66 讲之后的进阶地图

这一节属于「通用工程能力」，所以放在这里一并讲完；但它是给**学完全部 66 讲之后**用的路线图，现在先有印象即可，不必中途停下来去执行。教程给的是一张地图，真正的功力来自之后读源码和做完整项目。按方向挑资料，比「从头再学一遍」有效得多。

| 方向 | 主要资料 | 动手方式 |
| --- | --- | --- |
| 语言细节 | The Rust Book、Rust by Example | 把每讲的「扩展挑战」补齐 |
| 所有权进阶 | Rustonomicon、Too Many Linked Lists | 写一个自己的链表 / arena 分配器 |
| 异步底层 | tokio 文档与源码、`tokio-console` | 给 KV Server 加取消安全性与超时测试 |
| 类型与宏 | Rust Reference、Little Book of Rust Macros | 把重复的 trait impl 写成派生宏 |
| 工程与架构 | Zero To Production In Rust、ADR 实践 | 给自己的项目补 CI、结构化日志、压测 |
| 社区节奏 | This Week in Rust、Rust RFC、RustConf 议程 | 每周读一条 RFC 摘要，记下它解决什么问题 |

<StepBox title="接下来 90 天怎么走" :steps='[{"title":"第 1 个月：改成自己的","body":"挑一个 L5 项目，把需求换成你真实遇到的问题\n补齐测试、错误处理与 README","tip":"跑通别人的代码只是起点，改坏再修好才学到东西"},{"title":"第 2 个月：读一个真实 crate","body":"选一个你每周都在用的 crate，从 lib.rs 开始读\n顺着 trait 边界看它怎么分层","tip":"重点看「为什么这样抽象」，不是背 API"},{"title":"第 3 个月：完整交付一次","body":"加 CI、cargo audit、结构化日志与压测\n写一份 ADR 记录关键取舍","tip":"把过程写下来，是最省力的复盘"}]' />

<Callout type="idea" title="遇到编译错误时的心态" text="走到这里，编译器已经不再是拦路虎，而是一个严格但从不遗漏的 reviewer。读不懂报错时，先定位「它认为类型是什么 / 你认为类型是什么」的差值；这个习惯会一直有用。" />

## 九、阶段小结：服务器主线到此，还有 9 讲

到本讲为止，L5 的 **A–F 类（39–57 讲）** 走完了：从命令行工具、网络服务、数据处理、并发系统、跨语言与底层，到架构与生产化，以及贯穿五步不断重构的 KV Server。这些项目有一个共同点 —— 都跑在**服务器或本机进程**这一种宿主上，有完整的 `std`、有操作系统兜底。

接下来 9 讲换宿主，也换一套约束：

| 讲次 | 场景类 | 宿主 / 产物 | 从哪讲开始 |
| --- | --- | --- | --- |
| 58–63 | G · Rust × 前端与桌面 | 浏览器 / WebView、Node 进程；WASM 模块、SPA、桌面包、原生插件 | [第 58 讲 WASM 工具链](/projects/frontend/wasm.md) |
| 64–65 | H · 云原生与边缘 | 容器与边缘节点；gRPC 服务、边缘 WASM 函数 | [第 64 讲 tonic gRPC](/projects/grpc.md) |
| 66 | I · 嵌入式与图形 | 裸机与 GPU；`no_std` 固件、wgpu / Bevy 渲染 | [第 66 讲 嵌入式与图形](/projects/embedded.md) |

你会反复用到本讲的两样东西：**架构四层次**决定新宿主下系统怎么分块，**选型六问**决定跨语言、跨边界时该引哪些 crate。前面 KV Server 里练的类型系统、错误处理与异步，在 WASM 和边缘环境里同样成立，只是「内存归谁管」「还能不能用 `std`」会重新变成需要回答的问题。

<Callout type="tip" title="怎么继续" text="建议先读 [Rust × 前端场景总览](/projects/frontend/) 建立宿主边界的直觉，再按 58 → 66 顺序走；如果暂时用不到前端，也可以直接跳到 [第 64 讲 gRPC 微服务](/projects/grpc.md) 或 [第 66 讲 嵌入式与图形](/projects/embedded.md)，后续内容不依赖你先做完整套前端项目。" />

<CheckList id="production-check" title="本讲验收" :items='["我能说出一个 Rust 项目从仓库到上线的完整要素", "我理解架构四层次，知道如何用类型系统落实架构规则", "我能用选型六问评估一个 crate 并说清理由", "我知道 58–66 讲分别换到了哪些宿主", "我知道 66 讲之后按什么方向继续精进"]' />

[上一讲：KV 第 5 步 生产化 →](/projects/kv/5-production.md) · [下一讲：第 58 讲 WASM 工具链 →](/projects/frontend/wasm.md) · [回到 66 讲完整目录 →](/guide/curriculum.md)
