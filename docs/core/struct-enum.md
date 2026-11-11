---
title: 第 23 讲 · struct、impl 与方法
description: 用 struct 建模型，用 impl 加方法，掌握三种 self、可见性、更新语法与关联函数。
---

<StageHeader stage="L3 · 第 23 讲" level="★★★☆☆" time="25 分钟" goal="能自定义数据类型并给它加上方法" prereq="第 22 讲 生命周期标注" />

# 第 23 讲 · struct、impl 与方法

到这一讲，我们终于可以**描述自己的数据**了。`struct` 把相关字段装在一起，`impl` 给类型加行为 —— 这是 Rust 里最常用的建模方式（没有类，也没有继承）。

`enum`、`Option`、`Result` 留到 [第 24 讲](/core/enums.md)。

## 一、struct 的三种形态

结构体在内存里并不按书写顺序简单排开，编译器会按对齐要求重排字段。

<ConceptDiagram type="memory-align" title="字段重排与内存对齐" />

```rust
// 1. 具名字段（最常用）
struct User {
    name: String,
    age: u8,
    active: bool,
}

// 2. 元组结构体：字段没有名字，按序号访问
struct Rgb(u8, u8, u8);

// 3. 单元结构体：没有字段，常用来做标记 / 实现 trait
struct Marker;

fn main() {
    let u = User { name: "小明".into(), age: 20, active: true };
    let color = Rgb(255, 128, 0);
    println!("{} {} {}", u.name, u.age, color.1);
    let _m = Marker;
}
```

<Compare title="和其他语言的对照" :panels='[{"label":"TypeScript interface","code":"interface User {\n  name: string; age: number;\n}","note":"只描述形状，不拥有行为"},{"label":"Rust struct + impl","code":"struct User { name: String, age: u8 }\nimpl User {\n  fn greet(&self) -&gt; String { ... }\n}","note":"数据与行为分开写，行为可分散在多个 impl 块"}]' note="Rust 没有 class，但 impl 可以写在任何地方（甚至不同文件），只要类型在当前 crate 里。" />

### 字段初始化简写与更新语法

```rust
fn build(name: String, age: u8) -> User {
    User { name, age, active: true }     // 同名可省略冒号
}

let u1 = build("小明".into(), 20);
let u2 = User { name: "小红".into(), ..u1 };   // 其余字段从 u1 搬过来
```

<Callout type="warn" title="更新语法会移动" text="`..u1` 把剩余字段的所有权**移动**过来。若剩余字段全是 Copy 就没问题；含 `String` 时 `u1` 之后不能整体使用（但未被移动的字段仍可单独访问）。这正是 [第 16 讲](/core/ownership.md) 规则的实际应用。" />

### 可见性

字段默认私有，**结构体和字段要分别标 `pub`**：

```rust
pub struct Config {
    pub name: String,      // 外部可读写
    retries: u8,           // 外部不可见，只能靠方法访问
}

impl Config {
    pub fn new(name: String) -> Self { Self { name, retries: 3 } }
    pub fn retries(&self) -> u8 { self.retries }   // getter
}
```

把字段设为私有、通过方法暴露，是 Rust 里做**不变量保护**的标准手段：外部无法把 `retries` 设成一个非法值。

## 二、impl：给类型加方法

```rust
#[derive(Debug)]
struct Rect { w: u32, h: u32 }

impl Rect {
    fn area(&self) -> u32 { self.w * self.h }          // 借看
    fn grow(&mut self, d: u32) { self.w += d; }        // 借改
    fn into_width(self) -> u32 { self.w }              // 拿走所有权
    fn square(s: u32) -> Self { Self { w: s, h: s } }  // 关联函数，无 self
}

fn main() {
    let mut r = Rect::square(10);
    r.grow(5);
    println!("{:?} 面积 {}", r, r.area());
    let w = Rect::square(3).into_width();              // 3
}
```

| 第一个参数 | 含义 | 调用后对象 |
| --- | --- | --- |
| `&self` | 只读借用，最常用 | 仍可用 |
| `&mut self` | 可变借用，能改字段 | 仍可用（需 `let mut`） |
| `self` | 拿走所有权（常用于 builder / 转换） | 失效 |
| 无 `self` | 关联函数，用 `Rect::square(10)` 调用 | 不涉及实例 |

`Self`（大写）就是 `impl` 块里那个类型本身，改类型名时不用到处改。

<Callout type="tip" title="方法调用会自动解引用" text="`r.area()` 里的 `&self` 不需要你写 `(&r).area()`：编译器会自动尝试 `&`、`&mut`、解引用，找到签名匹配的方法。这也是为什么 Rust 代码里很少见到满屏的 `*` 和 `&`。" />

### 多个 impl 块与泛型

```rust
impl Rect {
    fn is_square(&self) -> bool { self.w == self.h }
}

// 另一个 impl 块，逻辑上分组；也可以放在不同文件
impl Rect {
    fn scale(&mut self, k: u32) { self.w *= k; self.h *= k; }
}
```

给泛型类型写 impl 时，类型参数要重复声明（详见 [第 29 讲](/core/generics.md)）：

```rust
struct Pair<T> { a: T, b: T }
impl<T> Pair<T> {
    fn first(&self) -> &T { &self.a }
}
```

### 派生常用能力

```rust
#[derive(Debug, Clone, PartialEq, Default)]
struct Point { x: i32, y: i32 }
```

`derive` 让结构体自动获得打印、克隆、比较、默认值等能力；规则与限制见 [第 28 讲 Trait](/core/traits.md)。

<Predict no="23-1" q="`fn into_width(self) -&gt; u32` 调用之后，原变量还能用吗？" :options='["能，self 只是借看", "不能，所有权已移进方法", "能但值被清空", "取决于字段类型"]' answer="1" output="不能" explain="self（非引用）会移动整个值；方法结束后对象被消耗。想保留就改用 &self 或 &mut self。" />

<Quiz no="23-2" q="`impl` 里方法的第一个参数写成 `&mut self` 意味着？" :options='["只读借用自身", "可变借用自身，可修改字段", "拿走所有权", "这是关联函数"]' answer="1" explain="&mut self 是可变借用；调用者本身需要 let mut，且借用期间不能有其他借用。" />

<Quiz no="23-3" q="关于字段可见性，哪个说法正确？" :options='["pub struct 会让所有字段自动公开", "结构体与字段的 pub 要分别写", "私有字段在同模块外也能读", "字段可见性不影响任何东西"]' answer="1" explain="默认全私有；pub struct 只让类型可见，字段仍需单独 pub。" />

<Quiz no="23-4" q="一个类型可以有几个 impl 块？" :options='["只能一个", "任意多个，可分散在不同文件", "最多两个", "必须和 struct 写在同一行"]' answer="1" explain="按职责分多个 impl 块是常见做法；只要类型属于当前 crate 即可（孤儿规则见第 28 讲）。" />

<FillBlank tpl="impl Rect {\n    fn square(s: u32) -&gt; ___ { Self { w: s, h: s } }\n}" answers="Self" hint="关联函数返回「自己这个类型」，用四个字母的关键字。" explain="Self 指代 impl 块所属的类型，等价于写 Rect。" />

<Exercise title="给待办清单建模" task="定义 `struct Todo { title: String, done: bool }`，写三个方法：`fn new(title: String) -&gt; Self`（关联函数）、`fn complete(&mut self)`、`fn summary(&self) -&gt; String`；再用 `#[derive(Debug, Clone)]` 让它可以打印和克隆。" hints='["new 是关联函数，没有 self，用 Todo::new(...) 调用", "complete 要改字段，所以是 &mut self", "summary 用 format! 拼接，注意 self.title 是 String，打印时用 &amp;self.title 或 clone"]' solution="#[derive(Debug, Clone)]\nstruct Todo { title: String, done: bool }\n\nimpl Todo {\n    fn new(title: String) -&gt; Self { Self { title, done: false } }\n    fn complete(&amp;mut self) { self.done = true; }\n    fn summary(&amp;self) -&gt; String {\n        format!(&quot;[{}] {}&quot;, if self.done { &quot;x&quot; } else { &quot; &quot; }, self.title)\n    }\n}\n\nfn main() {\n    let mut t = Todo::new(&quot;学所有权&quot;.into());\n    t.complete();\n    println!(&quot;{} / {:?}&quot;, t.summary(), t.clone());\n}" explain="L5 的待办清单项目就是从这个模型长出来的，会再加上 enum 优先级与 serde 持久化。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `field is private` | 字段单独加 `pub`，或提供 getter |
| 用了 `..u` 之后 u 不能用 | 更新语法会移动非 Copy 字段；改用 `u.clone()` |
| `cannot borrow as mutable` | 变量忘了 `let mut`，或方法应是 `&mut self` |
| `self` 方法调用后对象消失 | 有意的消耗式 API；改成 `&self` 或返回 `Self` |
| 想在不同文件写 impl | 可以，只要类型在当前 crate 里 |

## 小结

- `struct` 三种形态：具名字段、元组结构体、单元结构体。
- 初始化简写、更新语法（会移动）、字段与结构体的可见性分开控制。
- `impl` 的四种首参：`&self` / `&mut self` / `self` / 无 self；`Self` 指代当前类型。
- 多个 impl 块、泛型 impl、derive 是日常建模的标配。
- 下一讲用 `enum` 表达「几种可能之一」，并引出 `Option` / `Result`。

<CheckList id="struct-impl-check" title="学完本节，你应该能…" :items='["定义三种形态的 struct", "写出 &self / &mut self / self / 关联函数", "解释更新语法为什么会移动", "用字段私有 + getter 保护不变量", "给泛型结构体写 impl"]' />

[上一讲：生命周期标注与省略规则 →](/core/lifetime-annotations.md) · [下一讲：enum、Option 与 Result →](/core/enums.md)
