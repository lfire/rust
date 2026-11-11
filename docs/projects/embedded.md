---
title: 第 66 讲 · 嵌入式与图形
description: 从 no_std 裸机固件到 wgpu / Bevy 图形程序，理解资源受限与特殊硬件两类宿主。
---

<StageHeader stage="L5 · 第 66 讲" level="★★★★★" time="70 分钟" goal="知道 no_std 与 GPU 编程各要解决什么" prereq="L3 全部 + L4 基础" />

# 第 66 讲 · 嵌入式与图形

这是九类场景里「宿主最不像服务器」的一类：一端是**没有操作系统、没有堆、内存以 KB 计**的微控制器，另一端是**有大量并行算力、但由 GPU 驱动决定执行模型**的图形程序。

它们放在一起讲，是因为共同点很明确：**Rust 代码要服从宿主给的物理约束**，而不是反过来。

| 维度 | no_std 嵌入式 | wgpu / Bevy 图形 | 常规服务端 |
| --- | --- | --- | --- |
| 标准库 | 只有 `core`（可选 `alloc`） | 完整 `std` | 完整 `std` |
| 内存 | KB～MB，通常无 MMU | 显存 + 主存，按 buffer 管理 | GB 级 |
| 错误 / panic | 需要自定义 `panic_handler` | 常规 panic + GPU 校验层 | 常规 |
| 调试 | 探针 / 串口 / 逻辑分析仪 | GPU 调试层、帧捕获 | 日志、断点 |
| 主要约束 | 中断、时序、功耗 | 渲染管线、同步、着色器 | 吞吐、延迟 |

<Callout type="warn" title="关于可运行性" text="嵌入式部分需要真实硬件（或 qemu 模拟），代码骨架依赖具体板卡与 HAL 版本，请按芯片厂商模板调整。wgpu / Bevy 部分在普通桌面环境即可运行。本文目标是建立正确的心智模型与选型依据，不是背 API。" />

## 一、no_std：连标准库都用不了

`#![no_std]` 意味着只有 `core`：没有 `Vec` / `String`（除非启用 `alloc` 并自己配全局分配器）、没有文件 / 网络 / 线程、`println!` 也不存在。换来的是：**零运行时依赖、确定的内存占用、能在中断上下文里跑**。

```toml
[dependencies]
cortex-m = "0.7"
cortex-m-rt = "0.7"
embedded-hal = "1.0"
panic-halt = "0.2"        # 最简单的 panic_handler

# 以某款 Cortex-M 板卡为例，换成你的 PAC / HAL：
# stm32f4xx-hal = { version = "0.20", features = ["stm32f407"] }
```

```rust
// src/main.rs：最小骨架（按实际板卡替换 PAC 与引脚）
#![no_std]
#![no_main]

use cortex_m_rt::entry;
use panic_halt as _;

#[entry]
fn main() -> ! {
    // 1) 取得外设单例（PAC 保证同一个外设只有一个所有者）
    // let p = pac::Peripherals::take().unwrap();
    // 2) 配置时钟与 GPIO 为输出
    // let mut led = gpioc.pc13.into_push_pull_output();

    loop {
        // led.toggle();
        // 用简单的忙等延时；真实项目用定时器中断，别烧 CPU
        cortex_m::asm::nop();
    }
}
```

<Callout type="idea" title="所有权在嵌入式中特别好用" text="外设是**单例**：PAC 用 `Peripherals::take()` 保证同一块寄存器只被一个变量持有，编译期就杜绝「两个模块同时改同一个 GPIO」。这和 [L3 所有权](/core/ownership.md) 是同一条规则，只是在硬件上收益更直接 —— 冲突不会等到运行时才炸。" />

### 交叉编译与烧录

```bash
rustup target add thumbv7em-none-eabihf
cargo build --release --target thumbv7em-none-eabihf
# 用 probe-rs 烧录（按探针与芯片调整）
cargo install probe-rs-tools --locked
probe-rs run --chip STM32F407VGTx target/thumbv7em-none-eabihf/release/app
```

```toml
# .cargo/config.toml
[target.thumbv7em-none-eabihf]
runner = "probe-rs run --chip STM32F407VGTx"
rustflags = ["-C", "link-arg=-Tlink.x"]

[build]
target = "thumbv7em-none-eabihf"
```

## 二、wgpu / Bevy：把计算交给 GPU

图形程序和嵌入式的共同点是「数据要搬到别的内存空间」，但方向相反：这里是把顶点、纹理、uniform 上传到显存，再用**渲染管线**描述 GPU 该怎么算。

```toml
[dependencies]
wgpu = "22"
winit = "0.29"
pollster = "0.3"        # 示例里阻塞等待异步初始化
bytemuck = { version = "1", features = ["derive"] }
```

```rust
// 最小清屏程序骨架：拿到 device / queue / surface 后逐帧提交命令
async fn run(window: &winit::window::Window) {
    let instance = wgpu::Instance::default();
    let surface = unsafe { instance.create_surface(window) }.unwrap();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        })
        .await
        .unwrap();
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default(), None)
        .await
        .unwrap();

    let caps = surface.get_capabilities(&adapter);
    let config = wgpu::SurfaceConfiguration {
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        format: caps.formats[0],
        width: window.inner_size().width,
        height: window.inner_size().height,
        present_mode: caps.present_modes[0],
        alpha_mode: caps.alpha_modes[0],
        view_formats: vec![],
        desired_maximum_frame_latency: 2,
    };
    surface.configure(&device, &config);

    // 每帧：get_current_texture → create_view → 提交 clear 命令 → present
    let frame = surface.get_current_texture().unwrap();
    let view = frame.texture.create_view(&wgpu::TextureViewDescriptor::default());
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    {
        let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLUE),
                    store: wgpu::StoreOp::Store,
                },
            })],
            ..Default::default()
        });
    }
    queue.submit(std::iter::once(encoder.finish()));
    frame.present();

    // 下一步才是：创建顶点 buffer、编写 WGSL 着色器、
    // 用 RenderPipeline 替换掉上面的纯清屏 pass。
}
```

如果不想从渲染管线写起，用 **Bevy**（ECS 游戏引擎）几行就能起一个窗口：

```rust
use bevy::prelude::*;

fn setup(mut commands: Commands) {
    commands.spawn(Camera3dBundle::default());
    commands.spawn(PbrBundle {
        mesh: default(),   // 实际项目加载具体 mesh / material
        transform: Transform::from_xyz(0.0, 0.5, 0.0),
        ..default()
    });
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .run();
}
```

<Compare title="两种「靠近硬件」的写法" :panels='[{"label":"no_std 固件","code":"无 std / 无堆\n外设单例由所有权保证\n忙等或中断驱动","note":"约束来自物理资源"},{"label":"wgpu 图形","code":"完整 std + 异步初始化\n显存 buffer 显式上传\n命令编码后提交队列","note":"约束来自 GPU 执行模型"}]' note="共同点：都要显式管理「数据在哪块内存里」。" />

<Quiz no="66-1" q="`#![no_std]` 下默认不能直接用哪个？" :options='["core::option::Option", "Vec / String 等需要堆分配的类型", "整数运算", "match 表达式"]' answer="1" explain="Vec / String 属于 alloc / std；启用 alloc 并配置全局分配器后才可用。core 里的类型与语法特性不受影响。" />

<Quiz no="66-2" q="wgpu 里 `queue.submit(...)` 之后就立刻拿到像素结果了吗？" :options='["是，同步执行", "不是，命令提交给 GPU 队列异步执行，帧呈现由 present 触发", "取决于是否用了 unsafe", "只有 Bevy 才异步"]' answer="1" explain="CPU 负责编码命令，GPU 在队列里执行；需要读回结果时要显式 map buffer 并等待。" />

<Exercise title="给嵌入式骨架加一个计数器" task="在 no_std 的 loop 里维护一个 `u32` 计数器，每翻转一次 LED 加一，并说明：为什么这里不能用 `Vec` 记录历史？如果要记录最近 16 次计数，怎么写才不依赖堆？" hints='["固定大小数组 [u32; 16] 放在 static mut 或局部变量里", "static mut 访问需要 unsafe，更推荐用局部可变状态 + 原子类型", "环形缓冲区用索引取模实现"]' solution="let mut ring = [0u32; 16];\nlet mut idx = 0usize;\nloop {\n    ring[idx] = counter;\n    idx = (idx + 1) % ring.len();\n    counter = counter.wrapping_add(1);\n    // led.toggle();\n}" explain="固定容量数组 + 环形索引，是 no_std 下替代动态容器的标准做法：内存占用编译期确定。" />

### Bevy 的 ECS：把游戏状态铺平

`wgpu` 管「怎么画」，`Bevy` 管「一帧里谁动、谁响应、状态存在哪」。它是数据驱动的引擎，核心是 **ECS**，思路和 trait 组合很像：不搞继承树，把所有信息铺平，用组合来建模。

| 概念 | 是什么 | 代码里的样子 |
| --- | --- | --- |
| Component | 一组属性，按能力拆细以便复用 | `#[derive(Component)] struct Position { x: i32, y: i32 }` |
| Entity | 一个编号；挂哪些 Component 就有哪些能力 | `commands.spawn((SnakeHead, Position { x: 0, y: 0 }))` |
| System | 普通 Rust 函数，声明自己要读写哪些 Component | `fn movement(mut q: Query<(&Speed, &mut Transform)>)` |
| Resource | 全局唯一状态：计时器、素材、分数 | `Res<T>` / `ResMut<T>`、`app.insert_resource(..)` |
| Event | 系统之间解耦通信 | `EventWriter<T>` / `EventReader<T>`、`add_event::<T>()` |

那张「Entity × Component」大表就是**世界状态**，由引擎维护。System 不直接改它，增删实体要通过 `Commands`（可以理解成一条延迟执行的命令队列）。游戏示例通常按每秒 60 帧（60 个 tick）设计：`Startup` 的系统只跑一次，`Update` 的每帧跑一次；想让「每 0.5 秒移动一格」而不是「一帧一格」，要用 `Timer` 配合 `time.delta()` 控速。

```rust
// 示意：一个 system 就是「声明我要什么数据」的普通函数（需 bevy 依赖）
fn snake_movement(mut heads: Query<(&SnakeHead, &mut Transform)>) {
    for (_, mut transform) in heads.iter_mut() {
        transform.translation.y += 2.0;
    }
}
```

<Callout type="warn" title="两个新手最容易踩的坑" text="① System 默认尽量并行，执行顺序不确定，有依赖就用 `.before()` / `.after()` 显式指定；② Bevy 2D 的坐标原点默认在窗口正中，做网格游戏要自己换算到左下角。另外 ECS 的 API 在小版本间变动较快，照着教程写代码时请先锁定 `Cargo.toml` 里的 Bevy 版本。" />

## 常见坑

| 场景 | 现象 | 处理 |
| --- | --- | --- |
| no_std | 链接报错缺 `panic_handler` | 引入 `panic-halt` / `panic-probe`，或自己实现 |
| no_std | 用了 `format!` 就编译失败 | 用 `core::fmt::Write` + 固定缓冲，或 `heapless::String` |
| no_std | 程序跑飞无输出 | 配好 memory.x / link.x、时钟与调试探针，先点灯再写逻辑 |
| wgpu | `create_surface` 需要 unsafe | 窗口句柄生命周期必须由调用方保证，封装在安全的抽象里 |
| wgpu | 验证层报 buffer 用途不匹配 | 检查 `BufferUsages` / `TextureUsages` 与 bind group 声明是否一致 |
| Bevy | 系统顺序导致一帧看不到对象 | 用 `Startup` 生成资源，或显式声明系统调度顺序 |

## 扩展挑战

- 用 `embassy` 写异步嵌入式程序，对比 `async` 在有无操作系统时的不同含义（对照 [第 37 讲 状态机与 Pin](/concurrency/async.md) 与 [第 38 讲 异步 IO](/concurrency/async-io.md)）。
- 用 `defmt` + `probe-rs` 做结构化日志，替代串口打印。
- 给 wgpu 加顶点缓冲与 WGSL 着色器，画出一个三角形并捕获一帧。
- 用 Bevy ECS 做一个简单的粒子系统，体会组件 / 资源 / 系统与 Rust trait 的关系。
- 把 wgpu 渲染结果编译到 WASM，在浏览器里跑（串起 [第 58 讲 WASM 工具链](/projects/frontend/wasm.md)）。

<CheckList id="embedded-check" title="验收清单" :items='["能说出 no_std 下 std 的哪些能力不可用", "理解外设单例与所有权的关系", "知道交叉编译目标三元组怎么选", "能画出 wgpu 的 device / queue / pipeline 关系", "知道 Bevy 的 ECS 与 system 大致职责"]' />

## 恭喜，你走完了整套教程 🎉

这一讲走完了 L5 的第九类场景，也是**全套 66 讲的最后一讲**。从第一行 `println!`、栈与堆、所有权三法则，到 trait 抽象、泛型、并发与异步，你已经把 Rust 放进四种宿主里各跑了一遍：

| 宿主 | 对应场景 | 典型约束 |
| --- | --- | --- |
| 服务器 / 本机进程 | 命令行、网络服务、数据处理、并发系统、架构与生产化 | 完整 `std`，重点是可靠性与可维护性 |
| 浏览器 / WebView | WASM、Leptos SPA、Tauri、Node 插件、全栈类型共享 | 跨语言边界、线性内存、类型映射 |
| 容器 / 边缘节点 | gRPC 微服务、Serverless 与边缘 WASM | 冷启动、无状态、资源上限 |
| 裸机 / GPU | `no_std` 嵌入式、wgpu / Bevy | 没有堆、没有操作系统，显式管理内存 |

再加上从「一个 HashMap」演进到可上线系统的 KV Server 贯穿线，你已经具备独立阅读 Rust 项目、动手写工具与服务的基础。

接下来推荐：

- 回到 [综合自测](/practice/) 检验整体掌握度，把错题对应的章节重看一遍。
- 翻翻 [语法速查表](/practice/cheatsheet.md)，把它当成日常查阅的手册。
- 挑一个 [工程场景](/projects/) 改成你自己的需求，按 [第 57 讲给出的进阶路线](/projects/production.md) 做一次完整交付。
- 阅读 [关于本站与内容来源](/about/)，了解这套教程和原始教材的关系。

<CheckList id="final-check" title="最终验收" :items='["我能说清所有权、借用与生命周期三条规则", "我能用 trait 与泛型做抽象，知道何时该用 dyn Trait", "我能用 Result 与 ? 组织错误，而不是到处 unwrap", "我知道并发与异步各自解决什么问题", "我能说出四种宿主各自的约束与对应工程场景", "我准备开始做自己的项目了"]' />

[回到场景地图复盘 →](/projects/) · [回顾第 57 讲 通用工程能力 →](/projects/production.md) · [回到 66 讲完整目录 →](/guide/curriculum.md)
