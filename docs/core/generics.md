---
title: 第 29 讲 · 泛型、trait bound 与 trait object
description: 用泛型写通用代码，理解单态化零成本、impl Trait 与 dyn Trait 的取舍，以及面向 trait 的架构。
---

<StageHeader stage="L3 · 第 29 讲" level="★★★★☆" time="35 分钟" goal="能写泛型代码并在静态/动态分发之间做选择" prereq="第 28 讲 trait" />

# 第 29 讲 · 泛型、trait bound 与 trait object

[上一讲](/core/traits.md) 把「能做什么」抽成了 trait。这一讲解决另一半：**怎么写一段不绑定具体类型的代码**，以及 Rust 为什么敢说泛型是零成本的。

## 一、从重复到泛型

```rust
// 只处理 i32
fn max_i32(a: i32, b: i32) -> i32 { if a > b { a } else { b } }
// 再来一份 f64？再来一份 char？—— 复制粘贴不是抽象
fn max<T: PartialOrd>(a: T, b: T) -> T { if a > b { a } else { b } }
```

`T` 是**类型参数**：调用时由编译器填入具体类型。`T: PartialOrd` 是 **trait bound**：T 可以是任何类型，但必须能比较大小 —— 否则 `>` 没有意义，编译器直接拒绝。

<Compare title="同一件事，三种语言的心智模型" :panels='[{"label":"Java（类型擦除）","code":"&lt;T extends Comparable&lt;T&gt;&gt; T max(T a, T b)","note":"运行时只剩 Object，有装箱开销"},{"label":"C++ 模板","code":"template&lt;typename T&gt; T max(T a, T b)","note":"按类型实例化，错误信息较长"},{"label":"Rust 泛型","code":"fn max&lt;T: PartialOrd&gt;(a: T, b: T) -&gt; T","note":"单态化 + 编译期约束检查"}]' note="Rust 更接近 C++ 模板（生成专用代码），但约束必须在签名里写清楚，调用处报错更早更准。" />

## 二、泛型函数、类型与方法

```rust
use std::fmt::Debug;

// 泛型函数
fn first<T>(list: &[T]) -> Option<&T> { list.first() }

// 泛型结构体
struct Pair<T, U> { left: T, right: U }

// 泛型枚举（标准库里最著名的两个）
enum MyOption<T> { Some(T), None }
enum MyResult<T, E> { Ok(T), Err(E) }

// 在 impl 上声明类型参数
impl<T, U> Pair<T, U> {
    fn swap(self) -> Pair<U, T> { Pair { left: self.right, right: self.left } }
}

// 只给满足特定约束的类型提供方法
impl<T: Debug> Pair<T, T> {
    fn show(&self) { println!("{:?} / {:?}", self.left, self.right); }
}

fn main() {
    let p = Pair { left: 1, right: "hello" };
    let s = p.swap();
    println!("{} {}", s.left, s.right);
    let q = Pair { left: 2, right: 3 };
    q.show();                       // ✅ i32 实现了 Debug
    // let bad = Pair { left: NoDebug, right: NoDebug };
    // bad.show();                  // ❌ 没有这个方法
}
```

<Callout type="tip" title="读泛型签名的顺序" text="1. 先看 `<T, U>` 有哪些类型参数 → 2. 再看每个参数的 bound → 3. 最后读函数体。`fn report<T: Debug + Clone, U: Debug>(a: &T, b: &U)` 读作：给我任意能调试打印（且 T 还能克隆）的两种类型的引用。" />

## 三、`where` 与多重约束

```rust
use std::fmt::{Debug, Display};

fn report<T, U>(a: &T, b: &U) -> String
where
    T: Debug + Clone,
    U: Debug + Display,
{
    let copy = a.clone();
    format!("{:?} / {} / {:?}", copy, b, b)
}
```

约束多时 `where` 比尖括号清晰，还能写 `where Option<T>: Clone` 这类**对复合类型的约束**。

## 四、单态化：为什么是零成本

泛型与 `dyn Trait` 走的是两条完全不同的代码生成路径，先看这张对照图。

<ConceptDiagram type="monomorph" title="单态化与动态分派" />

编译器会为**每一个实际用到的具体类型**生成一份专用机器码：

```text
max::<i32>(...)  → 一份 i32 版本
max::<f64>(...)  → 一份 f64 版本
```

因此运行时没有类型标签、没有虚表查找、没有装箱，还能被内联优化 —— 和手写两个函数一样快。代价是**编译时间变长、二进制变大**（泛型代码用得越广越明显），以及跨 crate 的泛型函数必须把实现放在头文件式的可见位置（Rust 通过元数据解决）。

<Callout type="idea" title="零成本 ≠ 没有代价" text="成本从运行时挪到了编译期。写库时如果一个函数被几十种类型实例化，编译产物会明显膨胀；这时可以用内部非泛型函数 + 薄泛型外壳来收敛，或者对确实需要混装的场景改用 `dyn Trait`。" />

## 五、`impl Trait`：简洁的参数与返回值

```rust
trait Draw { fn draw(&self) -> String; }
struct Circle;
struct Square;
impl Draw for Circle { fn draw(&self) -> String { "圆".into() } }
impl Draw for Square { fn draw(&self) -> String { "方".into() } }

// 参数：任意实现了 Draw 的类型（本质是匿名泛型）
fn render(item: &impl Draw) { println!("{}", item.draw()); }

// 返回值：调用方只知道它实现了 Draw，不知道具体类型
fn make_drawable(use_circle: bool) -> impl Draw {
    if use_circle { Circle } else { Square }   // 故意留错，见下方说明
}
```

⚠️ 上面 `make_drawable` 的两个分支返回了**不同类型**，这在 `impl Trait` 下是非法的（它要求单一具体类型）。要么统一成一个枚举，要么改用 `Box<dyn Draw>`。

```rust
// 沿用上面的 trait Draw 与 Circle / Square 定义
fn make_drawable(use_circle: bool) -> Box<dyn Draw> {
    if use_circle { Box::new(Circle) } else { Box::new(Square) }
}
```

## 六、`dyn Trait`：运行时多态

`dyn Trait` 是胖指针：一根指针指向数据，另一根指向该类型的方法表。

<ConceptDiagram type="vtable" title="trait object 与虚表" />

下面这段是**可以独立运行**的完整示例：

```rust
trait Draw { fn draw(&self) -> String; }
struct Circle;
struct Square;
impl Draw for Circle { fn draw(&self) -> String { "圆".into() } }
impl Draw for Square { fn draw(&self) -> String { "方".into() } }

fn main() {
    // 同一个 Vec 里混装不同具体类型
    let shapes: Vec<Box<dyn Draw>> = vec![Box::new(Circle), Box::new(Square)];
    for s in &shapes { println!("{}", s.draw()); }
}
```

`dyn Draw` 是**胖指针**：数据指针 + 虚表指针。调用方法时先查虚表再跳转，多一次间接开销，换来「运行时才决定具体类型」。

**对象安全（object safety）**：不是所有 trait 都能做成 `dyn`。返回 `Self`、带泛型方法、带关联常量、要求 `Self: Sized` 的 trait 都不行 —— 因为虚表里无法确定这些方法该有多大、返回什么类型。需要这类能力时改用枚举或泛型。

<Compare title="静态分发 vs 动态分发" :panels='[{"label":"泛型 / impl Trait","code":"编译期确定类型\n可为每个类型内联优化\n同一集合只能放一种 T","note":"默认优先选这个"},{"label":"dyn Trait","code":"运行期查虚表\n一次间接跳转\n同一集合能混装多种类型","note":"需要插件 / 异构集合时选它"}]' note="判断标准：类型的集合在编译期能不能确定？能就用泛型，不能才用 dyn。" />

| | 泛型 `T: Trait` | `impl Trait` | `dyn Trait` |
| --- | --- | --- | --- |
| 决定时机 | 编译期 | 编译期 | 运行期 |
| 能否混装不同类型 | 否 | 否 | **能** |
| 调用方能否指定 T | 能（turbofish） | 不能 | 不适用 |
| 是否需要 `Box` | 否 | 否 | 通常需要（unsized） |

## 七、泛型与生命周期、`PhantomData`

泛型参数和生命周期参数写在同一对尖括号里，生命周期在前：

```rust
struct Excerpt<'a, T: std::fmt::Display> {
    part: &'a T,
}
```

如果类型参数只用于**标记**、不出现在任何字段里，编译器会报 `parameter T is never used`，这时用 `PhantomData<T>` 占位：

```rust
use std::marker::PhantomData;

struct Id<M> { raw: u64, _marker: PhantomData<M> }
struct User;
struct Order;

fn main() {
    let a: Id<User> = Id { raw: 1, _marker: PhantomData };
    let b: Id<Order> = Id { raw: 1, _marker: PhantomData };
    // a 与 b 类型不同，编译器能阻止把订单 id 传给用户 id 的接口
}
```

`PhantomData` 零大小、零运行时开销，只参与类型检查与 `Send`/`Sync` 推导 —— 这是「用类型系统防错」的典型手法。

## 八、面向 trait 架构

[KV 第 1 步](/projects/kv/1-memory.md) 的 `Storage` 与 `CommandService`、[KV 第 4 步](/projects/kv/4-refactor.md) 的控制反转、[第 49 讲 数据工具](/projects/sql-data-tool.md) 的数据源抽象，用的都是这一讲的组合：**trait 定契约 + 泛型/t dyn 选分发方式 + 依赖注入换实现**。

```rust
// 编译期分发：换存储实现，调用代码一行不改
fn execute<S: Storage>(store: &mut S, cmd: Command) -> Response { /* ... */ }

// 运行期分发：配置决定用哪个实现
let store: Box<dyn Storage> = if cfg.use_disk {
    Box::new(DiskTable::new())
} else {
    Box::new(MemTable::new())
};
```

<Quiz no="29-1" q="Rust 泛型的「零成本」主要指什么？" :options='["不占磁盘空间", "编译期单态化生成专用代码，运行时无类型标签与虚表查找", "不需要写约束", "编译速度更快"]' answer="1" explain="成本从运行时转移到编译期：编译更慢、二进制可能更大，但执行与手写专用函数一样快。" />

<Quiz no="29-2" q="什么时候必须用 `dyn Trait` 而不是泛型？" :options='["追求极致性能时", "需要在同一个集合里混装不同具体类型，或运行时才决定实现", "任何有 trait 的场景", "函数参数只有一个时"]' answer="1" explain="泛型要求编译期确定单一具体类型；异构集合或运行时配置需要动态分发。" />

<Quiz no="29-3" q="关于 `impl Trait` 返回值，哪个说法正确？" :options='["可以随意返回不同类型，编译器会自动装箱", "所有返回路径必须是同一个具体类型", "它等价于 Box&lt;dyn Trait&gt;", "只能用于 async fn"]' answer="1" explain="impl Trait 是匿名泛型，仍要求单一具体类型；多分支不同类型要改枚举或 Box&lt;dyn Trait&gt;。" />

<Predict no="29-4" q="`fn double(x: impl Into&lt;i32&gt;) -&gt; i32 { x.into() * 2 }` 用 `double(3u8)` 能通过编译吗？" :options='["能，u8 实现了 Into&lt;i32&gt;", "不能，u8 没有实现 Into&lt;i32&gt;", "能但会溢出", "能编译但运行时 panic"]' answer="0" output="6" explain="u8 → i32 是标准库提供的 From 实现，因此 Into&lt;i32&gt; 成立；输出 6。" />

<FillBlank tpl="fn report&lt;T, U&gt;(a: &amp;T, b: &amp;U) -&gt; String\n___\n    T: Debug + Clone,\n    U: Debug,\n{\n    format!(&quot;{:?} {:?}&quot;, a, b)\n}" answers="where" hint="约束比较多时，把 bound 写在函数签名后面的关键字。" explain="where 子句让多参数、多约束的签名更易读，也能约束复合类型。" />

<Exercise title="把 KV 存储做成可混装" task="定义 `trait Storage { fn get(&self, k: &str) -&gt; Option&lt;String&gt;; }`，实现 `MemTable` 与 `FileTable` 两个类型；写两个函数：`fn count_keys&lt;S: Storage&gt;(s: &S) -&gt; usize`（泛型）和 `fn build_all() -&gt; Vec&lt;Box&lt;dyn Storage&gt;&gt;`（动态分发），并说明为什么后者不能用泛型返回值。" hints='["count_keys 可以再给 Storage 加 keys() 方法", "build_all 要在同一个 Vec 里放两种类型", "泛型返回值 impl Trait 要求所有分支同一具体类型"]' solution="trait Storage {\n    fn get(&amp;self, k: &amp;str) -&gt; Option&lt;String&gt;;\n    fn keys(&amp;self) -&gt; Vec&lt;String&gt;;\n}\n\nfn count_keys&lt;S: Storage&gt;(s: &amp;S) -&gt; usize { s.keys().len() }\n\nfn build_all() -&gt; Vec&lt;Box&lt;dyn Storage&gt;&gt; {\n    vec![Box::new(MemTable::default()), Box::new(FileTable::new())]\n}" explain="泛型版本可被内联，动态分发版本换来异构集合 —— 这正是选型表里的那条分界线。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `the trait bound X: Clone is not satisfied` | 补 bound，或确认类型确实实现了该 trait |
| `impl Trait` 多分支返回不同类型 | 改枚举统一，或 `Box<dyn Trait>` |
| `the size for values of type dyn Trait cannot be known` | trait object 是 unsized，放进 `Box` / `&` |
| `the trait cannot be made into an object` | trait 不对象安全（返回 Self / 泛型方法）；改设计 |
| 泛型导致二进制膨胀 | 抽非泛型内部函数，缩小泛型外壳 |
| `parameter T is never used` | 用 `PhantomData<T>` 标记，同时获得类型级区分 |

## 小结

- 泛型 = 把类型当参数，trait bound = 声明这个类型必须具备的能力。
- **单态化**让泛型零运行时开销，代价在编译期与产物体积。
- `impl Trait` 是匿名泛型；`dyn Trait` 用虚表做运行时分发，可混装异构类型。
- `PhantomData` 用零大小标记换类型安全。
- trait + 泛型/dyn + 依赖注入，是 L5 全部架构的底层手法。

<CheckList id="generics-check" title="学完本节，你应该能…" :items='["写出带 trait bound 的泛型函数与类型", "解释单态化为什么零成本、代价在哪", "区分 impl Trait 与 Box&lt;dyn Trait&gt; 的适用场景", "说出 trait object 的对象安全限制", "看懂 KV Server 里 trait + 泛型 / dyn 的分层"]' />

[上一讲：Trait 定义与实现 →](/core/traits.md) · [下一讲：智能指针 →](/core/smart-pointers.md)
