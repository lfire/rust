---
title: 第 22 讲 · 生命周期标注与省略规则
description: 什么时候必须写 'a、三条省略规则、带引用的结构体与 impl，以及生命周期 bound 与 'static。
---

<StageHeader stage="L3 · 第 22 讲" level="★★★★☆" time="28 分钟" goal="看懂 'a 标注并会写带引用的函数与结构体" prereq="第 21 讲 生命周期直觉" />

# 第 22 讲 · 生命周期标注与省略规则

[上一讲](/core/lifetime.md) 说「绝大多数情况不用写标注」。这一讲处理剩下那一小部分：**编译器推不出来时，怎么把关系说清楚**。

## 一、先看编译器为什么卡住

```rust
// ❌ error[E0106]: missing lifetime specifier
fn longest(x: &str, y: &str) -> &str {
    if x.len() > y.len() { x } else { y }
}
```

返回引用可能来自 `x`，也可能来自 `y`。编译器不能替你猜：如果按较长的那个算，调用方可能在较短的那个已经销毁后还拿着结果 —— 那就是悬空引用。

```text
help: consider introducing a named lifetime parameter
  |
  | fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
```

<Callout type="tip" title="顺着 help 改就行" text="E0106 的报错几乎总会给出建议的标注写法。新手不需要背规则，先按提示补上，再理解它为什么这么写。" />

## 二、`'a` 到底标了什么

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

fn main() {
    let a = String::from("short");
    let b = String::from("much longer");
    println!("{}", longest(&a, &b));
}
```

读作：**「`'a` 是 x、y 和返回值共同的最小存活范围」**。

三个最常见的误解：

| 误解 | 事实 |
| --- | --- |
| `'a` 给变量延寿 | 标注**不改变**任何值的实际存活时间 |
| `'a` 是运行时检查 | 只是给编译器的**描述**，编译期用完即弃 |
| 返回值能活到两个输入里较长的那个 | 恰好相反：取**较短**者，才保证两者都在 |

<Callout type="idea" title="一个比喻" text="生命周期标注像合同里的「有效期至」：它不生产商品，只是把「这个引用依赖于谁」写明白，让编译器去核对。函数签名就是这份合同 —— 调用方看签名就知道结果能用到什么时候。" />

<ConceptDiagram type="lifetime" title="返回值被约束在两个输入生命周期的交集内" />

### 不同参数不同生命周期

如果返回值只来自第一个参数，就别把两个参数绑成同一个 `'a`：

```rust
fn first<'a>(x: &'a str, _y: &str) -> &'a str { x }

fn main() {
    let a = String::from("long lived");
    {
        let b = String::from("short");
        let r = first(&a, &b);
        println!("{}", r);   // ✅ r 只依赖 a，不受 b 限制
    }
    println!("{}", a);
}
```

把所有引用都标成同一个 `'a` 是新手最常犯的「过度约束」：代码能编译，但调用方被无谓地绑短了。

## 三、三条省略规则（为什么平时不用写）

编译器内置三条推断规则，按顺序尝试：

1. **每个引用参数**各自获得一个独立的生命周期参数。
2. 如果**恰好只有一个**输入生命周期，它赋给所有输出生命周期。
3. 如果有多个输入生命周期，但其中一个是 `&self` / `&mut self`（方法），那么 `self` 的生命周期赋给所有输出。

```rust
// 规则 2：只有一个输入引用，返回值必然来自它
fn first_word(s: &str) -> &str {
    let bytes = s.as_bytes();
    for (i, &item) in bytes.iter().enumerate() {
        if item == b' ' { return &s[0..i]; }
    }
    &s[..]
}

struct Parser<'a> { input: &'a str }
// 规则 3：方法返回值默认绑到 self
impl<'a> Parser<'a> {
    fn rest(&self) -> &str { self.input }
}
```

<Compare title="什么时候要写标注" :panels='[{"label":"自动推导（多数情况）","code":"fn len(s: &str) -&gt; usize\nfn first_word(s: &str) -&gt; &str\nimpl Parser { fn rest(&self) -&gt; &str }","note":"一个输入引用，或方法有 &self"},{"label":"需要手写","code":"fn longest&lt;\x27a&gt;(x: &amp;\x27a str, y: &amp;\x27a str)\n    -&gt; &amp;\x27a str\nstruct Excerpt&lt;\x27a&gt; { part: &amp;\x27a str }","note":"多个输入且返回引用 / 结构体持有引用"}]' note="判断标准：编译器能不能从签名唯一确定「输出引用来自哪个输入」。" />

## 四、结构体持有引用

字段是引用时，必须标出它依赖谁的生命周期：

```rust
#[derive(Debug)]
struct Excerpt<'a> {
    part: &'a str,
}

fn main() {
    let novel = String::from("Rust 是一门很棒的语言");
    let first = novel.split(' ').next().unwrap();
    let e = Excerpt { part: first };
    println!("{:?}", e);
    // e 不能活得比 novel 久
}
```

含义是：`Excerpt` 的实例**不能比 `part` 指向的那段文本活得更久**。impl 块要重复声明同一个参数：

```rust
impl<'a> Excerpt<'a> {
    fn announce(&self, prefix: &str) -> String {
        format!("{}: {}", prefix, self.part)
    }
}
```

<Callout type="warn" title="不确定就拥有它" text="结构体带引用会让类型被生命周期参数「传染」：所有用到它的函数签名都得带上 `'a`，放进集合、跨线程、序列化都会变麻烦。业务模型里优先用 `String` 等拥有所有权的类型，只在确实做零拷贝解析（如解析器、视图对象）时才用引用字段。" />

## 五、生命周期 bound 与 `'static`

```rust
// T: 'a —— T 内部不能含有比 'a 更短的引用
struct Ref<'a, T: 'a> { value: &'a T }
```

`'static` 是最长的生命周期，两种常见用法：

| 写法 | 含义 |
| --- | --- |
| `let s: &'static str = "hi";` | 引用指向的数据活到程序结束（字面量） |
| `T: 'static` | T 里不含任何非 static 引用（**不等于**把值变成 static） |

```rust
fn spawn_task<F: Fn() + Send + 'static>(f: F) { /* ... */ }
// 要求闭包不借用栈上短命数据 —— 这正是 L4 thread::spawn 需要 move 的原因
```

**高阶生命周期（HRTB）** 初见时很吓人，其实只是「对任意生命周期都成立」：

```rust
// for<'a> 读作：对于任意 'a，这个函数都能处理 &'a str
fn apply(f: for<'a> fn(&'a str), s: &str) { f(s) }
```

新手阶段知道它是闭包 / 回调场景的写法即可，遇到再查。

<Quiz no="22-1" q="`fn longest&lt;'a&gt;(x: &amp;'a str, y: &amp;'a str) -&gt; &amp;'a str` 里的 `'a` 作用是？" :options='["延长 x 和 y 的寿命", "描述输入与输出引用之间的存活约束关系", "在运行时记录引用有效期", "把返回值变成 static"]' answer="1" explain="标注只描述关系，不改变作用域；所有检查都在编译期完成。" />

<Quiz no="22-2" q="三条省略规则中，方法里输出引用默认绑到谁？" :options='["第一个参数", "返回值自己", "&self 或 &mut self", "最长生命周期的参数"]' answer="2" explain="规则 3：有 &self 时，输出生命周期取 self 的，所以多数 getter 不用写标注。" />

<Quiz no="22-3" q="关于 `'static`，哪些说法正确？" :options='["字面量字符串是 &static str", "T: &static 表示 T 不含短命引用", "给变量标 static 就能让它活到程序结束", "标注不改变值实际存活时间"]' answer="0,1,3" multi="true" explain="不能靠标注给局部变量续命；要么真的把数据放进静态存储，要么用拥有所有权的类型。" />

<Predict no="22-4" q="两个输入都标同一个 'a 时，返回值能活多久？" :options='["到较长的那个输入销毁", "到较短的那个输入销毁", "永远", "由调用方决定"]' answer="1" output="到较短的那个输入销毁" explain="取交集才能保证返回引用在两个输入都有效时一定有效；这也是 E0597 的常见来源。" />

<FillBlank tpl="fn pick___(x: &amp;str, y: &amp;str) -&gt; &amp;str {\n    if x.len() &gt; y.len() { x } else { y }\n}" answers="'a" hint="泛型尖括号里写一个撇号加小写字母。" explain="正确写法是 fn pick&lt;'a&gt;(x: &amp;'a str, y: &amp;'a str) -&gt; &amp;'a str；本题只练标注本身。" />

<Exercise title="写出 Excerpt 并修好过度约束" task="1. 定义 `struct Excerpt&lt;'a&gt; { part: &amp;'a str }`，写方法 `fn len(&self) -&gt; usize`。2. 下面函数把两个输入绑成同一个 `'a`，导致调用方被无谓限制；请改成两个独立生命周期，使返回值只依赖 `x`。" hints='["impl 块要重复声明同一个生命周期参数", "给两个输入各用独立的生命周期参数，返回值只绑第一个", "只有一个输出引用时规则 2 能自动推导，但显式写出来更清楚"]' solution="struct Excerpt&lt;\x27a&gt; { part: &amp;\x27a str }\nimpl&lt;\x27a&gt; Excerpt&lt;\x27a&gt; {\n    fn len(&amp;self) -&gt; usize { self.part.len() }\n}\n\nfn f&lt;\x27a, \x27b&gt;(x: &amp;\x27a str, _y: &amp;\x27b str) -&gt; &amp;\x27a str { x }" explain="生命周期参数越少、约束越松，调用方越自由 —— 别习惯性把全部引用都写成同一个 'a。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| E0106 `missing lifetime specifier` | 按 help 补 `'a`，再检查是否真的需要返回引用 |
| E0597 但签名看起来对 | 返回值受较短输入约束，把值提到外层创建 |
| E0623 / `lifetime mismatch` | 两个本该独立的生命周期被标成同一个 |
| 结构体到处要带 `'a` | 优先改成拥有所有权的字段（`String`） |
| 以为 `'static` 能续命 | 它只是承诺，不是延长；用 `String` / `Arc` 更安全 |

## 小结

- `'a` 描述引用之间的约束，**不改变**存活时间，编译期检查、运行时零开销。
- 三条省略规则覆盖绝大多数函数；方法里输出默认绑 `&self`。
- 结构体持有引用要标注，但业务模型优先用拥有所有权的类型。
- `T: 'static` 是「不含短命引用」的 bound，与 `thread::spawn` 的 `move` 直接相关。
- 别把所有引用都绑成同一个 `'a`，那会过度约束调用方。

<CheckList id="lifetime-ann-check" title="学完本节，你应该能…" :items='["读懂 longest 里的三个 a 标注", "说出三条省略规则", "写出带引用字段的 struct 及其 impl", "解释 T: &static 的真实含义", "识别并修好过度约束"]' />

[上一讲：生命周期直觉 →](/core/lifetime.md) · [下一讲：struct、impl 与方法 →](/core/struct-enum.md)
