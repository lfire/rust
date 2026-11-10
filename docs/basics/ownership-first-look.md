---
title: 所有权初体验
description: 在深入规则之前，先用可交互实验台建立对「移动」「借用」「作用域」的直觉。
---

<StageHeader stage="L2 · Rust 语法入门" level="★★★☆☆" time="18 分钟" goal="看见现象、说得出直觉，暂时不背规则" prereq="变量 / 函数 / 栈与堆" />

# 所有权初体验

这一节是 L2 和 L3 之间的桥。我们**不背规则**，先看几个现象，再用交互实验台把内存里发生的事一步步放出来。等你有了直觉，L3 的规则就只是给直觉起名字而已。

## 现象一：同样一句赋值，结果不同

```rust
let a = 5;
let b = a;
println!("{} {}", a, b);   // ✅ 5 5
```

```rust
let a = String::from("hi");
let b = a;
println!("{} {}", a, b);   // ❌ 编译不过
```

第二段的报错是 `borrow of moved value: a`。为什么？

回想 L1：`String` 的文字存在**堆**上，变量 `a` 只在栈上存「指针 / 长度 / 容量」。如果 `let b = a` 把这三个数字复制一份，就会有两个变量指向同一块堆内存 —— 两个都离开作用域时会**释放两次**，程序崩溃。

Rust 的处理方式非常干脆：**把所有权从 a 移交给 b，a 立刻作废**。这在编译期就能检查，运行时零开销。

## 用实验台亲眼看一遍

点击「执行下一步」，观察栈和堆在每一行的变化。也可以切换顶部标签，看 Copy、借用、借用冲突、作用域释放四种场景。

<OwnershipLab scene="move" />

<ConceptDiagram type="ownership" title="移动只搬栈上的三个机器字，堆数据原封不动" />

## 现象二：想留着原变量，就明确克隆

```rust
fn main() {
    let a = String::from("hi");
    let b = a.clone();          // 显式深拷贝堆上的数据
    println!("{} {}", a, b);    // ✅ 都能用
}
```

`.clone()` 会真的把堆上的内容复制一份，代价是时间和内存。Rust 不帮你偷偷做这件事 —— **昂贵的动作必须写得出来、看得见**。

<Compare title="三种「把值给出去」的方式" :panels='[{"label":"移动（默认）","code":"let b = a;","note":"a 失效，零成本"},{"label":"克隆","code":"let b = a.clone();","note":"复制堆数据，两者都能用"},{"label":"借用","code":"let r = &a;","note":"不转移所有权，只是借看"}]' note="L3 会系统展开这三条路径各自适用的场景。" />

## 现象三：借用就不会抢走所有权

```rust
fn length(s: &String) -> usize { s.len() }

fn main() {
    let name = String::from("Rust");
    let n = length(&name);       // 只借一下
    println!("{} 有 {} 个字符", name, n);  // name 还在
}
```

`&name` 创建一个**引用**：它能看到数据，但不拥有数据。函数结束时引用消失，值仍然归 `name` 所有。

<ConceptDiagram type="borrow" title="借用像「借看一本书」：书还是主人的，只是暂时在你手上" />

## 现象四：值离开作用域就自动消失

```rust
fn main() {
    let outer = String::from("A");
    {
        let inner = String::from("B");
        println!("{} {}", outer, inner);
    }  // inner 在这里被释放
    println!("{}", outer);        // outer 还活着
}   // outer 在这里被释放
```

不需要 `free`，也不需要 GC：编译器在作用域结束的位置自动插入释放代码。这就是 Rust 内存管理的全部秘密。

## 现在只要记住四句话

1. 每个值同一时刻有且只有**一个所有者**。
2. 所有者离开作用域，值自动释放。
3. 赋值/传参默认会**移动**所有权；想继续用旧变量就 `clone()` 或**借用**。
4. 借用分两种：任意多个只读 `&`，或恰好一个可写 `&mut`，不能同时。

<Callout type="idea" title="别急着背" text="这四句话在 L3 会被拆成 15 讲反复打磨。现在能指着实验台说出「这里 a 为什么不能用了」，就已经达标。" />

<Quiz no="A-1" q="`let b = a;` 之后 a 不能用了，最根本的原因是什么？" :options='["a 被编译器自动删掉了", "堆上的数据被移动到了别处", "所有权移交给 b，避免同一块堆内存被释放两次", "String 类型不支持打印"]' answer="2" explain="移动的是所有权（栈上的指针等），堆数据并没有搬家；这样保证只有一个变量负责释放。" />

<Quiz no="A-2" q="想让 a 和 b 都持有一份完整字符串，应该怎么写？" :options='["let b = a;", "let b = &a;", "let b = a.clone();", "let b = *a;"]' answer="2" explain="clone() 显式复制堆数据；& 只是借用，b 并不拥有另一份。" />

```rust
fn length(s: &String) -> usize { s.len() }

fn main() {
    let name = String::from("Rust");
    let n = length(&name);
    println!("{} {}", name, n);
}
```

<Predict no="A-3" q="上面这段能编译吗？输出什么？" :options='["能，输出 Rust 4", "不能：name 的所有权已被移动", "能，但输出为空", "能编译，运行时 panic"]' answer="0" output="Rust 4" explain="传给 length 的是 &name（借用），函数结束后 name 依然属于 main。" />

<Exercise title="修好一段代码" task="下面代码编译不过。请在不删除任何输出的前提下，用两种方式分别修好它：1. 用 clone；2. 改成借用。" hints='["报错是 borrow of moved value", "2. 需要把函数参数改成引用类型，调用处加 &"]' solution="// 方式一：clone\nfn main() {\n    let a = String::from(&quot;hi&quot;);\n    let b = a.clone();\n    println!(&quot;{} {}&quot;, a, b);\n}\n\n// 方式二：借用\nfn show(s: &String) { println!(&quot;{}&quot;, s); }\nfn main() {\n    let a = String::from(&quot;hi&quot;);\n    show(&a);\n    println!(&quot;{}&quot;, a);\n}" explain="方式一多一份数据，方式二零拷贝 —— L3 会讲什么时候该选哪个。" />

## 小结与预告

<CheckList id="ownership-first-check" title="进入 L3 之前" :items='["我能解释为什么 String 赋值后原变量失效", "我知道 clone 是显式且昂贵的拷贝", "我知道 & 是借用、不抢所有权", "我知道值在作用域结束时自动释放", "我能在实验台里找到「借用冲突」那一步的报错"]' />

下一阶段是本教程最核心的部分。我们会把这四句话拆开，逐条配上规则、报错解读和练习：**[阶段三 · 核心机制 →](/core/index.md)**

[直接进入第 16 讲：所有权与 Move →](/core/ownership.md)
