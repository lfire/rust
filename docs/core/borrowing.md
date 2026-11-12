---
title: 第 18 讲 · 借用与引用 &T
description: 用 & 临时借看数据而不抢走所有权，理解多个只读借用、解引用与悬空引用。
---

<StageHeader stage="L3 · 第 18 讲" level="★★★☆☆" time="25 分钟" goal="能写出只读借用的函数并说清它为什么不释放数据" prereq="第 17 讲 Copy、Clone 与 drop" />

# 第 18 讲 · 借用与引用 `&T`

如果每次用一下数据都要把所有权交出去，代码会写得很痛苦：读个长度还得把字符串送进函数再要回来。Rust 的答案是**借用（borrowing）**：用 `&` 临时取得访问权，但不成为所有者。

<Compare title="送出去 vs 借一眼" :panels='[{"label":"转移所有权","code":"fn take(s: String) { }\nlet s = String::from(\"hi\");\ntake(s);\n// s 之后不能再用","note":"函数结束就释放堆内存"},{"label":"只读借用","code":"fn peek(s: &String) { }\nlet s = String::from(\"hi\");\npeek(&s);\n// s 仍是所有者，可继续用","note":"引用消失不触发 drop"}]' note="看到 & 就知道：所有权没动，只是暂时借看。" />

## 一、两条借用规则（整个 L3 最重要）

> 在任意时刻，对于同一份数据，你要么有**任意多个不可变引用 `&T`**，要么有**恰好一个可变引用 `&mut T`**。二者不可同时存在。
>
> 并且，**引用必须始终有效**（不能指向已销毁的值）。

本讲聚焦前半句的「多个只读借用」；独占的 `&mut` 与冲突处理留给 [第 19 讲](/core/mutable-borrow.md)。

<OwnershipLab scene="borrow" />

<ConceptDiagram type="borrow" title="多个 &T 可以共存；&mut T 必须独占" />

## 二、不可变借用

```rust
fn length(s: &String) -> usize { s.len() }

fn main() {
    let s = String::from("rust");
    let r1 = &s;
    let r2 = &s;                    // ✅ 多个只读借用没问题
    let r3 = &s;
    println!("{} {} {} {}", r1, r2, r3, length(&s));
}
```

`&s` 的类型是「对 `String` 的引用」。三个关键点：

1. **它不拥有数据**。引用离开作用域时只是那根指针消失，**不会**释放堆上的字符串。
2. **不能通过 `&T` 修改数据**。想改需要 `&mut T`（第 19 讲）。
3. 引用本身是 `Copy`：`let r2 = r1;` 只是复制指针，两个引用都有效。

<Callout type="tip" title="为什么可以有任意多个读者" text="同时读一块数据不会互相干扰。真正危险的是「一边读一边写」：读者可能拿到写了一半的值，或者刚取的指针因为扩容而失效。Rust 把这条限制写进了类型系统 —— 这是零成本消除数据竞争的关键。" />

### 解引用 `*`

```rust
fn main() {
    let x = 5;
    let r = &x;
    assert_eq!(*r, 5);        // * 取出引用指向的值
    assert_eq!(r + 1, 6);     // 多数运算符会自动解引用
}
```

方法调用会自动解引用，所以 `s.len()` 和 `(&s).len()` 一样工作。这叫 **autoderef**，也是为什么 Rust 代码里很少见到满屏的 `*`。

## 三、参数该写 `&String` 还是 `&str`

```rust
fn len_bad(s: &String) -> usize { s.len() }   // 只接受 &String
fn len_ok(s: &str)     -> usize { s.len() }   // &String、字面量、切片都能传

fn main() {
    let s = String::from("hello");
    len_bad(&s);
    len_ok(&s);           // ✅ Deref 强制转换：&String → &str
    len_ok("hello");      // ✅ 字面量就是 &str
    len_ok(&s[0..2]);     // ✅ 切片
}
```

<Callout type="idea" title="一条惯用规则" text="**函数只读字符串时，参数优先写 `&str`**，同理只读序列时写 `&[T]` 而不是 `&Vec<T>`。更宽泛的借用类型能接更多调用方，且不需要转移所有权。[第 20 讲](/core/slices.md) 会深入切片的内存布局。" />

## 四、引用必须始终有效：悬空引用

```rust
fn dangle() -> &String {
    let s = String::from("hi");
    &s                  // ❌ s 在函数结束就被释放，引用会悬空
}
```

```text
error[E0515]: cannot return reference to local variable `s`
```

C/C++ 里这是能编译但危险的写法；Rust 直接禁止。想返回数据，就返回**拥有所有权的值**：

```rust
fn make() -> String { String::from("hi") }   // ✅ 把所有权交出去
```

编译器怎么判断的？它比较「引用被使用的范围」和「被引用值的存活范围」，前者不能超过后者 —— 这正是 [第 21 讲 生命周期](/core/lifetime.md) 的主题。

## 五、切片：一种特殊的引用

切片是对「一段连续数据」的引用，写作 `&[T]` 或 `&str`，内部是「指针 + 长度」的胖指针。

```rust
fn sum(nums: &[i32]) -> i32 { nums.iter().sum() }

fn main() {
    let arr = [1, 2, 3, 4, 5];
    let v = vec![4, 5, 6];
    println!("{} {}", sum(&arr), sum(&v));      // 数组和 Vec 都能传

    let part: &[i32] = &arr[1..4];             // 2, 3, 4
    let s = String::from("hello world");
    let word: &str = &s[0..5];                 // "hello"
    println!("{:?} {}", part, word);
}
```

<Callout type="warn" title="切片也会冻结原数据" text="拿到 `&s[0..5]` 之后，`s` 就不能被修改（有一个只读借用还活着）。而且持有切片时 `v.push(...)` 会因扩容搬迁堆内存被编译器拦下 —— 详见 [切片 &str 与 &[T]](/core/slices.md)。" />

<Predict no="18-1" q="`let r1 = &s; let r2 = r1;` 之后 r1 还能用吗？" :options='["能，引用是 Copy，只是复制了指针", "不能，r1 被移动了", "能但 r2 指向空", "运行时才决定"]' answer="0" output="能" explain="共享引用 &T 实现了 Copy，赋值按位复制指针；注意 &mut T 不是 Copy。" />

<Quiz no="18-2" q="关于只读借用，哪些说法正确？" :options='["可以有任意多个 &T 同时存在", "引用离开作用域会释放堆数据", "&T 是 Copy，&mut T 不是", "函数只读字符串时参数优先写 &str"]' answer="0,2,3" multi="true" explain="释放堆数据是所有者的职责，借用不负责 —— 这正是借用不会 double free 的原因。" />

<Quiz no="18-3" q="`fn f() -&gt; &String { let s = String::from(&quot;hi&quot;); &s }` 会？" :options='["正常运行", "报 E0515：不能返回局部变量的引用", "自动延长 s 的寿命", "编译通过但输出乱码"]' answer="1" explain="编译器禁止悬空引用；改成返回 String 把所有权交出去。" />

<FillBlank tpl="fn total(nums: &amp;___&lt;i32&gt;) -&gt; i32 {\n    nums.iter().sum()\n}" answers="[i32]" hint="参数类型要能同时接数组和 Vec 的一段借用。" explain="完整类型是 &amp;[i32]，即 i32 切片。" />

<Exercise title="把所有权版本改成借用版本" task="下面代码编译不过。请在不删除任何输出的前提下，把 `take` 改成只读借用版本；再写一个 `fn first_word(s: &str) -&gt; &str` 返回第一个空格前的单词（找不到则返回整个 s）。" hints='["参数改 &amp;String 或更通用的 &amp;str，调用处加 &amp;", "first_word 可用 find( 空格 ) 或 split_whitespace", "返回切片时注意它借用自参数 s"]' solution="fn take(s: &amp;str) { println!(&quot;{}&quot;, s); }\n\nfn first_word(s: &amp;str) -&gt; &amp;str {\n    match s.find(' ') {\n        Some(i) =&gt; &amp;s[..i],\n        None =&gt; s,\n    }\n}\n\nfn main() {\n    let s = String::from(&quot;hello rust&quot;);\n    take(&amp;s);\n    println!(&quot;{} {}&quot;, first_word(&amp;s), s);\n}" explain="返回的 &amp;str 借用自参数，调用方 s 仍是所有者 —— 这就是零拷贝解析的基础。" />

把这一讲的核心规则压成一页，复习时先看这张卡，下面的「常见坑」再逐条对照：

<KnowledgeCard title="借用 · 一页纸速记" :points='["同一时刻：要么一个可变借用，要么任意多个不可变借用", "引用的寿命不能超过被引用值，所以不能返回局部变量的引用", "参数优先写切片类型，能同时接数组、Vec 与字符串字面量"]' :pitfalls='["把借用当成运行期锁：它只在编译期检查，没有任何运行时开销", "为了过编译就到处 clone：先想想能不能缩小借用范围", "把生命周期标注当成延长寿命：标注只描述关系，不改变谁活多久"]' summary="借用是暂时借看，不转移所有权；编译器用生命周期保证借来的东西一直活着。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 以为 `&T` 会释放数据 | 只有所有者离开作用域才 drop |
| 参数写死 `&String` 导致调用不便 | 改 `&str` / `&[T]` |
| 返回局部变量引用 E0515 | 返回拥有所有权的值 |
| 持有切片时想修改原集合 | 先结束借用（用完再改）， or 用索引重新取 |
| 满屏 `*` | 方法调用会自动解引用，多数情况不用写 |

## 小结

- 借用 = 用 `&` 取得临时访问权，**不转移所有权、不负责释放**。
- 任意多个 `&T` 可共存；`&T` 自身是 Copy。
- 只读参数优先 `&str` / `&[T]`，靠 Deref 强制转换接更多调用方。
- 引用必须始终有效，悬空引用在编译期被拦（E0515）。
- 切片是「指针 + 长度」的胖指针引用，[第 20 讲](/core/slices.md) 深入。

<CheckList id="borrow-check" title="学完本节，你应该能…" :items='["说出两条借用规则", "解释为什么多个 &T 可以共存", "写出接收 &str 而非 &String 的函数", "说明为什么不能返回局部变量的引用", "看懂切片是一种胖指针引用"]' />

[上一讲：Copy、Clone 与自动 drop →](/core/copy-drop.md) · [下一讲：可变借用与借用规则 →](/core/mutable-borrow.md)
