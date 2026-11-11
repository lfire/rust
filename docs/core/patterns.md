---
title: 第 25 讲 · 模式匹配进阶
description: 解构、匹配守卫、@ 绑定、if let / let else、ref 与穷举检查，把 match 从分支语句用成数据提取工具。
---

<StageHeader stage="L3 · 第 25 讲" level="★★★☆☆" time="45 分钟" goal="能用模式直接把值拆开并绑定" prereq="第 24 讲 enum / Option / Result" />

# 第 25 讲 · 模式匹配进阶

`match` 在 Rust 里不只是 switch。它更像「按形状拆包」：一边判断值是哪种情况，一边把里面的数据绑定到变量。把这件事用熟，很多 `if + unwrap + 下标取值` 的样板代码会直接消失。

## 一、解构：一次把值拆开

```rust
struct Point { x: i32, y: i32 }
enum Shape { Circle(f64), Rect { w: f64, h: f64 }, Nothing }

fn describe(s: Shape) -> String {
    match s {
        Shape::Circle(r)              => format!("圆，半径 {}", r),
        Shape::Rect { w, h } if w == h => format!("正方形，边长 {}", w),
        Shape::Rect { w, h }          => format!("矩形 {}x{}", w, h),
        Shape::Nothing                => "空".into(),
    }
}

fn main() {
    let (a, b) = (1, 2);                         // 元组解构
    let Point { x, y: renamed } = Point { x: 3, y: 4 };  // 字段重命名
    let [first, .., last] = [1, 2, 3, 4];       // 切片解构
    println!("{} {} {} {} {} {}", a, b, x, renamed, first, last);
}
```

<Compare title="取一个嵌套字段" :panels='[{"label":"层层判断","code":"if let Some(u) = opt {\n    if u.profile.is_some() {\n        let p = u.profile.unwrap();\n        println!(\"{}\", p.name);\n    }\n}","note":"两次判断 + 一次 unwrap"},{"label":"一次匹配","code":"if let Some(User { profile: Some(p), .. }) = opt {\n    println!(\"{}\", p.name);\n}","note":"形状与取值一次完成"}]' note="模式可以嵌套任意深度，`..` 忽略其余字段。" />

## 二、匹配守卫与 `@` 绑定

**守卫（`if`）** 在模式匹配成功后追加条件；**`@`** 在匹配的同时把整个值绑给一个变量。

```rust
fn classify(n: i32) -> &'static str {
    match n {
        x @ 0..=9        => { println!("个位数 {}", x); "small" }
        x if x < 0       => "negative",
        10 | 20 | 30     => "round",
        _                => "other",
    }
}
```

<Callout type="warn" title="守卫不影响穷举检查" text="编译器**不会**把守卫当作一个可穷尽的分支：`Some(x) if x > 0` 之后仍必须写 `Some(_)` 或 `_`。因为守卫是任意布尔表达式，编译器无法证明它覆盖所有情况。" />

## 三、`if let` / `while let` / `let else`

```rust
// 只关心一种形状
if let Some(v) = opt { println!("{}", v); }

// 循环里持续取出，直到模式不匹配
while let Some(item) = rx.recv().ok() { handle(item); }

// let else：不匹配就必须提前离开（适合「取不到就返回」的开场校验）
let Some(cfg) = load_config() else {
    eprintln!("配置缺失");
    return;
};
// 此后 cfg 已是可直接使用的类型，不需要再缩进一层
```

`let else` 是减少嵌套的利器：把「失败提前退出」写在前面，主逻辑保持在顶层缩进。

## 四、ref / mut 与所有权

匹配一个**引用**时，默认绑定的也是引用（match ergonomics），不会意外移动值：

```rust
let s = Some(String::from("hi"));
match &s {
    Some(text) => println!("{}", text),   // text: &String，s 仍可用
    None => {}
}
println!("{:?}", s);                      // ✅ 没被移动
```

若确实要在模式里取得可变引用，用 `ref mut`：

```rust
let mut n = Some(1);
if let Some(ref mut v) = n { *v += 1; }
assert_eq!(n, Some(2));
```

<OwnershipLab scene="borrow" />

## 五、穷举检查是重构护城河

给 enum 新增变体后，所有 `match` 会立刻报 `non-exhaustive patterns`，把需要跟着改的地方一次性列全。这正是 [KV 第 1 步](/projects/kv/1-memory.md) 敢在第 4 步加 `Publish` / `Subscribe` 的原因。

```rust
#[non_exhaustive]           // 库作者用：外部 crate 必须写 _ 兜底
pub enum PublicError { Io, Parse }
```

<Predict no="25-1" q="下面这段输出什么？" :options='["6", "编译错误", "0", "panic"]' answer="0" output="6" explain="x @ 1..=5 在匹配的同时把值绑给 x，乘 2 得到 6。" />

```rust
fn main() {
    let n = 3;
    let r = match n { x @ 1..=5 => x * 2, _ => 0 };
    println!("{}", r);
}
```

<Quiz no="25-2" q="关于匹配守卫，哪个说法正确？" :options='["守卫能替代 _ 兜底分支", "编译器不把守卫计入穷举检查，仍需兜底", "守卫只能用于整数", "守卫会在模式匹配前执行"]' answer="1" explain="守卫是任意布尔表达式，编译器无法证明它覆盖所有情况。" />

<FillBlank tpl="let Some(cfg) = load_config() ___ {\n    return;\n};" answers="else" hint="不匹配就必须提前离开的写法，关键字是 4 个字母。" explain="let else 的 else 块必须发散（return / break / panic），之后变量才保证可用。" />

<Exercise title="用一次匹配解析命令" task="定义 `enum Cmd { Get(String), Set(String, i32), List, Quit }`，写 `fn run(cmd: Cmd) -&gt; String`，要求：Set 的 value 为负数时返回错误提示（用守卫），其余分支返回描述；再用 `if let` 单独处理 Quit 做一次对比。" hints='["Set(k, v) if *v &lt; 0 需要解引用，或改用 Set(k, v) if v &lt; 0 看绑定类型", "List 与 Quit 用简单分支", "if let Cmd::Quit = cmd 只匹配一种形状"]' solution="fn run(cmd: Cmd) -&gt; String {\n    match cmd {\n        Cmd::Get(k) =&gt; format!(&quot;GET {}&quot;, k),\n        Cmd::Set(k, v) if v &lt; 0 =&gt; format!(&quot;非法值 {}&quot;, v),\n        Cmd::Set(k, v) =&gt; format!(&quot;SET {} {}&quot;, k, v),\n        Cmd::List =&gt; &quot;LIST&quot;.into(),\n        Cmd::Quit =&gt; &quot;BYE&quot;.into(),\n    }\n}" explain="守卫分支要放在普通 Set 分支之前，否则会被先匹配掉。" />

## 六、编译期的模式匹配：声明宏

前面几节都在用 `match` 匹配**运行期的值**。Rust 还有一套在**编译期**做模式匹配的机制：宏。它接收的不是数据而是**代码**，按规则匹配后展开成另一段合法 Rust 代码，再交给编译器。`println!`、`vec!`、`#[derive(Debug)]` 背后都是它在工作。

<Callout type="note" title="这一节是扩展，不属于所有权主线" text="宏是模式匹配思路的延伸，但和 L3 的所有权、借用、生命周期不是一条线。第一次读可以跳过去，等后面在 L5 项目里被 `#[derive]`、`#[tokio::main]` 绊住了再回来看，不会影响后续讲次。" />

<Callout type="idea" title="为什么放在这一讲" text="`macro_rules!` 的规则本身就是模式：左边写要匹配的代码形状，右边写要生成的代码。`$x:expr` 像一个绑定，`$(...),*` 像对重复项的匹配。理解了解构与绑定，声明宏只是把同一套思路用在 token 上。" />

### 第一个声明宏

```rust
macro_rules! add {
    ($a:expr, $b:expr) => { $a + $b };  // 两个参数
    ($a:expr)          => { $a };        // 边界：只有一个参数
}

fn main() {
    println!("{}", add!(1, 2));
    println!("{}", add!(7));
}
```

宏里可以写多个分支，编译器按实参形状挑第一个匹配的。`$a:expr` 中的 `expr` 是**片段类型**，常见的还有：

| 片段 | 匹配什么 | 片段 | 匹配什么 |
| --- | --- | --- | --- |
| `expr` | 表达式 | `ty` | 类型 |
| `ident` | 标识符 | `path` | 路径 |
| `stmt` | 语句 | `item` | 一个条目（函数、结构体等） |
| `tt` | 单棵 token 树 | `literal` | 字面量 |

生成代码时用 `$a` 引用捕获到的片段。

### 重复模式：任意多个参数

```rust
macro_rules! add_all {
    ( $($a:expr),* ) => {
        {
            0 $( + $a )*   // 用 0 开头，顺便处理「一个参数都没有」
        }
    };
}

fn main() {
    println!("{}", add_all!());         // 0
    println!("{}", add_all!(1, 2, 3));  // 6
}
```

`$(...)` 包住可重复的部分，紧跟的符号决定次数：`*` 零到多次、`+` 一到多次、`?` 零或一次；分隔符（这里是逗号）也属于模式的一部分。调用时 `()`、`[]`、`{}` 都合法，习惯上列表用 `[]`、函数调用式用 `()`。

### 让宏跨模块可用

| 场景 | 写法 | 说明 |
| --- | --- | --- |
| 导出到当前 crate 根 | `#[macro_export] macro_rules! foo { ... }` | 不导出就只能在同一模块内、且定义在调用之前使用 |
| 同 crate 内按路径调用 | `crate::foo!()` / `super::foo!()` | 宏也遵循模块路径 |
| 别的 crate 引入 | `use mycrate::foo;` | 现代写法，用到哪个引哪个 |
| 一次引入某 crate 全部宏 | `#[macro_use] extern crate mycrate;` | Rust 早期遗留写法，老代码里会见到 |

想看清宏展开了什么，装 `cargo expand` 后运行 `cargo expand`，它会打印展开后的完整 Rust 代码 —— 这是学宏最有效的工具。

### 过程宏：三种形态

声明宏靠「模式匹配 + 模板替换」；过程宏则是**一段 Rust 程序**，直接读写 token 流，能力更强、编写门槛也更高。

| 形态 | 写法 | 做什么 | 典型例子 |
| --- | --- | --- | --- |
| 派生宏 | `#[derive(Debug, Clone)]` | 给紧跟的类型自动生成 trait 实现 | `Debug`、`Clone`、`thiserror::Error`、`serde::Serialize` |
| 属性宏 | `#[tokio::main]`、`#[test]` | 改写所标注的整个条目 | 把 `async fn main` 包进 runtime、注册测试 |
| 函数宏 | `sql!(...)`、`html!(...)` | 像函数一样调用，甚至可以接受非 Rust 语法 | 在 Rust 代码里内嵌 SQL、模板 DSL |

先做到**会用、能读懂**即可，自定义过程宏通常单独建一个 `proc-macro` crate，等真正需要造 DSL 时再深入。

<Callout type="warn" title="别把宏当锤子" text="函数或泛型能简洁表达的，就别写宏。宏难调试、IDE 支持也弱，滥用会让代码难以理解；它真正适合的是消灭重复样板、接受变长参数、给类型批量加能力、以及造 DSL。另外注意 `#[macro_use]` 只会在老代码里遇到，新代码请显式 `use`。" />

<Quiz no="25-3" q="`macro_rules!` 里 `$t:ty` 匹配的是什么？" :options='["一个类型", "一个表达式", "一个标识符", "一条语句"]' answer="0" explain="`ty` 匹配类型；表达式用 `expr`，标识符用 `ident`，语句用 `stmt`。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 加了守卫仍报 non-exhaustive | 补 `_` 或覆盖全部变体的兜底分支 |
| 匹配后原变量不能用了 | 匹配的是值而非引用，改用 `match &v` 或 `ref` |
| 守卫分支永远不生效 | 顺序错了：更具体的分支要放前面 |
| `let else` 编译失败 | else 块没有发散（缺 return / break / panic!） |
| 解构 struct 报字段私有 | 在同模块内匹配，或给字段加 `pub` |

## 扩展挑战

- 用 `matches!` 宏简化「只判断形状不取值」的场景。
- 用切片模式实现一个简单的命令行参数解析器。
- 给 [第 49 讲 SQL 工具](/projects/sql-data-tool.md) 的 AST 求值加守卫，处理类型不匹配的情况。
- 阅读 [KV 第 4 步 重构](/projects/kv/4-refactor.md)，看新增枚举变体后编译器如何列出所有待改的 match。

<CheckList id="patterns-check" title="验收清单" :items='["能解构 struct / enum / 元组 / 切片", "会用匹配守卫与 @ 绑定", "知道守卫不影响穷举检查", "能用 let else 减少嵌套", "理解匹配引用时不会意外移动"]' />

[上一讲：enum、Option 与 Result →](/core/enums.md) · [下一讲：集合容器 →](/core/collections.md)
