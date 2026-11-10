---
title: 第 20 讲 · 切片 &str 与 &[T]
description: 胖指针内存布局、UTF-8 字节索引陷阱、Deref 强制转换，以及零拷贝解析与借用规则。
---

<StageHeader stage="L3 · 第 20 讲" level="★★★☆☆" time="25 分钟" goal="能安全地对字符串与序列做零拷贝切片" prereq="第 19 讲 可变借用与借用规则" />

# 第 20 讲 · 切片 `&str` 与 `&[T]`

[第 18 讲](/core/borrowing.md) 说过切片是「一种特殊的引用」。这一讲把它拆开看：**切片到底是什么、为什么参数都爱用它、以及中文切片为什么会 panic**。

## 一、切片是胖指针

普通引用 `&T` 只存一根地址；切片 `&[T]` / `&str` 存**两根**：

```text
&[T]  →  [ 指向首元素的指针 | 元素个数 len ]
&str  →  [ 指向首字节的指针 | 字节数 len ]
```

```rust
fn main() {
    let arr = [10, 20, 30, 40, 50];
    let part: &[i32] = &arr[1..4];       // 20, 30, 40

    println!("长度 {} 首元素 {}", part.len(), part[0]);

    let s = String::from("hello world");
    let word: &str = &s[0..5];           // "hello"
    println!("{}", word);
}
```

<ConceptDiagram type="stack-heap" title="切片变量在栈上是 ptr+len，数据仍在原来的堆/栈上" />

关键性质：**切片不拥有数据，也不复制数据**。它只是给一段连续内存加了个「从哪开始、有多长」的视图 —— 这就是零拷贝解析的基础。

<Compare title="三种「一段数据」" :panels='[{"label":"拥有数据","code":"let v: Vec&lt;i32&gt; = vec![1,2,3];\nlet s: String = String::from(\"hi\");","note":"分配堆内存、负责释放"},{"label":"借用切片","code":"let p: &amp;[i32] = &amp;v[..];\nlet w: &amp;str = &amp;s[..];","note":"零拷贝视图，不负责释放"},{"label":"数组","code":"let a: [i32; 3] = [1,2,3];","note":"长度是类型的一部分，全在栈上"}]' note="函数只读数据时优先接切片，调用方可以是 Vec、数组、String 或字面量。" />

## 二、为什么参数都写 `&[T]` / `&str`

```rust
fn sum(nums: &[i32]) -> i32 { nums.iter().sum() }
fn greet(name: &str) -> String { format!("你好 {}", name) }

fn main() {
    let arr = [1, 2, 3];
    let v = vec![4, 5, 6];
    let s = String::from("小明");

    sum(&arr);            // ✅ 数组 → 切片
    sum(&v);              // ✅ &Vec<T> → &[T]
    sum(&v[1..]);         // ✅ 子区间
    greet(&s);            // ✅ &String → &str
    greet("小红");         // ✅ 字面量本来就是 &str
    greet(&s[0..3]);      // ✅ 字符串切片
}
```

这背后是 **Deref 强制转换（deref coercion）**：编译器在函数调用处自动把 `&Vec<T>` 转成 `&[T]`、把 `&String` 转成 `&str`。所以参数写得越宽泛，能接的调用方越多。

<Callout type="tip" title="一条惯用规则" text="**只读参数写切片，需要所有权才写 `Vec<T>` / `String`**。写成 `&Vec<T>` 或 `&String` 不会更快，只会让字面量和数组传不进来 —— 这是 code review 里最常见的一条建议。" />

## 三、UTF-8 与中文切片陷阱

`&s[a..b]` 的 `a`、`b` 是**字节下标**，不是字符下标。中文一个字通常占 3 字节，切在中间会 panic：

```rust
let s = String::from("你好世界");
// let bad = &s[0..2];   // ❌ panic: byte index 2 is not a char boundary
let ok = &s[0..3];       // ✅ "你"
```

<Predict no="20-1" q="`&quot;你好世界&quot;[0..2]` 会发生什么？" :options='["返回 你", "返回空字符串", "运行时 panic：不是字符边界", "编译失败"]' answer="2" output="thread main panicked at byte index 2 is not a char boundary" explain="下标是字节位置，2 落在 你 的 UTF-8 编码中间；编译期无法判断运行时边界，所以是 panic。" />

安全写法：

```rust
let s = "你好世界";

// 1. 用 char_indices 找到字符边界再切
for (byte_idx, ch) in s.char_indices() {
    println!("{} @ {}", ch, byte_idx);
}

// 2. 用 get 拿 Option，越界 / 非边界返回 None 而不是 panic
assert!(s.get(0..3).is_some());
assert!(s.get(0..2).is_none());

// 3. 按字符遍历，而不是按下标
let chars: Vec<char> = s.chars().collect();
```

<Callout type="warn" title="索引访问在 Rust 里是「有风险」的" text="`v[第 10 讲]` 越界会 panic；`v.get(10)` 返回 `Option` 让你自己决定。字符串切片同理优先用 `s.get(a..b)`。Rust 把这类边界错误留在运行时（因为依赖数据），但给了你安全的选择。" />

## 四、切片与借用规则

切片就是一个只读借用，所以 [第 19 讲](/core/mutable-borrow.md) 的规则全部适用：

```rust
let mut v = vec![1, 2, 3];
let part = &v[0..2];
// v.push(4);            // ❌ E0502：push 可能扩容搬迁堆内存
println!("{:?}", part);
v.push(4);               // ✅ part 最后一次使用之后，借用结束
```

字符串同理：持有 `&s[0..5]` 时不能 `s.push_str(...)`。**切片把「借用范围」和「数据视图」绑在了一起**，这正是 Rust 能做零拷贝解析又不悬空的原因。

<Compare title="零拷贝 vs 拷贝" :panels='[{"label":"零拷贝解析","code":"fn first_word(s: &amp;str) -&gt; &amp;str {\n    match s.find(\x27 \x27) {\n        Some(i) =&gt; &amp;s[..i],\n        None =&gt; s,\n    }\n}","note":"返回的视图借用自输入"},{"label":"拥有所有权","code":"fn first_word(s: &amp;str) -&gt; String {\n    s.split_whitespace()\n     .next().unwrap_or(\"\").to_string()\n}","note":"多一次分配，但结果可独立存活"}]' note="返回 &str 时，结果的生命周期被绑到输入 —— 需要独立保存就返回 String。" />

## 五、切片与模式匹配

切片可以用模式解构，做协议解析特别顺手（详见 [第 25 讲](/core/patterns.md)）：

```rust
fn head_tail(nums: &[i32]) -> (i32, &[i32]) {
    match nums {
        []            => (0, &[]),
        [first, rest @ ..] => (*first, rest),
    }
}

fn main() {
    let v = [10, 20, 30];
    let (h, t) = head_tail(&v);
    println!("{} {:?}", h, t);   // 10 [20, 30]
}
```

<Quiz no="20-2" q="`&[T]` 在内存里是什么？" :options='["只有一根指针", "指针 + 长度的胖指针", "数据的完整副本", "指针 + 长度 + 容量"]' answer="1" explain="切片不存容量（它不负责扩容），Vec 才有 ptr/len/cap 三个字。" />

<Quiz no="20-3" q="函数只读一个字符串序列，参数最合适写？" :options='["&Vec&lt;String&gt;", "&[String]", "Vec&lt;String&gt;", "&String"]' answer="1" explain="&[T] 能接数组、Vec、子区间；需要所有权时才用 Vec&lt;T&gt;。" />

<Quiz no="20-4" q="关于 UTF-8 切片，哪些说法正确？" :options='["下标是字节位置而非字符位置", "切在字符中间会运行时 panic", "s.get(a..b) 会返回 Option 而非 panic", "编译期就能保证所有切片边界合法"]' answer="0,1,2" multi="true" explain="边界依赖运行时数据，编译期无法保证；但 get 提供了不 panic 的写法。" />

<FillBlank tpl="fn total(nums: &amp;___&lt;i32&gt;) -&gt; i32 {\n    nums.iter().sum()\n}" answers="[i32]" hint="参数类型要能同时接数组和 Vec 的一段借用。" explain="完整类型是 &amp;[i32]，即 i32 切片。" />

<Exercise title="写一个安全的截断函数" task="实现 `fn truncate(s: &str, max_chars: usize) -&gt; &str`：返回前 max_chars 个**字符**组成的切片，要求不 panic（中文也要正确）。提示：用 `char_indices` 找到第 max_chars 个字符的字节位置。" hints='["char_indices().nth(max_chars) 给出下一个字符的字节下标", "如果不足 max_chars 就返回整个 s", "返回值是 &str，借用自参数"]' solution="fn truncate(s: &amp;str, max_chars: usize) -&gt; &amp;str {\n    match s.char_indices().nth(max_chars) {\n        Some((byte_idx, _)) =&gt; &amp;s[..byte_idx],\n        None =&gt; s,\n    }\n}\n\nfn main() {\n    assert_eq!(truncate(&quot;你好世界&quot;, 2), &quot;你好&quot;);\n    assert_eq!(truncate(&quot;hello&quot;, 10), &quot;hello&quot;);\n}" explain="char_indices 给出的是合法字符边界，所以切出来一定不会 panic。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 中文切片 panic | 用 `char_indices` / `chars` / `get` |
| 持有切片时不能 push | 先结束借用，或先取值 `let n = part[0];` |
| 参数写 `&Vec<T>` 接不了数组 | 改 `&[T]` |
| 想让切片结果独立存活 | 返回 `String` / `Vec<T>` 而非切片 |
| 下标越界程序崩 | 用 `.get(i)` 返回 `Option` |

## 小结

- 切片是「指针 + 长度」的胖指针，**不拥有、不复制**数据。
- 只读参数优先 `&[T]` / `&str`，靠 Deref 强制转换接更多调用方。
- 字符串下标是**字节**位置；中文要用 `char_indices` / `get` 才安全。
- 切片是只读借用，扩容类修改必须等借用结束。
- 下一讲把「引用必须始终有效」展开成生命周期。

<CheckList id="slices-check" title="学完本节，你应该能…" :items='["说出切片在内存里的两个字段", "解释为什么参数优先写 &str / &[T]", "安全地处理中文字符串切片", "说明持有切片时为什么不能 push", "写出返回 &str 的零拷贝解析函数"]' />

[上一讲：可变借用与借用规则 →](/core/mutable-borrow.md) · [下一讲：生命周期直觉 →](/core/lifetime.md)
