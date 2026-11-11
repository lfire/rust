---
title: 第 26 讲 · 集合容器 Vec 与 HashMap
description: Vec 的容量与扩容、HashMap 的哈希布局与 entry API，以及按场景选容器。
---

<StageHeader stage="L3 · 第 26 讲" level="★★★☆☆" time="25 分钟" goal="能选对容器并避开扩容与索引的常见坑" prereq="第 25 讲 模式匹配进阶 / 第 20 讲 切片" />

# 第 26 讲 · 集合容器 `Vec` 与 `HashMap`

真实程序几乎都在处理「一堆数据」。这一讲看 Rust 标准库里两个主力容器，重点不是 API 列表，而是**内存里发生了什么** —— 理解了布局，借用规则和性能表现就都能推出来。

切片 `&str` / `&[T]` 已在 [第 20 讲](/core/slices.md) 单独展开。

## 一、`Vec<T>`：可增长的连续数组

```rust
fn main() {
    let mut v: Vec<i32> = Vec::new();
    v.push(10);
    v.push(20);

    let v2 = vec![1, 2, 3];        // vec! 宏
    println!("{:?} len={} cap={}", v2, v2.len(), v2.capacity());

    match v2.get(10) {              // Option，越界不 panic
        Some(x) => println!("第 10 个是 {}", x),
        None    => println!("越界了"),
    }
    // let x = v2[10];             // ❌ 越界 panic
}
```

### 内存布局：栈上三个机器字

长度与容量分开记录，是为了让追加元素时不必每次都重新分配内存。

<ConceptDiagram type="vec-growth" title="Vec 的容量与扩容" />

```text
Vec<T> 变量（栈）
  ┌────────┬──────┬────────┐
  │  ptr   │ len  │  cap   │
  └───┬────┴──────┴────────┘
      ▼
堆上连续元素： [ e0 ][ e1 ][ e2 ][ 未使用的预留空间 ]
```

- `len`：已经存了几个元素；`capacity`：已经分配了多大空间。
- `len < capacity` 时 `push` 只写一个元素，**不分配内存**。
- `len == capacity` 时触发扩容：分配一块更大的内存（通常翻倍）、把元素搬过去、释放旧块。

<ConceptDiagram type="stack-heap" title="Vec 的栈上 ptr/len/cap + 堆上连续元素" />

```rust
let mut v = Vec::with_capacity(1000);   // 一次性预留，避免反复扩容
for i in 0..1000 { v.push(i); }
println!("{} {}", v.len(), v.capacity());   // 1000 1000
```

<Callout type="warn" title="扩容会让所有旧引用失效" text="因为元素可能被搬到新地址，下面代码编译不过：持有 `&v[0]` 的同时 `v.push(4)`。**借用规则在编译期就拦住了它** —— 在 C++ 里这是典型的迭代器失效、运行时未定义行为。修法：先用完引用，再 push。" />

```rust
let mut v = vec![1, 2, 3];
let first = &v[0];
// v.push(4);        // ❌ E0502
println!("{}", first);
v.push(4);           // ✅ 只读借用已结束
```

### 三种遍历入口

| 写法 | 拿到 | 原集合 |
| --- | --- | --- |
| `v.iter()` / `for x in &v` | `&T` | 仍可用 |
| `v.iter_mut()` / `for x in &mut v` | `&mut T` | 仍可用，可改元素 |
| `v.into_iter()` / `for x in v` | `T` | **所有权被消耗** |

```rust
let mut v = vec![1, 2, 3];
for x in &mut v { *x *= 2; }
for x in &v { print!("{} ", x); }        // 2 4 6
let owned: Vec<i32> = v.into_iter().collect();   // v 之后不可用
```

## 二、`HashMap<K, V>`：键值映射

```rust
use std::collections::HashMap;

fn main() {
    let mut scores: HashMap<String, i32> = HashMap::new();
    scores.insert(String::from("小明"), 95);
    scores.insert(String::from("小红"), 88);

    if let Some(v) = scores.get("小明") { println!("{}", v); }

    scores.entry(String::from("小刚")).or_insert(60);
    *scores.entry(String::from("小明")).or_insert(0) += 5;

    for (name, score) in &scores { println!("{}: {}", name, score); }
}
```

### 哈希布局与冲突

Rust 的 `HashMap` 默认用 **SipHash**（抗 HashDoS 攻击）+ **开放寻址 / SwissTable 风格**的桶数组：键经过哈希定位到桶，冲突时按探测序列找下一个空位。要点：

- 键必须实现 `Hash` + `Eq`；自定义类型直接 `#[derive(Hash, Eq, PartialEq)]`。
- 负载因子到阈值就扩容并**重新哈希所有键**，所以插入不是恒定 O(1)。
- 遍历顺序**不稳定**，不要依赖它；需要有序用 `BTreeMap`。

```rust
use std::collections::HashMap;

#[derive(Hash, Eq, PartialEq, Debug)]
struct Key { ns: String, id: u32 }

let mut m: HashMap<Key, i32> = HashMap::new();
m.insert(Key { ns: "a".into(), id: 1 }, 10);
```

### 所有权与 entry API

`insert(k, v)` 会**拿走** key 和 value 的所有权。若之后还要用这个字符串，要么 `clone()`，要么让 key 借用 `&str`（需保证存活够久）。

`entry` 是最常用的惯用法，它避免「先 get 再 insert」的两次查找：

| 写法 | 用途 |
| --- | --- |
| `or_insert(v)` | 不存在则插入，返回 `&mut V` |
| `or_insert_with(|| ...)` | 默认值构造昂贵时才算 |
| `and_modify(|v| ...).or_insert(v)` | 存在则改、不存在则插 |

<Callout type="tip" title="为什么 get 要用 &str 查 String 键" text="`HashMap<String, i32>` 可以用 `scores.get(&quot;小明&quot;)` 查，因为 `String: Borrow&lt;str&gt;`。这个设计让查询不必为了比较而临时构造一个 String。" />

## 三、按场景选容器

| 容器 | 结构 | 适合 | 不适合 |
| --- | --- | --- | --- |
| `Vec<T>` | 连续数组 | 顺序遍历、按下标、尾部增删 | 头部频繁插入 |
| `VecDeque<T>` | 环形缓冲 | 队列、头尾都要增删 | 随机访问密集 |
| `HashMap<K,V>` | 哈希表 | 按键查找、去重 | 需要顺序 / 范围查询 |
| `BTreeMap<K,V>` | B 树 | 有序遍历、范围查询 | 追求极致点查速度 |
| `HashSet<T>` | 哈希表 | 集合去重、成员判断 | 需要保留顺序 |
| `BinaryHeap<T>` | 二叉堆 | Top-K、优先队列 | 遍历全部元素 |
| `String` | UTF-8 字节 | 文本 | 任意二进制（用 `Vec<u8>`） |

<Predict no="26-1" q="`Vec::with_capacity(1000)` 后立刻 `len()` 是多少？" :options='["1000", "0", "取决于元素类型", "编译失败"]' answer="1" output="0" explain="capacity 是已分配空间，len 是实际元素个数；预留不会凭空造出元素。" />

<Quiz no="26-2" q="关于 `HashMap::get`，哪个说法正确？" :options='["找不到会 panic", "返回 Option&lt;&V&gt;，找不到是 None", "返回 V 的副本", "返回 Result"]' answer="1" explain="get 返回 Option，用 if let / match / unwrap_or 处理缺失。" />

<Quiz no="26-3" q="哪些做法能避免 Vec 反复扩容？" :options='["用 with_capacity 预估容量", "用 Vec::new 然后逐个 push", "一次性 extend 而不是循环 push", "把所有元素都 clone 一遍"]' answer="0,2" multi="true" explain="预估容量或批量 extend 都能减少重新分配；clone 与此无关且更慢。" />

<Quiz no="26-4" q="`for x in v` 之后 v 还能用吗？" :options='["能，只是借看", "不能，into_iter 消耗了所有权", "能但内容被清空", "取决于元素是否 Copy"]' answer="1" explain="按值遍历会移动整个 Vec；想保留用 for x in &v。" />

<FillBlank tpl="let mut m: HashMap&lt;String, i32&gt; = HashMap::new();\n*m.___(&quot;k&quot;.to_string()).or_insert(0) += 1;" answers="entry" hint="避免「先查再插」两次哈希查找的 API 名字。" explain="entry 返回 Entry 枚举，or_insert 后拿到 &mut V，可直接 += 1。" />

<Exercise title="词频统计（entry 版）" task="写 `fn word_count(text: &str) -&gt; HashMap&lt;String, i32&gt;`，用 `split_whitespace` + `entry` 统计词频；再写一个 `fn top_k(m: &HashMap&lt;String, i32&gt;, k: usize) -&gt; Vec&lt;(&String, &i32)&gt;` 返回出现次数最高的 k 个词。" hints='["*map.entry(word.to_string()).or_insert(0) += 1", "top_k 用 iter().collect 后 sort_by 按次数降序", "记得 truncate(k) 或直接 into_iter().take(k)"]' solution="use std::collections::HashMap;\n\nfn word_count(text: &amp;str) -&gt; HashMap&lt;String, i32&gt; {\n    let mut m = HashMap::new();\n    for w in text.split_whitespace() {\n        *m.entry(w.to_string()).or_insert(0) += 1;\n    }\n    m\n}\n\nfn top_k(m: &amp;HashMap&lt;String, i32&gt;, k: usize) -&gt; Vec&lt;(&amp;String, &amp;i32)&gt; {\n    let mut v: Vec&lt;_&gt; = m.iter().collect();\n    v.sort_by(|a, b| b.1.cmp(a.1));\n    v.into_iter().take(k).collect()\n}" explain="entry 把「查找 + 插入」合并成一次；HashMap 遍历无序，排名必须显式排序。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 持有引用时 push 报 E0502 | 先用完引用，或取值而非借用 |
| 中文 / 二进制存进 String 出问题 | 二进制用 `Vec<u8>`，文本注意 UTF-8 |
| HashMap 遍历顺序每次不同 | 别依赖顺序；需要有序用 BTreeMap |
| `insert` 后字符串不能用了 | 被移动进表了；`clone()` 或存 `&str` |
| 自定义 key 编译失败 | 补 `#[derive(Hash, Eq, PartialEq)]` |

## 小结

- `Vec` 栈上 `ptr/len/cap`，堆上连续元素；扩容会搬迁数据，使旧引用失效。
- `iter` / `iter_mut` / `into_iter` 分别对应借用、可变借用、消耗所有权。
- `HashMap` 的 `get` 返回 `Option`，`entry` 系列避免重复查找。
- 按「是否需要顺序、是否按键查、增删在头还是尾」选容器。
- 下一讲进入 `Result` / `?` 的错误处理完整工具箱。

<CheckList id="collections-check" title="学完本节，你应该能…" :items='["说出 Vec 在栈和堆上各存什么、何时扩容", "解释为什么持有引用时不能 push", "区分 iter / iter_mut / into_iter", "用 entry API 统计词频", "按场景在 Vec / HashMap / BTreeMap / VecDeque 间选型"]' />

[上一讲：模式匹配进阶 →](/core/patterns.md) · [下一讲：错误处理 →](/core/error-handling.md)
