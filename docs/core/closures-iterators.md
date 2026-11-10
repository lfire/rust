---
title: 第 30 讲（下）· 闭包与迭代器
description: FnOnce / FnMut / Fn 的推导与包含关系、闭包的三种传参写法，以及惰性零成本的迭代器链。
---

<StageHeader stage="L3 · 第 30 讲（下）" level="★★★☆☆" time="25 分钟" goal="能写出闭包与迭代器链并说清它们的零成本来自哪里" prereq="第 30 讲（上）智能指针" />

# 第 30 讲（下）· 闭包与迭代器

[上篇](/core/smart-pointers.md) 收束了智能指针，这一篇收束闭包与迭代器。它们看起来像函数式语法糖，本质依然是 **trait + 泛型** —— 编译后和手写循环一样快。学完这一讲，L3 就结束了。

## 一、闭包到底是什么

编译器把每个闭包变成一个**匿名结构体**，捕获的外部变量就是它的字段，再为它实现 `Fn` / `FnMut` / `FnOnce` 之一：

```rust
fn main() {
    let factor = 3;
    let multiply = |x: i32| x * factor;
    println!("{}", multiply(7));   // 21
}
```

近似展开（概念示意，编译器生成的名字不同）：

```rust
struct __Closure<'a> { factor: &'a i32 }
impl Fn<(i32,)> for __Closure<'_> {
    extern "rust-call" fn call(&self, (x,): (i32,)) -> i32 { x * *self.factor }
}
```

<Callout type="idea" title="为什么闭包没有显式类型" text="每个闭包的匿名结构体都是独一无二的类型，写不出来。所以接收闭包的参数只能用 `impl Fn(...)` 或泛型 `F: Fn(...)`，不能写具体类型名。这也是 [第 29 讲](/core/generics.md) `impl Trait` 的典型用途。" />

## 二、三种闭包 trait

| trait | 对捕获变量做什么 | `call` 的 self | 能调用几次 |
| --- | --- | --- | --- |
| `Fn` | 只读借用 | `&self` | 任意多次 |
| `FnMut` | 可变借用 | `&mut self` | 任意多次 |
| `FnOnce` | 拿走所有权 | `self` | 最多一次 |

**包含关系**：`Fn` ⊂ `FnMut` ⊂ `FnOnce`。能反复只读调用的闭包，自然也满足「至少能调一次」；反过来不成立。所以接收 `FnOnce` 的函数最宽松，接收 `Fn` 最严格。

```rust
fn main() {
    let mut count = 0;
    let mut tick = || { count += 1; count };   // FnMut：改了环境
    println!("{} {}", tick(), tick());          // 1 2

    let s = String::from("hi");
    let consume = move || { println!("{}", s); s.len() };  // FnOnce
    println!("{}", consume());
    // consume();   // ❌ 已被消耗
}
```

<Compare title="三种捕获方式" :panels='[{"label":"Fn（借用）","code":"let n = 5;\nlet f = || println!(\"{}\", n);\nf(); f();\nprintln!(\"{}\", n);","note":"n 仍可用"},{"label":"FnMut（可变借用）","code":"let mut n = 0;\nlet mut f = || n += 1;\nf(); f();","note":"借用期间不能再读 n"},{"label":"FnOnce（移动）","code":"let s = String::from(\"hi\");\nlet f = move || drop(s);\nf();","note":"所有权进了闭包"}]' note="编译器按闭包体怎么使用变量来自动挑选 trait，你不用手动声明。" />

### `move` 关键字

`move` 强制把捕获变量的所有权移进闭包。它的典型用途是**跨线程**：新线程可能比当前函数活得久，不能借用栈上局部变量（[第 31 讲](/concurrency/send-sync.md) 会展开 `'static` bound）。

<Callout type="warn" title="move 不等于 FnOnce" text="`move` 只决定「变量怎么进闭包」，不决定实现哪个 Fn trait。一个 `move` 闭包如果只读捕获的变量，仍然是 `Fn`，可以反复调用。这两个维度别混。" />

### 闭包作为参数 / 返回值

```rust
// 1. 参数：impl Fn（匿名泛型，最简洁）
fn apply_twice<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 { f(f(x)) }

// 2. 返回值：必须 impl Fn（不能返回具体类型）
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n
}

// 3. 需要混装不同类型 / 存进容器：Box<dyn Fn>
let callbacks: Vec<Box<dyn Fn(i32)>> = vec![
    Box::new(|x| println!("A {}", x)),
    Box::new(move |x| println!("B {}", x + 1)),
];

fn main() {
    println!("{}", apply_twice(|x| x * 2, 3));   // 12
    println!("{}", make_adder(5)(3));            // 8
}
```

## 三、迭代器：惰性的流水线

```rust
fn main() {
    let nums = vec![1, 2, 3, 4, 5, 6];
    let result: Vec<i32> = nums.iter()
        .filter(|&&x| x % 2 == 0)
        .map(|&x| x * 10)
        .collect();
    println!("{:?}", result);     // [20, 40, 60]
}
```

三个关键性质：

- **惰性**：`map` / `filter` 只搭流水线，不消费就什么都不做。
- **零成本**：整条链编译后通常是一个紧凑循环，没有中间 `Vec`、没有虚调用。
- **消费型**：`collect` / `sum` / `count` / `for` 会消耗迭代器；适配器不会。

<Predict no="30-1" q="`vec![1,2,3].iter().map(|x| x + 1);` 单独一行会？" :options='["立即算出 [2,3,4]", "什么都不做，并给出 unused 警告", "原地修改原 Vec", "运行时 panic"]' answer="1" output="（无输出）warning: unused `Map` that must be used" explain="迭代器惰性；必须被 collect / sum / for 消费才真正执行。" />

### 常用适配器速查

| 适配器 | 作用 |
| --- | --- |
| `map` / `filter` / `filter_map` | 变换、筛选、变换并丢弃 None |
| `take` / `skip` / `step_by` | 截取、跳过、按步长 |
| `enumerate` / `zip` | 带索引、两两配对 |
| `flat_map` / `flatten` | 摊平嵌套 |
| `fold` / `reduce` | 聚合成一个值 |
| `any` / `all` / `find` | 短路判断与查找 |
| `collect` | 收集成 `Vec` / `HashMap` / `String` 等 |

```rust
let words = ["rust", "go", "rust"];
let counts = words.iter().fold(std::collections::HashMap::new(), |mut m, w| {
    *m.entry(*w).or_insert(0) += 1;
    m
});
```

<Callout type="tip" title="`collect` 常常需要类型标注" text="`collect()` 的目标类型由上下文推断，推不出来就报 `type annotations needed`。写 `let v: Vec&lt;_&gt; = ...collect();` 或用 turbofish `collect::&lt;Vec&lt;_&gt;&gt;()` 即可。" />

### `filter` 里的双重引用

`iter()` 产出 `&i32`，`filter` 的闭包参数又是这个引用的引用，所以是 `|&&x|`。想少写一层用 `.copied()`：

```rust
let passed: Vec<i32> = scores.iter().copied().filter(|&s| s >= 60).collect();
```

### 自定义 Iterator

```rust
struct Countdown(u32);

impl Iterator for Countdown {
    type Item = u32;
    fn next(&mut self) -> Option<u32> {
        if self.0 == 0 { None } else { self.0 -= 1; Some(self.0 + 1) }
    }
}

fn main() {
    for n in Countdown(3) { println!("{}", n); }   // 3 2 1
    let v: Vec<_> = Countdown(5).filter(|n| n % 2 == 0).collect();
    println!("{:?}", v);
}
```

`Iterator` 只有一个必须实现的 `next`，其余几十个适配器都是 **trait 默认方法** —— 这是 [第 28 讲](/core/traits.md) 默认方法威力最好的例子。任何实现 `IntoIterator` 的类型都能进 `for` 循环。

## 四、零成本从哪来

```rust
// 手写循环
let mut sum = 0;
for x in &v { if *x % 2 == 0 { sum += *x * 10; } }

// 迭代器链（编译后基本等价）
let sum: i32 = v.iter().filter(|&&x| x % 2 == 0).map(|&x| x * 10).sum();
```

因为适配器都是**泛型 + 内联**，LLVM 能把整条链融合成一个循环（loop fusion），既不分配中间集合，也没有函数指针调用。零成本的前提是链式调用能被单态化 —— 如果中途塞进 `Box<dyn Iterator>`，就会引入动态分发。

<Quiz no="30-2" q="关于 `Fn` / `FnMut` / `FnOnce`，哪些说法正确？" :options='["Fn 只读借用捕获变量", "FnMut 会可变借用捕获变量", "FnOnce 拿走所有权，最多调一次", "包含关系是 Fn 包含 FnMut 包含 FnOnce"]' answer="0,1,2" multi="true" explain="包含关系反了：Fn ⊂ FnMut ⊂ FnOnce，即能当 Fn 用的一定能当 FnOnce 用。" />

<Quiz no="30-3" q="闭包里写了 `move`，意味着？" :options='["该闭包一定只能调用一次", "捕获变量的所有权被移进闭包", "闭包会在新线程执行", "闭包变成不可变"]' answer="1" explain="move 只决定捕获方式；实现哪个 Fn trait 仍由闭包体怎么用变量决定。" />

<Quiz no="30-4" q="为什么迭代器的 `map` / `filter` 通常零成本？" :options='["运行时做了 JIT 编译", "泛型单态化 + 内联让整条链融合成一个循环", "它们其实不执行任何代码", "标准库用了 unsafe 跳过检查"]' answer="1" explain="适配器是泛型默认方法，编译期就能展开；前提是没有中途装箱成 dyn Iterator。" />

<Exercise title="用一条链做统计" task="给 `let scores = vec![58, 92, 73, 45, 88, 100];`，用一条迭代器链求出所有及格（>= 60）分数的平均值，不要显式 for 循环；再用 `fold` 写成一次性算出 (总和, 个数) 的版本。" hints='["先 copied() 再 filter，避免双重引用", "平均值注意转 f64 并处理空列表", "fold 初始值是 (0i32, 0usize)"]' solution="fn main() {\n    let scores = vec![58, 92, 73, 45, 88, 100];\n    let passed: Vec&lt;i32&gt; = scores.iter().copied().filter(|&amp;s| s &gt;= 60).collect();\n    let avg = passed.iter().sum::&lt;i32&gt;() as f64 / passed.len() as f64;\n    println!(&quot;人数 {} 平均 {}&quot;, passed.len(), avg);\n\n    let (total, n) = scores.iter().copied().filter(|&amp;s| s &gt;= 60)\n        .fold((0i32, 0usize), |(t, c), s| (t + s, c + 1));\n    println!(&quot;{} / {}&quot;, total, n);\n}" explain="fold 版不产生中间 Vec，是迭代器零成本优势最直接的用法。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `type annotations needed` on collect | 给目标变量标类型或用 turbofish |
| `filter` 里类型不匹配 | 用 `copied()` 或写对 `\|&&x\|` |
| 迭代器链「没执行」 | 忘了 `collect` / `sum` / `for` 消费 |
| 闭包报「可能活得比借用久」 | 加 `move`，下一讲会解释原因 |
| `use of moved value` after `into_iter` | 按值迭代消耗了集合，改用 `iter()` |

## 小结

- 闭包是匿名结构体 + 捕获字段，由编译器实现 `Fn` / `FnMut` / `FnOnce`（包含关系 `Fn ⊂ FnMut ⊂ FnOnce`）。
- `move` 决定捕获方式，与实现哪个 Fn trait 是两回事。
- 闭包传参用 `impl Fn` / 泛型，混装用 `Box<dyn Fn>`。
- 迭代器**惰性 + 零成本**，靠泛型单态化与内联融合成单个循环。
- `Iterator` 只需实现 `next`，其余适配器是默认方法。

<CheckList id="closures-check" title="学完本节，你应该能…" :items='["写出捕获环境的闭包并判断它实现哪个 Fn trait", "解释 move 的真正作用", "用 impl Fn 把闭包传进函数或返回出来", "用一条迭代器链完成过滤、变换与聚合", "解释迭代器为什么零成本"]' />

阶段三到此结束 🎉 你已经掌握了 Rust 最核心的机制。接下来把它们放到并发场景里检验。

[上篇：智能指针 →](/core/smart-pointers.md) · [进入 L4 第 31 讲：数据竞争与 Send/Sync →](/concurrency/send-sync.md)
