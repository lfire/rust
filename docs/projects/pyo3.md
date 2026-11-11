---
title: 第 54 讲 · 用 PyO3 写 Python 扩展
description: 把 Rust 函数与 struct 暴露成 Python 模块，理解 FFI 的边界与类型映射。
---

<StageHeader stage="L5 · 第 54 讲" level="★★★★☆" time="80 分钟" goal="能给 Python 写一个 Rust 加速模块" prereq="L3 全部" />

# 第 54 讲 · 用 PyO3 写 Python 扩展

**场景**：Python 写业务很爽，但某段计算成了瓶颈。用 Rust 写这段逻辑，再让 Python 像调用普通模块一样调用它 —— 这是 Rust 落地最常见的方式之一（不少知名 Python 库都这么做）。

## 你会练到什么

- FFI（外部函数接口）的基本心智模型
- 用 `PyO3` 把 Rust 函数注册成 Python 函数
- 把 Rust struct 变成 Python 类，暴露方法
- Rust 错误映射成 Python 异常
- 用 `maturin` 构建并安装 wheel

<Callout type="idea" title="FFI 的核心困难" text="两种语言的内存布局、字符串编码、错误处理、对象生命周期都不同。边界上必须明确：谁分配内存、谁释放、错误怎么传、GIL（Python 全局解释器锁）什么时候可以释放。PyO3 把这些细节封装好了，但你仍要知道它们存在。" />

## 依赖与项目结构

```toml
[package]
name = "fast_kv"
version = "0.1.0"
edition = "2021"

[lib]
name = "fast_kv"
crate-type = ["cdylib"]      # 生成可被 Python 加载的动态库

[dependencies]
pyo3 = { version = "0.20", features = ["extension-module"] }
```

```text
fast_kv/
├── Cargo.toml
├── pyproject.toml
└── src/lib.rs
```

```toml
# pyproject.toml
[build-system]
requires = ["maturin>=1.0,<2.0"]
build-backend = "maturin"

[project]
name = "fast-kv"
requires-python = ">=3.8"
```

## 最小可用：暴露一个函数

```rust
use pyo3::prelude::*;

/// 计算一个整数列表的平方和（Python 里的循环在这里由 Rust 跑）
#[pyfunction]
fn sum_of_squares(nums: Vec<i64>) -> i64 {
    nums.iter().map(|n| n * n).sum()
}

#[pymodule]
fn fast_kv(_py: Python<'_>, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(sum_of_squares, m)?)?;
    Ok(())
}
```

```bash
pip install maturin
maturin develop            # 编译并装进当前虚拟环境
python -c "import fast_kv; print(fast_kv.sum_of_squares([1,2,3]))"   # 14
```

`#[pyfunction]` 与 `#[pymodule]` 是**属性宏**：它们在编译期生成一堆胶水代码，负责把 Python 的 `PyObject` 转成 Rust 的 `Vec<i64>`，再把 `i64` 转回 Python 对象。

## 把 struct 变成 Python 类

```rust
use pyo3::exceptions::PyKeyError;
use pyo3::prelude::*;
use std::collections::HashMap;

#[pyclass]
struct KvStore {
    data: HashMap<String, String>,
}

#[pymethods]
impl KvStore {
    #[new]
    fn new() -> Self { Self { data: HashMap::new() } }

    fn set(&mut self, key: String, value: String) {
        self.data.insert(key, value);
    }

    fn get(&self, key: &str) -> PyResult<String> {
        self.data
            .get(key)
            .cloned()
            .ok_or_else(|| PyKeyError::new_err(key.to_string()))
    }

    fn len(&self) -> usize { self.data.len() }

    fn __repr__(&self) -> String {
        format!("KvStore({} items)", self.data.len())
    }
}

#[pymodule]
fn fast_kv(_py: Python<'_>, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(sum_of_squares, m)?)?;
    m.add_class::<KvStore>()?;
    Ok(())
}
```

```python
import fast_kv
s = fast_kv.KvStore()
s.set("lang", "rust")
print(s.get("lang"))       # rust
print(len(s))              # 需要 __len__ 才支持；这里用 s.len()
print(s)                   # KvStore(1 items)
s.get("missing")           # 抛出 KeyError: missing
```

<ConceptDiagram type="pipeline" title="Python 对象 → PyO3 转换层 → Rust 类型 → 结果再转回 Python"
  labels="Python 对象::PyObject|PyO3 转换层::类型映射|Rust 类型::struct / Vec|结果回传::PyResult"
  caption="Python 对象 → PyO3 转换层 → Rust 类型 → 结果再转回 Python" />

## 三个关键注意点

**1. 错误映射。** Rust 的 `Result<T, E>` 在边界上要变成 `PyResult<T>`；`PyKeyError`、`PyValueError` 等对应 Python 异常。不要让 `panic!` 穿过 FFI 边界 —— 那会直接终止进程。

**2. GIL 与释放锁。** 纯计算函数可以主动释放 GIL，让其他 Python 线程继续跑：

```rust
#[pyfunction]
fn heavy(py: Python<'_>, nums: Vec<i64>) -> i64 {
    py.allow_threads(|| nums.iter().map(|n| n * n).sum())
}
```

释放 GIL 期间**不能碰任何 Python 对象**，只处理 Rust 数据 —— 这条约束正好和 Rust 的所有权规则合拍。

**3. 类型转换有成本。** `Vec<i64>` 从 Python list 转过来要逐个拷贝。如果数据量大，应该让 Rust 端持有数据（比如用 `numpy` 的零拷贝 buffer），而不是每次调用都搬一遍。

<Compare title="同一个需求，两种语言" :panels='[{"label":"纯 Python","code":"def sum_sq(nums):\n    return sum(n*n for n in nums)","note":"简单，但大列表慢"},{"label":"Rust + PyO3","code":"#[pyfunction]\nfn sum_of_squares(nums: Vec&lt;i64&gt;) -&gt; i64 {\n    nums.iter().map(|n| n*n).sum()\n}","note":"编译后是紧凑循环，无解释器开销"}]' note="调用次数少、数据量小的时候，FFI 转换开销可能盖过收益；先测量再决定。" />

<Quiz no="54-1" q="`crate-type = [&quot;cdylib&quot;]` 的作用是？" :options='["生成可执行文件", "生成能被 Python 动态加载的 C ABI 动态库", "生成静态 Rust 库", "开启优化"]' answer="1" explain="Python 通过 C ABI 加载扩展模块，cdylib 正是对外的动态库格式。" />

<Quiz no="54-2" q="`py.allow_threads(...)` 期间不能做什么？" :options='["做 CPU 计算", "访问 Python 对象", "使用 Rust 的 Vec", "返回结果"]' answer="1" explain="GIL 已释放，任何 Python API 调用都不安全；闭包里只处理 Rust 数据。" />

<Predict no="54-3" q="Rust 扩展里 `panic!` 穿过 FFI 边界会？" :options='["变成 Python 异常", "被 PyO3 转成 PyRuntimeError 或直接终止进程", "静默忽略", "编译失败"]' answer="1" explain="新版 PyO3 会尽量把 panic 捕获成 PanicException，但绝不能依赖它；应在边界前用 Result 处理错误。" />

<Exercise title="加一个批量接口" task="给 KvStore 加 `set_many(&mut self, items: Vec&lt;(String, String)&gt;)` 和 `keys(&self) -&gt; Vec&lt;String&gt;`，并在 Python 里验证。" hints='["Vec&lt;(String,String)&gt; 对应 Python 的 list of tuple", "keys 可以用 self.data.keys().cloned().collect()", "记得在 #[pymethods] impl 块里加，才会暴露给 Python"]' solution="fn set_many(&mut self, items: Vec&lt;(String, String)&gt;) {\n    for (k, v) in items { self.data.insert(k, v); }\n}\n\nfn keys(&self) -&gt; Vec&lt;String&gt; {\n    self.data.keys().cloned().collect()\n}\n\n// Python:\n// s.set_many([(&quot;a&quot;, &quot;1&quot;), (&quot;b&quot;, &quot;2&quot;)])\n// print(s.keys())" explain="一次调用传一批数据，比循环调用多次更能摊薄 FFI 开销。" />

## 扩展挑战

- 用 `#[pyo3(signature = (...))]` 支持默认参数与关键字参数。
- 加类型注解 stub（`*.pyi`），让 IDE 有补全。
- 用 `rayon` 在 `allow_threads` 里做并行计算，对比单线程版。
- 试试 `napi-rs`（Node.js）或 `wasm-bindgen`（浏览器），体会同一套 FFI 思路在不同宿主上的差异。

<CheckList id="pyo3-check" title="验收清单" :items='["maturin develop 能成功构建安装", "Python 能调用 Rust 函数与类方法", "错误映射成了合适的 Python 异常", "知道 GIL 释放期间的约束"]' />

[下一讲：第 55 讲 KV 第 4 步 大重构与 Pub/Sub →](/projects/kv/4-refactor.md) · [回到 66 讲完整目录 →](/guide/curriculum.md)
