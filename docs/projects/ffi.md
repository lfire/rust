---
title: 第 53 讲 · unsafe Rust 与 FFI
description: 裸指针、extern C、repr(C) 与安全封装，掌握 Rust 与 C/系统库互操作的边界。
---

<StageHeader stage="L5 · 第 53 讲" level="★★★★★" time="75 分钟" goal="能安全地封装一个 C 函数并把 Rust 暴露成 C 库" prereq="L3 全部 + 第 54 讲 PyO3" />

# 第 53 讲 · unsafe Rust 与 FFI

[第 54 讲 PyO3](/projects/pyo3.md) 用框架帮我们藏好了 FFI 细节。这一讲把盖子掀开：Rust 到底怎么和 C ABI 对话，以及为什么 `unsafe` 不是「关掉检查」，而是**把一部分安全证明的责任交给写代码的人**。

## unsafe 到底解开了什么

`unsafe` 块里只多出五种能力，其余检查（类型、借用、生命周期）**照常生效**：

1. 解引用裸指针 `*const T` / `*mut T`
2. 调用 `unsafe fn` / `extern` 函数
3. 访问或修改 `static mut`
4. 实现 `unsafe trait`
5. 访问 `union` 的字段

<Callout type="warn" title="unsafe 的契约" text="进入 unsafe 块，等于向编译器承诺「我已经人工确认这段代码满足内存安全」。承诺错了就是未定义行为（UB），而且编译器不会帮你发现。所以每个 unsafe 块都要写 `// SAFETY:` 注释，说明为什么成立 —— 这不是风格建议，是维护者唯一的安全依据。" />

## 一、Rust 调用 C

```c
/* clib/mathx.h */
int32_t clamp_i32(int32_t v, int32_t lo, int32_t hi);
void    sum_array(const int32_t *ptr, size_t len, int64_t *out);
```

```toml
[build-dependencies]
cc = "1"          # 用 build.rs 编译并链接 C 源码，省去手工装库
```

```rust
// build.rs
fn main() {
    cc::Build::new().file("clib/mathx.c").compile("mathx");
    println!("cargo:rerun-if-changed=clib/mathx.c");
}
```

```rust
// src/main.rs
#[repr(C)]
pub struct Bounds { pub lo: i32, pub hi: i32 }

// edition 2021 下 extern 块本身不写 unsafe；只有调用外部函数时才需要 unsafe {}
extern "C" {
    fn clamp_i32(v: i32, lo: i32, hi: i32) -> i32;
    fn sum_array(ptr: *const i32, len: usize, out: *mut i64);
}

/// 安全封装：把 unsafe 收进一个小函数，对外只暴露安全 API
pub fn clamp(v: i32, bounds: &Bounds) -> i32 {
    // SAFETY: clamp_i32 是纯函数，只读取三个标量，不保存指针
    unsafe { clamp_i32(v, bounds.lo, bounds.hi) }
}

pub fn sum(values: &[i32]) -> i64 {
    let mut out: i64 = 0;
    // SAFETY: values.as_ptr() 在本次调用期间有效；
    // len 来自同一个切片，C 侧保证只读取这个范围；
    // out 是本地可变变量，生命周期覆盖调用。
    unsafe { sum_array(values.as_ptr(), values.len(), &mut out) }
    out
}

fn main() {
    println!("{}", clamp(120, &Bounds { lo: 0, hi: 100 }));   // 100
    println!("{}", sum(&[1, 2, 3, 4]));                       // 10
}
```

## 二、字符串与所有权边界

C 字符串是 `\0` 结尾的 `char*`，Rust 的 `String` 不是。跨边界要用 `CString` / `CStr`：

```rust
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

unsafe extern "C" {
    fn strlen(s: *const c_char) -> usize;
    fn puts(s: *const c_char) -> i32;
}

pub fn c_str_len(s: &str) -> anyhow::Result<usize> {
    let c = CString::new(s)?;                 // 内部含 \0 会返回 Err
    // SAFETY: c 在本函数内有效，且保证以 \0 结尾
    Ok(unsafe { strlen(c.as_ptr()) })
}

pub unsafe fn print_c_str(ptr: *const c_char) {
    // SAFETY: 调用方保证 ptr 非空、指向合法 NUL 结尾字符串
    let s = unsafe { CStr::from_ptr(ptr) };
    println!("{}", s.to_string_lossy());
}
```

<Callout type="idea" title="谁分配谁释放" text="跨 FFI 边界最常见的事故是「用错分配器释放」：Rust 分配的内存必须还给 Rust，C 的 `malloc` 必须用 `free`。所以要么提供成对的 `xxx_free()` 导出函数，要么让调用方提供缓冲区（像上面的 `sum_array`），后者更安全。" />

## 三、把 Rust 编译成 C 库

```toml
[lib]
crate-type = ["cdylib", "staticlib"]
```

```rust
// src/lib.rs
use std::ffi::{c_char, CStr};
use std::os::raw::c_int;

/// 导出给 C：返回堆上字符串长度；调用方需调用 rust_free_string 释放
#[no_mangle]
pub extern "C" fn rust_describe(value: c_int) -> *mut c_char {
    let text = format!("value={}\0", value);
    // into_raw 把所有权交给 C 侧
    std::ffi::CString::new(text).unwrap().into_raw() as *mut c_char
}

#[no_mangle]
pub unsafe extern "C" fn rust_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        // SAFETY: 约定 ptr 只能来自 rust_describe，且只释放一次
        drop(unsafe { std::ffi::CString::from_raw(ptr) });
    }
}
```

```c
/* 调用方 */
char *s = rust_describe(42);
printf("%s\n", s);
rust_free_string(s);
```

<StepBox title="安全封装四步法" :steps='[{"title":"原始声明","body":"`extern \"C\"` 里只放签名，不写逻辑。","tip":"结构体加 `#[repr(C)]` 保证布局一致。"},{"title":"最小 unsafe 块","body":"每个 unsafe 只包住真正需要的一次调用，配 `// SAFETY:` 注释。","tip":"注释要写清指针有效性、长度、生命周期、对齐。"},{"title":"安全 API 包装","body":"对外暴露 `pub fn`，参数用切片 / 引用，内部再做转换。","tip":"调用方永远不需要自己写 unsafe。"},{"title":"验证","body":"`cargo miri test`（支持的平台）、ASan/Valgrind、边界用例各跑一遍。","tip":"空指针、零长度、含 NUL 的字符串是必备用例。"}]' />

## 四、`#[repr]` 布局速查

| 属性 | 含义 |
| --- | --- |
| `#[repr(C)]` | 按 C 规则排布字段，**FFI 必用** |
| `#[repr(transparent)]` | 单字段新类型，布局与被包类型一致 |
| `#[repr(packed)]` | 取消填充，容易产生未对齐引用（危险） |
| 默认（Rust） | 字段顺序可被编译器重排，**不能跨 FFI** |

<Quiz no="53-1" q="`unsafe` 块里编译器仍会执行哪些检查？" :options='["全部关闭", "类型、借用、生命周期检查照常，只额外开放五种能力", "只检查语法", "只检查所有权"]' answer="1" explain="unsafe 不是关闭借用检查器，而是把部分内存安全证明责任交给程序员。" />

<Quiz no="53-2" q="把 Rust 结构体传给 C 时为什么需要 `#[repr(C)]`？" :options='["让字段变成 public", "固定字段布局与 C 一致，避免编译器重排造成错位读取", "提升性能", "自动生成头文件"]' answer="1" explain="Rust 默认布局不保证字段顺序，跨 ABI 传递必须显式固定。" />

<Exercise title="封装一个缓冲区式 C 函数" task="C 侧提供 `void to_upper(const char *in, char *out, size_t cap)`。写 Rust 安全封装 `fn to_upper_safe(s: &amp;str) -&gt; Result&lt;String, String&gt;`：内部准备 `Vec&lt;u8&gt;` 缓冲区，调用后把结果转成 String，并处理含 NUL 输入与容量不足的情况。" hints='["用 CString::new(s) 拦截内部 NUL", "缓冲区容量至少 s.len()+1，传指针与 cap", "用 CStr::from_ptr 读回，再 to_str() 校验 UTF-8"]' solution="pub fn to_upper_safe(s: &amp;str) -&gt; Result&lt;String, String&gt; {\n    let input = CString::new(s).map_err(|_| &quot;输入含 NUL&quot;.to_string())?;\n    let mut buf = vec![0u8; s.len() + 1];\n    // SAFETY: buf 容量足够，input 以 NUL 结尾且调用期间有效\n    unsafe { to_upper(input.as_ptr(), buf.as_mut_ptr() as *mut c_char, buf.len()); }\n    let c = unsafe { CStr::from_ptr(buf.as_ptr() as *const c_char) };\n    c.to_str().map(|x| x.to_string()).map_err(|e| e.to_string())\n}" explain="让调用方提供缓冲区，避免 C 侧 malloc / Rust 侧 free 的错配，是 FFI 设计里最省心的一条规则。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 读到乱码 / 字段错位 | 忘了 `#[repr(C)]`，或两边结构体定义不一致 |
| 崩溃在 free | 谁分配谁释放，导出配对的 `xxx_free` |
| 字符串被截断 | Rust 字符串内部含 `\0`，用 `CString::new` 拦截 |
| panic 穿过边界 | 用 `catch_unwind` 兜住，返回错误码（`extern "C-unwind"` 需谨慎） |
| 回调里用错线程 | 明确 C 库会在哪个线程回调，对应 `Send` / `Sync` 约束 |

## 扩展挑战

- 用 `bindgen` 从头文件自动生成绑定，用 `cbindgen` 从 Rust 生成头文件。
- 用 `cargo miri test` 检查裸指针与未初始化内存问题。
- 对照 [第 62 讲 napi-rs](/projects/frontend/node-addon.md) 与 [第 54 讲 PyO3](/projects/pyo3.md)，看框架如何把这些 unsafe 封装成安全 API。
- 加 `catch_unwind` + 错误码，保证任何 Rust panic 都不会跨过 C ABI。
- 把 [第 44 讲 图片服务器](/projects/image-server.md) 的滤镜抽成 cdylib，给 C / Python / Node 三端复用。

<CheckList id="ffi-check" title="验收清单" :items='["能说出 unsafe 开放的五种能力", "每个 unsafe 块都有 SAFETY 注释", "跨 FFI 的结构体用了 repr(C)", "字符串用 CString / CStr 且所有权清晰", "对外暴露的是安全 API，调用方不必写 unsafe"]' />

[上一讲：第 54 讲 PyO3 扩展 →](/projects/pyo3.md) · [回到场景地图 →](/projects/)
