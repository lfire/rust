---
title: 第 24 讲 · enum、Option 与 Result
description: 用 enum 表达「几种可能之一」，理解变体带数据、Option 消灭空值、Result 编码失败。
---

<StageHeader stage="L3 · 第 24 讲" level="★★★☆☆" time="25 分钟" goal="能用 enum 建模并用 Option / Result 表达缺失与失败" prereq="第 23 讲 struct、impl 与方法" />

# 第 24 讲 · enum、Option 与 Result

[上一讲](/core/struct-enum.md) 的 `struct` 表达「**同时**有这些字段」；`enum` 表达的是「**恰好是**这几种情况之一」。这个区别看着小，却是 Rust 能取消空指针、取消异常的关键。

## 一、enum 的四种变体形态

```rust
enum Direction { Up, Down, Left, Right }              // 1. 无数据

enum Message {
    Quit,                                           // 2. 单元变体
    Text(String),                                   // 3. 元组变体，带一个值
    Move { x: i32, y: i32 },                        // 4. 结构体变体，带具名字段
    ChangeColor(u8, u8, u8),                        //    元组变体，可带多个值
}

fn handle(msg: Message) {
    match msg {
        Message::Quit                    => println!("退出"),
        Message::Text(s)                 => println!("文本：{}", s),
        Message::Move { x, y }           => println!("移动到 {}, {}", x, y),
        Message::ChangeColor(r, g, b)    => println!("颜色 {} {} {}", r, g, b),
    }
}
```

C / Java 的枚举本质是「带名字的整数」；Rust 的枚举是**和类型（sum type）**，每个变体可以携带不同形状的数据。

<Compare title="表达「几种可能」" :panels='[{"label":"TypeScript 联合类型","code":"type Msg =\n  | { kind: \"quit\" }\n  | { kind: \"text\"; s: string }\n  | { kind: \"move\"; x: number }","note":"靠 kind 字段人工判别，容易漏分支"},{"label":"Rust enum","code":"enum Msg {\n    Quit,\n    Text(String),\n    Move { x: i32, y: i32 },\n}","note":"变体即标签，编译器强制穷举"}]' note="Rust 把「判别标签」做进了类型本身，所以不需要手写 kind 字段，也不会漏处理。" />

### 内存布局

编译器给每个值加一个 **tag**（哪个变体），再留出能容纳**最大变体**的空间：

```text
Message::Text("hi")        → [ tag=1 ][ String 三字结构        ]
Message::Move{x:1,y:2}     → [ tag=2 ][ i32 ][ i32 ][ 填充      ]
```

因此 `size_of::<Message>()` 由最大变体决定，而不是所有变体之和。像 `Option<&T>` 这种还能做**空指针优化（niche）**：用 `null` 表示 `None`，整个枚举不比一根指针大，零额外开销。

<Callout type="warn" title="递归类型必须加 Box" text="`enum List { Cons(i32, List), Nil }` 会编译失败：类型无限嵌套，大小算不出来。要写成 `Cons(i32, Box&lt;List&gt;)`，用一根固定大小的指针打断递归 —— [第 30 讲 智能指针](/core/smart-pointers.md) 会展开。" />

## 二、`Option<T>`：没有空指针

```rust
enum Option<T> {
    Some(T),
    None,
}
```

Rust **没有 `null` / `undefined`**。任何「可能没有值」的地方，类型都必须是 `Option<T>`，编译器会逼你处理 `None`：

```rust
fn find(id: u32) -> Option<String> {
    if id == 1 { Some(String::from("小明")) } else { None }
}

fn main() {
    match find(2) {
        Some(name) => println!("找到了 {}", name),
        None       => println!("没找到"),
    }
}
```

<ConceptDiagram type="error" title="Some / None 两条路径必须都出现，无法假装「没有」不存在" />

### 常用组合子

```rust
let maybe: Option<i32> = Some(4);

let a = maybe.map(|n| n * 2);              // Some(8)
let b = maybe.and_then(|n| if n > 2 { Some(n - 1) } else { None });
let c = maybe.unwrap_or(0);                // 4；None 时给默认值
let d = maybe.ok_or("没有值");              // Result<i32, &str>
```

| 方法 | 用途 | 危险程度 |
| --- | --- | --- |
| `map` / `and_then` | 链式变换，None 自动穿透 | 安全 |
| `unwrap_or` / `unwrap_or_else` | 给默认值 | 安全 |
| `?` | 在返回 Option 的函数里提前返回 None | 安全 |
| `unwrap` / `expect` | 直接取出，None 时 panic | **仅原型 / 确定非空时用** |

<Callout type="tip" title="为什么 Option 不是「语法糖」" text="它让「这里可能没有值」出现在**类型签名**里。调用方看到 `Option<User>` 就必须决定怎么处理 None，而不是像 JS 那样等到 `Cannot read property 'name' of null` 才发现。这类错误从运行时提前到了编译期。" />

## 三、`Result<T, E>`：把失败写进类型

```rust
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

```rust
use std::fs;

fn main() {
    match fs::read_to_string("config.txt") {
        Ok(text) => println!("读到 {} 字节", text.len()),
        Err(e)   => println!("读取失败：{}", e),
    }
}
```

和 `Option` 的区别只是：`Err` 还带上了**失败原因**。完整的错误链、`?` 传播、`thiserror` / `anyhow` 留给 [第 27 讲 错误处理](/core/error-handling.md)。

<Compare title="三条错误处理路线" :panels='[{"label":"返回码 / null","code":"int r = do();\nif (r == -1) { ... }","note":"容易忘记检查"},{"label":"异常","code":"try { do(); }\ncatch (e) { ... }","note":"错误路径在签名里看不见"},{"label":"Result","code":"let x = do()?;\n// 不处理就编译不过","note":"失败是类型的一部分"}]' note="Rust 的选择：让「可能失败」在类型签名里显式可见。" />

## 四、穷举检查是重构护城河

`match` 必须覆盖所有变体，漏一个就报 `non-exhaustive patterns`。给 enum 新增变体后，编译器会**一次性列出所有需要跟着改的 match** —— 这正是 [KV 第 1 步](/projects/kv/1-memory.md) 敢在第 4 步加 `Publish` / `Subscribe` 的原因。模式解构、守卫等进阶写法见 [第 25 讲](/core/patterns.md)。

<Predict no="24-1" q="`match Some(5) { Some(v) =&gt; println!(&quot;{}&quot;, v) }` 会？" :options='["正常打印 5", "运行时 panic", "编译失败：None 未覆盖", "打印空"]' answer="2" output="error[E0004]: non-exhaustive patterns: `None` not covered" explain="穷举检查在编译期完成，这就是 Rust 敢取消 null 的底气。" />

<Quiz no="24-2" q="关于 enum 变体，哪个说法正确？" :options='["变体只能是不带数据的整数标签", "每个变体可以携带不同类型 / 个数的数据", "所有变体大小必须相同", "enum 不能带泛型"]' answer="1" explain="变体可以是单元、元组或结构体形态，各自携带不同数据；整体大小取最大变体。" />

<Quiz no="24-3" q="`Option&lt;&amp;T&gt;` 常常不比一根指针大，是因为？" :options='["编译器省略了 None", "空指针优化（niche），用 null 表示 None", "&T 本身就是 0 字节", "Option 是零大小类型"]' answer="1" explain="引用不可能为 null，编译器把这个非法位模式借来表示 None，因此零额外开销。" />

<Quiz no="24-4" q="关于 Option / Result，哪些说法正确？" :options='["Rust 没有 null，缺失用 Option 表达", "Result 的 Err 会带失败原因", "unwrap 在生产代码中应优先使用", "? 能把 None / Err 提前返回给上层"]' answer="0,1,3" multi="true" explain="unwrap 遇 None/Err 会 panic，正式代码应换成 ?、unwrap_or 或 match。" />

<FillBlank tpl="fn first_char(s: &str) -&gt; ___&lt;char&gt; {\n    s.chars().next()\n}" answers="Option" hint="可能没有字符（空字符串），返回值要能表达「可能没有」。" explain="chars().next() 恰好返回 Option&lt;char&gt;，正好匹配。" />

<Exercise title="给待办清单加状态" task="定义 `enum State { Todo, Doing { owner: String }, Done }` 和 `struct Task { title: String, state: State }`，写 `fn label(&self) -&gt; String` 用 match 返回不同描述；再写一个 `fn owner_of(t: &Task) -&gt; Option&lt;&amp;str&gt;` 只在 Doing 时返回负责人。" hints='["Doing 变体带具名字段，解构写 State::Doing { owner }", "owner_of 返回借用，注意生命周期省略规则", "其它两个分支返回 None"]' solution="enum State { Todo, Doing { owner: String }, Done }\nstruct Task { title: String, state: State }\n\nimpl Task {\n    fn label(&amp;self) -&gt; String {\n        match &amp;self.state {\n            State::Todo =&gt; format!(&quot;待办：{}&quot;, self.title),\n            State::Doing { owner } =&gt; format!(&quot;进行中：{} ({})&quot;, self.title, owner),\n            State::Done =&gt; format!(&quot;完成：{}&quot;, self.title),\n        }\n    }\n}\n\nfn owner_of(t: &amp;Task) -&gt; Option&lt;&amp;str&gt; {\n    match &amp;t.state {\n        State::Doing { owner } =&gt; Some(owner.as_str()),\n        _ =&gt; None,\n    }\n}" explain="match &amp;self.state 借用而非移动，才能继续用 self.title；这也是第 18 讲借用规则的实际应用。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `non-exhaustive patterns` | 补上漏掉的变体或 `_` 兜底 |
| `use of moved value` after match | 匹配 `&value` 而不是 `value` |
| 递归 enum 编译失败 | 用 `Box` 打断无限嵌套 |
| 满屏 `unwrap()` | 换成 `?` / `unwrap_or` / `match` |
| 想给 enum 加方法 | `impl Message { fn ... }` 和 struct 完全一样 |

## 小结

- `enum` 是和类型，变体可携带不同形状的数据；大小由最大变体决定。
- `Option<T>` 消灭空指针，`Result<T, E>` 把失败写进类型签名。
- 组合子与 `?` 让「缺失 / 失败」的传播保持简洁；`unwrap` 只用于原型。
- 穷举检查让新增变体时的重构由编译器兜底。
- 下一讲把 `match` 的解构能力完整展开。

<CheckList id="enums-check" title="学完本节，你应该能…" :items='["定义四种形态的 enum 变体", "解释 enum 的内存布局与 niche 优化", "用 Option 表达缺失并选择合适的组合子", "说明 Result 与异常处理的差别", "利用穷举检查安全地给 enum 加变体"]' />

[上一讲：struct、impl 与方法 →](/core/struct-enum.md) · [下一讲：模式匹配进阶 →](/core/patterns.md)
