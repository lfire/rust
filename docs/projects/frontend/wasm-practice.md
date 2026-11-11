---
title: 第 59 讲 · 实战：Rust 计算模块加速前端
description: 用 wasm-bindgen 把 Rust 图像滤镜编译成 WASM 给 JS 调用，讲透线性内存、两次拷贝与真实性能对比。
---

<StageHeader stage="L5 · 第 59 讲" level="★★★★☆" time="55 分钟" goal="做出能被 JS 调用的 Rust 计算模块，并说清跨边界成本" prereq="第 58 讲 WASM 工具链" />

# 第 59 讲 · 实战：Rust 计算模块加速前端

[第 58 讲](/projects/frontend/wasm.md) 把工具链搭好了。这一讲用它做一个真东西：**把前端图像处理中最耗 CPU 的逐像素循环搬到 Rust 里**，并诚实测量这样做到底值不值。

**场景**：前端要对用户上传的图片做灰度 / 亮度处理。纯 JS 逐像素循环在大图上会卡住主线程；把这段计算移到 Rust 编译出的 WASM 里，既能复用已有的 Rust 图像算法，又不需要后端服务。

<Callout type="idea" title="本讲的关键判断" text="WASM 不是「自动变快」。计算搬过去之后，JS 与 WASM 之间的数据搬运会成为新的瓶颈；什么时候该拷贝、什么时候该让数据常驻，才是这个场景真正的工程问题。" />

## 你会练到什么

- `#[wasm_bindgen]` 导出函数、`Uint8Array` 与线性内存
- **零拷贝视图 vs 拷贝**：什么时候该 `to_vec()`，什么时候能借用
- 用 `Result<T, JsValue>` 把 Rust 错误变成 JS 可捕获的异常
- 用 `wasm-opt` 压体积，并做一次真实的性能对比
- 判断「这个优化到底划不划算」

<StepBox title="分步实现" :steps='[{"title":"导出第一个函数","body":"用 `#[wasm_bindgen]` 标记 pub fn，参数与返回值都用 wasm-bindgen 支持的类型。","tip":"先做个加法跑通链路，再写图像逻辑。"},{"title":"处理字节数组","body":"接收 `&[u8]`，返回 `Vec&lt;u8&gt;`；JS 侧对应 Uint8Array。","tip":"这一步会真实发生一次跨边界拷贝，是性能分析的重点。"},{"title":"实现灰度与亮度","body":"按 RGBA 四字节一组遍历，用整数近似亮度公式避免浮点。","tip":"记得校验长度是 4 的倍数，非法输入返回 Err。"},{"title":"错误映射","body":"`Result&lt;Vec&lt;u8&gt;, JsValue&gt;` 让 JS 侧能用 try/catch 接住错误。","tip":"比 panic 更友好：panic 在 WASM 里会变成难以定位的 RuntimeError。"},{"title":"构建与压体积","body":"`wasm-pack build --target web --release`，再用 wasm-opt -Oz 压一遍并记录体积。"},{"title":"量化对比","body":"用 performance.now() 分别测 JS 版与 WASM 版处理 4000x3000 图的耗时。"}]' />

## 完整代码：`src/lib.rs`

```rust
use wasm_bindgen::prelude::*;
use js_sys::Uint8Array;

/// 每个像素 4 字节 RGBA，按亮度公式转灰度，并叠加亮度偏移。
/// brightness 取值 -255..=255，超出范围会被夹住。
#[wasm_bindgen]
pub fn grayscale(raw: &[u8], brightness: i32) -> Result<Uint8Array, JsValue> {
    if raw.len() % 4 != 0 {
        return Err(JsValue::from_str("像素数据长度必须是 4 的倍数"));
    }
    let shift = brightness.clamp(-255, 255);
    let mut out = Vec::with_capacity(raw.len());

    for px in raw.chunks_exact(4) {
        // 整数近似 0.299R + 0.587G + 0.114B，避免逐像素浮点运算
        let y = ((px[0] as u32 * 77 + px[1] as u32 * 150 + px[2] as u32 * 29) >> 8) as i32;
        let v = (y + shift).clamp(0, 255) as u8;
        out.push(v);
        out.push(v);
        out.push(v);
        out.push(px[3]); // alpha 原样保留
    }

    Ok(Uint8Array::from(&out[..]))
}

/// 只统计信息、不回传大数组：演示「边界调用便宜」的另一面。
#[wasm_bindgen]
pub fn mean_luma(raw: &[u8]) -> Result<u8, JsValue> {
    if raw.is_empty() || raw.len() % 4 != 0 {
        return Err(JsValue::from_str("非法的像素数据"));
    }
    let mut sum: u64 = 0;
    for px in raw.chunks_exact(4) {
        sum += (px[0] as u64 * 77 + px[1] as u64 * 150 + px[2] as u64 * 29) >> 8;
    }
    Ok((sum / (raw.len() / 4) as u64) as u8)
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 { a + b }
```

注意 `mean_luma` 只回传一个 `u8`，而 `grayscale` 回传整块像素 —— 后面会看到这两者的成本完全不在一个量级。

## JS 侧调用

两次跨边界拷贝分别发生在哪，看这张图比逐行读代码更快。

<ConceptDiagram type="wasm-memory" title="JS 堆与 WASM 线性内存" />

```html
<script type="module">
import init, { grayscale, mean_luma, add } from './pkg/image_wasm.js';

await init();                       // 必须先实例化 .wasm
console.log(add(2, 3));             // 5

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

// 关键：img.data 是 Uint8Array，传进 WASM 时会拷入线性内存
const gray = grayscale(img.data, 20);
console.log('平均亮度', mean_luma(img.data));

// gray 是 WASM 线性内存上的视图；要交还给 Canvas 需再拷一次
img.data.set(gray);
ctx.putImageData(img, 0, 0);
</script>
```

<Callout type="warn" title="两次拷贝，别假装它们不存在" text="`img.data → WASM` 一次、`WASM → img.data.set()` 一次。对 4000×3000 的 RGBA 图是 36MB × 2。如果调用很频繁，应该：1. 把数据常驻 WASM 侧（导出一个持有 Vec 的 struct）；2. 用 `wasm_bindgen` 的内存视图直接写回，而不是返回新数组；3. 把多次操作合并成一次调用。" />

<ConceptDiagram type="pipeline" title="JS 堆 → WASM 线性内存 → 计算 → 拷回 JS 堆"
  labels="JS 堆::Uint8Array|WASM 线性内存::一次拷贝|Rust 计算::灰度 / 亮度|拷回 JS::第二次拷贝"
  caption="JS 堆 → WASM 线性内存 → 计算 → 拷回 JS 堆，两次拷贝是隐藏成本" />

## 构建与量化对比

```bash
wasm-pack build --target web --release
wasm-opt -Oz pkg/image_wasm_bg.wasm -o pkg/image_wasm_bg.wasm   # 可选
python3 -m http.server 8080     # 打开 index.html
```

| 方案（4000×3000 RGBA，灰度+亮度） | 参考耗时 | 说明 |
| --- | --- | --- |
| 纯 JS for 循环 | 约 90–140 ms | 阻塞主线程，掉帧明显 |
| Rust WASM（含两次拷贝） | 约 35–55 ms | 计算快，但边界拷贝占比不小 |
| Rust WASM（数据常驻 + 原地处理） | 约 12–20 ms | 去掉拷贝后优势才完全体现 |

> 数字会随机器与浏览器变化，**请在自己环境里测一次**。重点是看「拷贝成本」在总耗时里的占比，而不是记住某个具体数值。

产物体积参考：`opt-level = "s"` + LTO + strip 后，这个模块约 20–40 KB（gzip 后更小）；引入 `web-sys` 操作 DOM 会显著变大，应只开启需要的 feature。

<Predict no="59-1" q="调用 `grayscale(img.data, 20)` 时，Rust 的 `&[u8]` 指向哪里？" :options='["直接指向 JS 的 Uint8Array 内存", "WASM 线性内存里的一份拷贝", "浏览器的 GPU 显存", "栈上的静态区"]' answer="1" explain="wasm-bindgen 会把 JS 数组拷进 WASM 线性内存再传切片；这正是大数组调用的隐藏成本。" />

<Quiz no="59-2" q="想减少跨边界拷贝，下面哪些做法有效？" :options='["把数据常驻 WASM 侧，导出持有 Vec 的 struct", "把多次小调用合并成一次批量调用", "返回线性内存视图让 JS 直接读", "把每个像素都做成一次 JS→Rust 调用"]' answer="0,1,2" multi="true" explain="逐像素调用会让边界开销彻底压倒计算收益，是最典型的反模式。" />

<Quiz no="59-3" q="`mean_luma` 为什么比 `grayscale` 便宜得多？" :options='["因为它用了更快的算法", "因为它只回传一个 u8，没有大数组回传", "因为它跳过了长度校验", "因为它跑在 GPU 上"]' answer="1" explain="进方向仍有一次拷贝，但回方向只有一个标量；大数组往返才是主要成本。" />

<Exercise title="加一个反色滤镜" task="导出 `invert(raw: &[u8])`，把 RGB 三通道各自取 255 - v，alpha 保留；并写一个 `#[cfg(test)]` 单元测试验证单个像素的结果。" hints='["仍按 chunks_exact(4) 遍历", "单元测试可以直接测私有 helper 函数，把计算逻辑抽成 fn 更好测", "非法长度同样返回 Err(JsValue)"]' solution="#[wasm_bindgen]\npub fn invert(raw: &[u8]) -&gt; Result&lt;Uint8Array, JsValue&gt; {\n    if raw.len() % 4 != 0 { return Err(JsValue::from_str(&quot;bad length&quot;)); }\n    let mut out = Vec::with_capacity(raw.len());\n    for px in raw.chunks_exact(4) {\n        out.push(255 - px[0]);\n        out.push(255 - px[1]);\n        out.push(255 - px[2]);\n        out.push(px[3]);\n    }\n    Ok(Uint8Array::from(&amp;out[..]))\n}\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn inverts_one_pixel() {\n        let px = [10, 20, 30, 255];\n        assert_eq!(255 - px[0], 245);\n    }\n}" explain="把「纯计算」与「边界转换」分开，既能单测，也方便以后复用到非 WASM 目标。" />

## 常见坑

| 现象 | 原因 / 处理 |
| --- | --- |
| 大图片处理反而变慢 | 两次拷贝占比过高，改为数据常驻或批量调用 |
| `init()` 之前调用函数报错 | WASM 必须先实例化；顶层 await 或放在 async 初始化流程里 |
| JS 侧看到 `RuntimeError: unreachable` | Rust 里 panic 了；改用 `Result<T, JsValue>` 返回可读错误 |
| 结果全黑 / 颜色怪异 | RGBA 通道顺序或 stride 搞错，先检查 `len() % 4 == 0` |
| 改了 Rust 代码但页面没变 | 忘记重新 `wasm-pack build`，或浏览器缓存了旧 `.wasm` |

## 扩展挑战

- 导出一个 `ImageBuffer` struct 持有 `Vec<u8>`，让多次滤镜调用之间不再来回拷贝。
- 用 `rayon` + `wasm-bindgen-rayon` 并行处理（需要 SharedArrayBuffer 与 COOP/COEP 响应头）。
- 对照 [第 65 讲 边缘与 Serverless](/projects/edge.md)，看看同一个 `.wasm` 换到 WASI 宿主后哪些能力会变。
- 把 `wasm-pack publish` 的产物接到真实 Vite 项目里（[第 60 讲](/projects/frontend/leptos.md)）。

## 小结

- 导出的函数参数用 `&[u8]`、返回用 `Uint8Array`，错误用 `Result<T, JsValue>`。
- **两次跨边界拷贝**是大数组场景的主要隐藏成本，计算快不等于总体快。
- 判断要不要上 WASM，看的是「计算耗时 / 拷贝耗时」的比值，而不是语言本身。
- 数据常驻 + 批量调用 + 只回传标量，是三种最有效的优化方向。

<CheckList id="wasm-practice-check" title="验收清单" :items='["JS 页面能调用 add 与 grayscale 并显示结果", "能说清两次拷贝分别发生在哪", "做了 JS 版与 WASM 版的耗时对比", "能解释 mean_luma 为何比 grayscale 便宜", "非法长度返回可读错误而不是 panic", "能说出至少两种减少拷贝的做法"]' />

[上一讲：第 58 讲 WASM 工具链 →](/projects/frontend/wasm.md) · [下一讲：第 60 讲 Leptos 写前端 SPA →](/projects/frontend/leptos.md)
