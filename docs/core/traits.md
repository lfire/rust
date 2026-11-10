---
title: 第 28 讲 · Trait：定义与实现
description: 用 trait 描述「能做什么」，掌握默认方法、关联类型、孤儿规则、常用 trait 与 derive。
---

<StageHeader stage="L3 · 第 28 讲" level="★★★★☆" time="30 分钟" goal="能定义 trait、为类型实现它并用 derive 获得常用能力" prereq="第 23/24 讲 struct / enum" />

# 第 28 讲 · Trait：定义与实现

前面我们给某个类型写方法（`impl Point { ... }`）。但如果**很多不同类型都需要同一种能力**——都能被打印、都能被比较、都能被存进 KV——逐个写一遍就太散了。trait 就是把这个「共同能力」抽出来单独命名。

<Callout type="idea" title="一个直觉" text="trait 像插座标准：它不关心插的是台灯还是电脑，只规定「有几个孔、电压多少」。任何类型只要按这个标准实现，就能被同一段代码使用。Rust 里没有继承，trait 是代码复用的主要手段。" />

## 一、定义与实现

```rust
trait Summary {
    fn summarize(&self) -> String;          // 必须实现

    fn preview(&self) -> String {           // 默认实现，可覆盖
        format!("（摘要）{}", self.summarize())
    }
}

struct Article { title: String, body: String }
struct Tweet   { author: String, text: String }

impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{}：{} 字", self.title, self.body.len())
    }
}

impl Summary for Tweet {
    fn summarize(&self) -> String {
        format!("@{}：{}", self.author, self.text)
    }
    // 覆盖默认实现
    fn preview(&self) -> String { format!("[推文] {}", self.summarize()) }
}

fn main() {
    let a = Article { title: "所有权".into(), body: "很长的内容".into() };
    let t = Tweet { author: "rust".into(), text: "hello".into() };
    println!("{}", a.preview());
    println!("{}", t.preview());
}
```

三个要点：

- trait 里只写**签名**，不写字段；实现放在 `impl Trait for Type`。
- 默认方法可以调用同 trait 的其他方法（`preview` 调 `summarize`），这是模板方法模式。
- 一个类型可以实现任意多个 trait，一个 trait 也能被任意多个类型实现。

<ConceptDiagram type="trait" title="trait 定义约定，不同类型各自实现，调用方只依赖约定" />

## 二、关联类型：让实现方决定具体类型

```rust
use std::collections::HashMap;

trait Storage {
    type Value;                                   // 关联类型
    fn get(&self, key: &str) -> Option<Self::Value>;
    fn set(&mut self, key: String, value: Self::Value);
}

struct MemTable { data: HashMap<String, String> }
struct CounterTable { data: HashMap<String, i64> }

impl Storage for MemTable {
    type Value = String;
    fn get(&self, key: &str) -> Option<String> { self.data.get(key).cloned() }
    fn set(&mut self, key: String, value: String) { self.data.insert(key, value); }
}

impl Storage for CounterTable {
    type Value = i64;
    fn get(&self, key: &str) -> Option<i64> { self.data.get(key).copied() }
    fn set(&mut self, key: String, value: i64) { self.data.insert(key, value); }
}
```

`type Value` 由实现方指定，调用方写 `MemTable::Value` 就知道拿到什么。相比再加一个泛型参数 `Storage<T>`，关联类型表达的是「**一个实现只对应一种值类型**」，语义更准确，签名也更短。这正是 [KV 第 1 步](/projects/kv/1-memory.md) 里 `Storage` trait 的原型。

## 三、孤儿规则

不能给「外部类型」实现「外部 trait」，两边至少有一边是当前 crate 定义的：

| 组合 | 允许 |
| --- | --- |
| 本地类型 + 本地 trait | ✅ |
| 本地类型 + 标准库 trait（`Display`） | ✅ |
| 标准库类型（`Vec<T>`）+ 本地 trait | ✅ |
| `Vec<T>` + `Display`（都是外部的） | ❌ E0117 |

绕过办法是用**新类型模式**（newtype）：`struct MyVec(Vec<i32>);` 再对 `MyVec` 实现 `Display`。这条规则保证了不会出现两个 crate 给同一对类型/trait 提供冲突实现。

## 四、常用 trait 与 `derive`

```rust
#[derive(Debug, Clone, PartialEq, Default)]
struct Point { x: i32, y: i32 }

fn main() {
    let p = Point { x: 1, y: 2 };
    println!("{:?}", p);        // Debug
    let q = p.clone();          // Clone
    assert_eq!(p, q);           // PartialEq
    let z = Point::default();   // Default → { x: 0, y: 0 }
}
```

| trait | 作用 | 常见用法 |
| --- | --- | --- |
| `Debug` / `Display` | `{:?}` 调试 / `{}` 用户可见 | `dbg!`、日志 |
| `Clone` / `Copy` | 显式深拷贝 / 按位复制 | 需要两份数据时 |
| `PartialEq` / `Eq` / `PartialOrd` / `Ord` | 比较与排序 | `sort()`、`HashMap` 之外 |
| `Hash` | 可哈希 | `HashMap` 的 key |
| `Default` | 默认值 | 配置结构、`unwrap_or_default` |
| `From` / `Into` | 类型转换 | `?` 的错误转换就靠 `From` |
| `Drop` | 离开作用域时的清理 | RAII、关文件、断连接 |
| `Iterator` | 可迭代 | 适配器链（第 30 讲） |
| `Send` / `Sync` | 线程安全标记 | L4 |

<Compare title="派生与手写" :panels='[{"label":"derive（自动）","code":"#[derive(Debug, Clone)]\nstruct P { x: i32 }","note":"字段都实现了该 trait 才能派生"},{"label":"手写 impl（可控）","code":"impl std::fmt::Display for P {\n    fn fmt(&self, f: &mut Formatter)\n      -&gt; fmt::Result {\n        write!(f, \"P({})\", self.x)\n    }\n}","note":"Display 没有 derive，必须手写"}]' note="Debug 能派生，Display 不能 —— 因为「用户看见长什么样」需要人来定义。" />

<Callout type="warn" title="派生不是免费的" text="`#[derive(Clone)]` 要求**所有字段**都实现 `Clone`；只要有一个字段不满足，整行就编译失败。同理 `Copy` 要求全部字段 Copy。看到 `the trait bound ... is not satisfied`，先去检查字段类型。" />

## 五、trait 作为接口：为什么 L5 离不开它

[KV Server](/projects/kv/) 定义了 `Storage` 与 `CommandService` 两个 trait：内存表、磁盘存储、测试用的 mock 都实现同一个 `Storage`，网络层完全不用改。这就是**面向接口编程**：上层依赖「能做什么」，不依赖「具体是谁」。

```rust
fn run<S: Storage>(store: &mut S) {
    store.set("lang".into(), "rust".into());
    println!("{:?}", store.get("lang"));
}
```

<Callout type="tip" title="先读能力，再读类型" text="看到 `fn run<S: Storage>`，先理解 `Storage` 规定了哪些方法，函数体就好读了。下一讲会把 `S: Storage` 这种写法完整展开成泛型与 trait bound。" />

<Quiz no="28-1" q="trait 里的「默认方法」作用是？" :options='["强制每个实现都必须重写", "提供可复用的默认行为，实现方可选择覆盖", "让 trait 变成泛型", "自动派生 Debug"]' answer="1" explain="默认方法让 trait 既能定义最小契约，又能提供模板逻辑（如 preview 调用 summarize）。" />

<Quiz no="28-2" q="下面哪种实现组合会触发孤儿规则（E0117）？" :options='["给本地 struct 实现本地 trait", "给本地 struct 实现标准库 Display", "给 Vec&lt;T&gt; 实现标准库 Display", "给 Vec&lt;T&gt; 实现本地 trait"]' answer="2" explain="类型与 trait 都来自外部 crate 时不允许；用 newtype 包装可绕过。" />

<Quiz no="28-3" q="关于关联类型 `type Value`，哪个说法正确？" :options='["一个实现只能指定一种具体类型", "调用时才能传入类型参数", "它等价于泛型参数 T，可以任意多个", "只能用于标准库 trait"]' answer="0" explain="关联类型表达「一个实现对应一种值类型」，比泛型参数更贴合 Storage 这类场景。" />

<Predict no="28-4" q="去掉 `#[derive(Debug)]` 后，`println!(&quot;{:?}&quot;, p)` 会怎样？" :options='["正常打印", "编译失败：Point 没实现 Debug", "运行时 panic", "打印类型名"]' answer="1" output="error[E0277]: `Point` doesn't implement `Debug`" explain="格式化占位符 {:?} 要求类型实现 Debug；补上 derive 即可。" />

<FillBlank tpl="#[derive(___)]\nstruct Point { x: i32 }" answers="Debug~Clone~Default~PartialEq" hint="想让花括号问号格式能打印这个结构体，需要派生哪个 trait？" explain="填 Debug 最贴合题意；Clone / Default / PartialEq 也是合法派生名。" />

<Exercise title="给类型定义行为" task="定义 `trait Describable { fn describe(&self) -&gt; String; }`，为 Book 和 Movie 分别实现；再加一个带关联类型的 `trait Factory { type Item; fn make(&self) -&gt; Self::Item; }` 并给其中一个类型实现。" hints='["实现写 impl Describable for Book { ... }", "关联类型在实现块里用 type Item = 具体类型;", "两个类型都要实现同一个 trait 才能统一处理"]' solution="trait Describable { fn describe(&self) -&gt; String; }\n\nstruct Book { title: String }\nimpl Describable for Book {\n    fn describe(&self) -&gt; String { format!(&quot;书：{}&quot;, self.title) }\n}\n\ntrait Factory { type Item; fn make(&amp;self) -&gt; Self::Item; }\nstruct BookFactory;\nimpl Factory for BookFactory {\n    type Item = Book;\n    fn make(&amp;self) -&gt; Self::Item { Book { title: &quot;Rust 入门&quot;.into() } }\n}\n\nfn main() {\n    let b = BookFactory.make();\n    println!(&quot;{}&quot;, b.describe());\n}" explain="trait 把「能做什么」固定下来，具体实现各自替换 —— 下一讲会用泛型把这个思路写得更通用。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `the trait bound ... is not satisfied` | 某个字段没实现要派生的 trait |
| `conflicting implementations` | 同一对类型/trait 实现了两次，或违反孤儿规则 |
| `Display` 不能 derive | 必须手写 `impl fmt::Display` |
| 方法调用报 `method not found` | trait 没在作用域内（`use` 引进来） |
| 关联类型写成了泛型 | 一个实现只有一种值时用 `type`，需要多种实现时才用泛型参数 |

## 小结

- trait 是**行为约定**，可带默认方法与关联类型。
- 孤儿规则保证实现唯一，newtype 是标准绕过方式。
- `derive` 快速获得 `Debug` / `Clone` / `PartialEq` / `Default` 等能力，但要求所有字段都满足。
- 「围绕 trait 设计」是 Rust 架构复杂系统的主线，L5 的 KV Server 全靠它。

<CheckList id="traits-check" title="学完本节，你应该能…" :items='["定义 trait 并为多个类型实现它", "写出带默认方法和关联类型的 trait", "说出 derive 常用 trait 各自的作用", "解释孤儿规则与 newtype 的用途", "看懂 fn run&lt;S: Storage&gt; 这类签名的意图"]' />

[下一讲：泛型与 trait bound →](/core/generics.md) · [回到阶段三导览 →](/core/)
