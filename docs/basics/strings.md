---
title: 第 10 讲 · 字符串：&str 与 String
description: 为什么 Rust 有两个字符串类型、它们在内存里长什么样、UTF-8 带来的三个陷阱，以及函数参数该写哪一个。
---

<StageHeader stage="L2 · 第 10 讲" level="★★☆☆☆" time="24 分钟" goal="能说清 &str 与 String 的区别并正确完成转换" prereq="第 09 讲 变量、可变性与类型推导" />

# 第 10 讲 · 字符串：`&str` 与 `String`

新手在 Rust 里遇到的第一个「怎么这么麻烦」，多半是字符串。[第 09 讲](/basics/variables.md) 只在表格里见过它一眼，这一讲把它彻底讲清楚。

<Callout type="idea" title="先记住一句话" text="&str 是「借看一段已经存在的文本」，String 是「自己拥有、可以增长的一块文本」。这个分工来自所有权，不是语法洁癖。" />

## 一、为什么非要分成两个类型

多数语言只有一个字符串类型，Rust 分成两种，是因为它必须在编译期回答两个问题：**这段文本放在哪**、**谁负责释放它**。

| | 字面量 `"hello"` | 运行时拼出来的文本 |
| --- | --- | --- |
| 内容何时确定 | 写代码时就定死了 | 运行时才知道（用户输入、读文件、HTTP 响应） |
| 长度会不会变 | 永不改变 | 可能追加、截断 |
| 需要堆分配吗 | 不需要，直接编进可执行文件 | 需要，且要有人负责释放 |
| Rust 里的类型 | `&str` | `String` |

```rust
fn main() {
    let a: &str = "hello";              // 借看：数据在只读数据段里
    let mut b = String::from("hello");  // 拥有：在堆上分配一块可增长的缓冲区
    b.push_str(", world");
    println!("{} / {} 字节", a, b.len());
}
```

<Compare title="同样是字符串，别的语言怎么处理" :panels='[{"label":"Python / JavaScript","code":"s = \"hi\"\ns += \"!\"","note":"只有一种类型，内存由运行时托管"},{"label":"C","code":"char *s = \"hi\";  // 只读\n// 想追加得自己 malloc / realloc","note":"也区分了，但释放全靠人记"},{"label":"Rust","code":"let a: &amp;str = \"hi\";\nlet mut b = String::from(\"hi\");\nb.push_str(\"!\");","note":"类型层面区分，释放交给所有权保证"}]' note="Rust 把 C 里「靠约定」的事变成了「靠编译期检查」。" />

<Quiz no="10-1" q="关于字面量 hello 的类型，哪个说法正确？" :options='["它是 String，因为所有字符串都归 String 管", "它是 &str，一段借看的、不可增长的文本", "它的类型要等运行时才能确定", "它不是字符串，而是 char 数组"]' answer="1" explain="字面量在编译期就写进可执行文件，类型是 &str；需要可增长的文本时才用 String::from 或 to_string 另外分配。" />

## 二、内存里长什么样

`String` 的变量本身很小，放在栈上；真正的字符字节放在堆上。

| 组成 | `String` | `&str` |
| --- | --- | --- |
| 栈上存什么 | 指针 + 长度 `len` + 容量 `cap` | 指针 + 长度 `len` |
| 栈上宽度 | 3 个 `usize`（64 位机上 24 字节） | 2 个 `usize`（16 字节），是一个胖指针 |
| 谁拥有堆上的字节 | 自己拥有，离开作用域自动释放 | 不拥有，只是指向别人拥有的那一段 |
| 能否增长 | 能（`push_str`，必要时扩容） | 不能，长度在借用时就定死 |

<Term word="胖指针" text="除了地址还额外携带长度等元数据的指针；Rust 的字符串切片与数组切片都是胖指针。" /> 之所以要带长度，是因为借用一段文本时，编译器需要知道这段视图到底有多长。

<ConceptDiagram type="stack-heap" title="String 在栈上是「指针 / 长度 / 容量」，真正的 UTF-8 字节在堆上" />

<Callout type="tip" title="为什么还要记一个「容量」" text="push_str 时如果容量够，就直接往缓冲区尾部写；不够才重新分配一块更大的并搬过去。有了 cap，追加操作不必每次都分配内存 —— 这也是后面讲 Vec 时同样会出现的设计。" />

## 三、UTF-8：三个必须知道的坑

Rust 的字符串**一律是合法 UTF-8**。这带来三条新手最容易踩的规则。

```rust
fn main() {
    let s = "Rust语言";
    println!("字节数：{}", s.len());            // 10
    println!("字符数：{}", s.chars().count());  // 6
    println!("前四个字节：{}", &s[0..4]);       // Rust
    // println!("{}", &s[0..5]);               // panic：5 不是字符边界
    // println!("{}", s[0]);                  // 编译错误：String 不能按整数索引
}
```

| 规则 | 说明 |
| --- | --- |
| `.len()` 是**字节数** | `"Rust语言"` = 4 个 ASCII 各 1 字节 + 2 个汉字各 3 字节 = 10 |
| 不能写 `s[0]` | 一个「字符」可能占 1–4 字节，编译器不知道你要第几个字节还是第几个字符，干脆禁止 |
| 切片按**字节边界** | `&s[0..5]` 落在汉字中间会运行时 panic；要按字符取请用 `chars()` |

<Predict no="10-2" q="对 Rust语言 这个字符串分别调用 len() 与 chars().count()，输出什么？" :options='["10 和 6", "6 和 6", "6 和 10", "8 和 6"]' answer="0" output="10 和 6" explain="len() 数的是 UTF-8 字节：Rust 占 4 字节，两个汉字各占 3 字节，共 10；chars().count() 数的是 Unicode 标量值，共 6 个。" />

| 想做什么 | 该用什么 |
| --- | --- |
| 数人类眼里的「字数」 | `.chars().count()` |
| 处理底层字节 / 网络协议 | `.as_bytes()` / `.bytes()` |
| 一边遍历一边知道字节位置 | `.char_indices()` |
| 安全地取一段文本 | `.get(0..4)` 返回 `Option`，越界或非字符边界时是 `None` 而不是 panic |

<Callout type="warn" title="中文字符串最容易触发的 panic" text="用数字下标切中文时，边界几乎一定会落在多字节字符中间。养成习惯：需要按下标取子串时用 `.get(..)`，需要遍历字符时用 `.chars()`。" />

## 四、创建与转换速查

```rust
fn main() {
    let lit: &str = "hi";

    let a = String::from(lit);    // &str -> String：分配堆内存
    let b = lit.to_string();      // 同上，更常见的写法
    let c = lit.to_owned();       // 同上

    let back: &str = &a;          // &String -> &str：自动解引用
    let back2 = a.as_str();       // 更明确，读代码时一眼看出意图

    let joined = format!("{} {}", lit, back);  // 拼接，但不夺取任何人的所有权
    println!("{} {} {} {} {}", a, b, c, back2, joined);
}
```

| 目的 | 写法 | 会不会分配内存 |
| --- | --- | --- |
| 字面量 → `String` | `String::from("hi")` / `"hi".to_string()` | 会 |
| `String` → `&str` | `&s` / `s.as_str()` | 不会，只是借用 |
| 就地追加 | `s.push('!')` / `s.push_str("!")` | 容量不足时才会 |
| 拼接生成新串 | `format!("{} {}", a, b)` | 会，生成新的 `String` |
| 用 `+` 拼接 | `s1 + &s2` | 复用 `s1` 的缓冲区，但**移动了 `s1`** |
| 取子串 | `&s[0..4]` / `s.get(0..4)` | 不会，返回视图 |

<Term word="Deref 强制转换" text="当函数期待 &str 却收到 &String 时，编译器会自动沿 Deref 链把 &String 转成 &str，不需要手写转换。这是 greet(&owned) 能直接编译的原因。" />

## 五、拼接与常用操作

```rust
fn main() {
    let mut s = String::from("Rust");
    s.push('!');
    s.push_str(" 很棒");
    println!("{}", s);

    let s1 = String::from("Hello, ");
    let s2 = String::from("Rust!");
    let s3 = s1 + &s2;          // s1 被移动，之后不能再用；s2 只是借用
    println!("{}", s3);
    // println!("{}", s1);      // 编译错误：borrow of moved value

    let text = "  Rust, tokio, serde  ";
    println!("去空白：{}", text.trim());
    println!("包含 tokio：{}", text.contains("tokio"));
    println!("替换：{}", text.replace("tokio", "TOKIO"));
    for part in text.trim().split(',') {
        println!("分段：{}", part.trim());
    }
}
```

<StepBox title="从字面量拼出一句话" :steps='[{"title":"第 1 步：拿到不可变文本","body":"let name: &amp;str = \"小明\";\n类型 &amp;str，零分配","tip":"字面量全程有效，可以放心借看"},{"title":"第 2 步：决定要不要修改","body":"只是读、只是传参 → 继续用 &amp;str\n要追加、要存进结构体 → 转成 String","tip":"先问「谁拥有它」，再决定类型"},{"title":"第 3 步：生成结果","body":"let msg = format!(\"你好，{}\", name);\n得到一个新的 String","tip":"format! 不夺取 name 的所有权，最安全"}]' />

<Callout type="warn" title="`+` 会悄悄移动左边的值" text="`s1 + &s2` 的底层签名是 `fn add(self, rhs: &str) -> String`：第一个操作数是按值传进去的，所以 `s1` 被移动。想保留原串请用 `format!` 或 `s1.clone() + &s2`。这条规则的完整解释在 [第 16 讲](/core/ownership.md)。" />

## 六、函数参数该写哪一个

一个可以一直用的经验法则：**参数默认写 `&str`**。

```rust
fn greet(name: &str) -> String {
    format!("你好，{}", name)
}

fn main() {
    let owned = String::from("小明");
    println!("{}", greet("同学"));       // 传字面量
    println!("{}", greet(&owned));      // 传 &String，自动解引用
    println!("{}", greet(owned.as_str()));
}
```

| 场景 | 参数类型 | 原因 |
| --- | --- | --- |
| 只是读一下、判断一下 | `&str` | 两种来源都能接，不夺取所有权，不强迫调用方分配堆 |
| 要把文本**存起来**（放进 struct / Vec / 全局缓存） | `String` | 借用活不了那么久，必须拿到所有权 |
| 要在函数里就地修改再交回 | `&mut String` 或 `String` | 需要可写权限 |
| 返回值是拼出来的新文本 | `String` | 调用方拿到所有权，想借想改都行 |

<Quiz no="10-3" q="为什么推荐把函数参数写成 &str 而不是 String？" :options='["因为 &str 运行更快", "因为 &str 既能接字面量也能接 &String，且不夺取所有权", "因为 String 不能作为函数参数", "因为编译器不允许返回 String"]' answer="1" explain="写成 &str 时调用方最自由：字面量直接传，&String 会自动解引用，而且函数不会把值拿走。性能只是顺带的好处。" />

## 七、常见坑

| 现象 | 处理 |
| --- | --- |
| `expected String, found &str` | 函数要所有权：补 `.to_string()`，或把签名改成 `&str` |
| `expected &str, found String` | 借一下：`&s` 或 `s.as_str()` |
| `s[0]` 编译不过 | 用 `s.chars().next()` 或 `s.as_bytes()[0]` |
| 切中文时 panic | 用 `.get(0..n)` 或 `char_indices()` 找合法边界 |
| `s1 + &s2` 之后 `s1` 不能用了 | `+` 移动了左值；改用 `format!` |
| `"中文".len()` 比预期大 | `len()` 是字节数，字数用 `.chars().count()` |
| 想返回函数内拼好的字符串却写成 `&str` | 返回 `String`；返回局部值的引用会悬空，见第 21 讲 |

## 八、这些知识会去哪

| 本讲概念 | 后续展开 |
| --- | --- |
| 拥有 vs 借看 | [第 16 讲 所有权三法则](/core/ownership.md) |
| `&String` 自动变 `&str` | [第 18 讲 借用与引用](/core/borrowing.md) |
| 胖指针、切片边界 | [第 20 讲 切片](/core/slices.md) |
| 为什么不能返回局部字符串的引用 | [第 21 讲 生命周期](/core/lifetime.md) |
| 容量与扩容 | [第 26 讲 Vec / HashMap](/core/collections.md) |

<Quiz no="10-4" q="关于 Rust 字符串，哪些说法正确？" :options='["String 拥有堆上的缓冲区，可以 push_str 追加", "&str 是胖指针，不拥有数据", "所有 Rust 字符串都是合法 UTF-8", "len() 返回字符个数"]' answer="0,1,2" multi="true" explain="前三条都对；len() 返回的是字节数，中文字符串上二者不相等。" />

<FillBlank tpl="fn main() {\n    let mut s = ___::from(&quot;hi&quot;);\n    s.push_str(&quot;!&quot;);\n    println!(&quot;{}&quot;, s);\n}" answers="String" hint="要一个可增长的、拥有数据的字符串，用哪个类型？" explain="String::from 分配堆缓冲区，之后才能 push_str 追加。" />

<CodeTabs title="同一段文本的三种身份" :tabs='[{"label":"只读视图","code":"let a: &amp;str = \"hi\";\n// 借看，不分配堆内存","note":"适合函数参数、字面量、子串"},{"label":"拥有并可增长","code":"let mut b = String::from(\"hi\");\nb.push_str(\"!\");","note":"适合需要长期保存或拼接的文本"},{"label":"拼接生成新值","code":"let c = format!(\"{} {}\", a, b);\n// a、b 都还在，c 是新的 String","note":"不夺取任何一方所有权，最省心"}]' />

<Exercise title="写一个带字数的问候函数" task="实现 describe(name: &str, score: u32) -> String：返回形如「小明得了 95 分（名字共 2 个字符）」的文本。名字是中文，字数请用 chars().count() 计算，不要用 len()。" hints='["参数写 &str，返回值写 String", "用 format! 拼接，占位符用 {}", "字数写成 name.chars().count()"]' solution="fn describe(name: &amp;str, score: u32) -&gt; String {\n    format!(&quot;{}得了 {} 分（名字共 {} 个字符）&quot;, name, score, name.chars().count())\n}\n\nfn main() {\n    println!(&quot;{}&quot;, describe(&quot;小明&quot;, 95));\n}" explain="&str 既能接字面量也能接 &String；chars().count() 才是中文语境下的「字数」。" />

## 小结

- `&str` 是借看的切片（指针 + 长度），`String` 是拥有堆缓冲区的可增长文本（指针 + 长度 + 容量）。
- 全部字符串都是 UTF-8：`.len()` 数字节、不能按整数索引、切片必须落在字符边界。
- 转换用 `to_string()` / `&s`；拼接优先 `format!`，`+` 会移动左值。
- 函数参数默认用 `&str`；要长期保存才要 `String`。
- 这套「拥有 vs 借看」的直觉，正是 L3 所有权体系的入口。

<CheckList id="strings-check" title="学完本节，你应该能…" :items='["说清 &str 与 String 在所有权和内存上的差别", "解释 String 为什么要记录容量", "说出 UTF-8 带来的三条限制并避开中文切片 panic", "在 &str 与 String 之间正确转换", "判断函数参数该用 &str 还是 String", "解释 s1 + &s2 之后为什么不能再用 s1"]' />

[上一讲：变量、可变性与类型推导 →](/basics/variables.md) · [下一讲：函数、语句与表达式 →](/basics/functions.md)
