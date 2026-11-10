---
title: 第 13 讲 · match 与模式匹配入门
description: match 为什么不只是 switch：穷举检查、模式能解构并绑定值、if let 简写，以及 match 本身也是表达式。
---

<StageHeader stage="L2 · 第 13 讲" level="★★☆☆☆" time="22 分钟" goal="能写出穷举的 match、用模式绑定值、用 if let 简写" prereq="第 12 讲 控制流：if / loop / while / for" />

# 第 13 讲 · `match` 与模式匹配入门

[第 12 讲](/basics/control-flow.md) 让程序能分叉和重复，但用的还是「判断条件」的思路。这一讲换一种思路：**描述值的形状，让编译器替你分派**。这是 Rust 里最值得尽早掌握的工具之一。

<Callout type="idea" title="先记住一句话" text="match 不只是加强版 switch：它强制你穷举所有可能，而且每个分支都能把值「拆」出来绑到变量上。前者消灭遗漏，后者消灭一堆临时变量。" />

## 一、`match` 不只是加强版 `switch`

| | `switch`（C / JavaScript） | `match`（Rust） |
| --- | --- | --- |
| 漏了情况 | 悄悄什么都不做 | 编译失败 `non-exhaustive patterns` |
| 分支里能拆数据吗 | 不能，只能比较 | 能，模式可以直接解构并绑定值 |
| 产生值吗 | 语句，不产生值 | 是表达式，每个分支都能给出值 |
| 匹配对象 | 基本是数字 / 字符串 | 整数、范围、元组、结构体、枚举…… |

<ConceptDiagram type="pipeline" title="一个值进入 match，按模式依次比对，落到唯一命中的分支"
  labels="待匹配的值::let code = 404|match 表达式::自上而下逐条比对|命中的分支::绑定值并执行|兜底分支::_ 或 other"
  caption="match 把一个值按模式分派到唯一命中的分支；编译器强制穷举，漏了就不让编译" />

<Compare title="同样是按状态码分叉" :panels='[{"label":"JavaScript switch","code":"switch (code) {\n  case 200: ...; break;\n  default: ...;\n}","note":"漏 break 会穿透，漏 default 没人提醒"},{"label":"Rust match","code":"match code {\n    200 => ...,\n    _   => ...,\n}","note":"编译器强制穷举，分支还能解构出值"}]' note="`_` 是通配符，表示「剩下的所有情况」。" />

<Quiz no="13-1" q="和 C / JavaScript 的 switch 相比，Rust 的 match 最关键的两个差别是？" :options='["执行更快、写法更短", "强制穷举所有情况，且模式能解构并绑定值", "只能匹配整数、没有 default", "运行时自动跳过没写的分支"]' answer="1" explain="穷举检查把「漏处理」变成编译错误；模式解构让你能直接在分支里拿到内部的值，这两点后面处理 Option / Result 时会天天用到。" />

## 二、第一个 `match`：四种常用模式

```rust
fn main() {
    let code = 404;
    match code {
        200 => println!("OK"),
        404 => println!("Not Found"),
        500..=599 => println!("服务器错误"),
        other => println!("其他状态码：{}", other),
    }
}
```

规则很简单：**自上而下逐条比对，第一个匹配上的分支获胜**，所以范围要放在具体值之后、兜底要放最后。

| 模式 | 例子 | 匹配什么 |
| --- | --- | --- |
| 字面量 | `200` | 恰好等于 200 |
| 范围 | `500..=599` | 落在闭区间内（`..=` 含右端） |
| 或模式 | `301 | 302 | 307` | 命中其中任意一个 |
| 通配符 | `_` | 剩下的一切，且不绑定值 |
| 变量绑定 | `other` | 剩下的一切，并把值绑到 `other` 上 |
| 忽略剩余 | `Point { x, .. }` | 结构体里只取 `x`，其余字段忽略（第 25 讲展开） |

<Predict no="13-2" q="把上面 match 的兜底分支 other 删掉，只留 200、404 和 500..=599，会发生什么？" :options='["正常运行，什么也不打印", "运行时 panic", "编译失败：non-exhaustive patterns", "自动走第一个分支"]' answer="2" output="error[E0004]: non-exhaustive patterns: i32::MIN..=199_i32 and others not covered" explain="整数有几十亿种取值，编译器只认「确实覆盖了全部」；要么列全，要么用 _ / 变量兜底。" />

## 三、穷举检查为什么值钱

`E0004` 看起来像刁难，实际是 Rust 最实用的一道保险。真正受益的场景是**枚举**：可能的情况就那么几种，编译器能一列到底。

```rust
fn main() {
    let maybe: Option<i32> = Some(42);
    let text = match maybe {
        Some(v) => format!("拿到 {}", v),
        None => "没有值".to_string(),
    };
    println!("{}", text);
}
```

删掉 `None` 分支，代码立刻编译不过。这意味着后来写 `Result` 错误处理时，你**不可能忘记处理失败**。

<Callout type="tip" title="和第 12 讲的表达式主线接上了" text="第 07 讲说过「Rust 里几乎一切都是表达式」，第 11 讲见过函数最后一行不加分号就是返回值。这里 match 同样产生值 —— 上面代码里 let text = match ... 正是这个性质的延续。两个分支都返回 String，类型必须一致。" />

## 四、模式里能「拆出值」

这是 `switch` 完全做不到的事：分支不仅判断，还能当场把数据里的零件取出来。

```rust
fn main() {
    let point = (3, -2);
    match point {
        (0, 0) => println!("原点"),
        (x, 0) => println!("在 x 轴上，x = {}", x),
        (0, y) => println!("在 y 轴上，y = {}", y),
        (x, y) => println!("普通点：{} {}", x, y),
    }

    let pair = ("rust", 5);
    if let ("rust", n) = pair {
        println!("rust 出现了 {} 次", n);
    }
}
```

`(x, y)` 这一支既兜了底，又把两个坐标绑成了变量 —— 不用先写 `point.0`、`point.1`，也不会漏掉任何一种坐标组合。

<StepBox title="写一个 match 的三步思路" :steps='[{"title":"第 1 步：先问「一共有哪些情况」","body":"是整数？就用范围 + 兜底\n是枚举或 Option？就把每个变体列出来","tip":"情况有限时，尽量别用 _ 偷懒"},{"title":"第 2 步：把特殊情况写在前面","body":"(0, 0) 要放在 (x, 0) 之前\n具体值要放在范围之前","tip":"match 自上而下，第一个命中的获胜"},{"title":"第 3 步：让每个分支给出同类型的值","body":"需要结果时写成表达式分支\n只需要执行动作时打印即可","tip":"类型不一致会直接编译报错"}]' />

## 五、`if let` / `while let`：只关心一种情况

如果只对一种形状感兴趣，写完整 `match` 会很啰嗦。`if let` 是它的语法糖。

```rust
fn main() {
    let values = vec![Some(1), None, Some(2)];
    for v in values {
        if let Some(n) = v {
            println!("拿到 {}", n);
        } else {
            println!("空位");
        }
    }

    // 完全等价的完整写法
    let v = Some(7);
    match v {
        Some(n) => println!("拿到 {}", n),
        _ => {}
    }
}
```

| 写法 | 适用 |
| --- | --- |
| `match` | 要覆盖多种情况，或需要编译器帮你查穷举 |
| `if let` | 只关心一种情况，其余一概不管 |
| `while let` | 反复「取出一个」直到取不出（例如不断 `pop()` 栈） |

<Callout type="warn" title="if let 放弃了穷举检查" text="一旦用了 if let，编译器就不再要求你处理其他分支。写 Option / Result 时先问自己：真的可以不管失败吗？如果不行，请用完整 match 或显式写 else。" />

## 六、`match` 本身也是表达式

```rust
fn main() {
    let score = 78;
    let label = match score {
        90..=100 => "优秀",
        60..=89 => "及格",
        _ => "再接再厉",
    };
    println!("{} -> {}", score, label);
}
```

三个分支都产生 `&str`，所以整条 `match` 的值可以直接赋给 `label`。如果某个分支写成 `println!(...)`（值是 `()`）而另一个返回字符串，编译器会立刻报类型不一致 —— 这是表达式规则在替你把关。

<Quiz no="13-3" q="关于 Rust 的模式匹配，哪些说法正确？" :options='["match 的分支自上而下比对，第一个命中的获胜", "_ 是通配符，不绑定值", "if let 只关心一种情况，但放弃了穷举检查", "match 只能用作语句，不能产生值"]' answer="0,1,2" multi="true" explain="前三条都对；match 是表达式，可以整体赋值给变量，所以第四条错。" />

<FillBlank tpl="fn main() {\n    let n = 3;\n    ___ n {\n        1 => println!(&quot;one&quot;),\n        3 => println!(&quot;three&quot;),\n        _ => println!(&quot;other&quot;),\n    }\n}" answers="match" hint="Rust 里做模式匹配的关键字，五个字母。" explain="match 必须穷举，这里用 _ 兜底；n 是 3，输出 three。" />

<CodeTabs title="同一个需求，三种写法" :tabs='[{"label":"完整 match","code":"let label = match score {\n    90..=100 => \"优秀\",\n    _ => \"继续加油\",\n};","note":"能拿值，且穷举检查最完整"},{"label":"只关心一种情况","code":"if let Some(v) = maybe {\n    println!(\"{}\", v);\n}","note":"最短，但其余情况一概不处理"},{"label":"match 作为表达式","code":"let label = match score {\n    90..=100 => \"优秀\",\n    _ => \"继续加油\",\n};\nprintln!(\"{}\", label);","note":"每个分支给出同类型的值"}]' />

<Exercise title="用 match 写成绩等级" task="实现 fn label(score: u32) -> String：用 match 表达式把 90 到 100 映射为「优秀」、60 到 89 映射为「及格」、其余映射为「再接再厉」，返回 String；再在 main 里用 for 打印 95、70、40 三个结果。" hints='["范围写 90..=100 和 60..=89，别漏等号", "最后用 _ 兜底", "分支都是 &str 字面量，整体转成 String 再返回"]' solution="fn label(score: u32) -&gt; String {\n    match score {\n        90..=100 =&gt; &quot;优秀&quot;,\n        60..=89 =&gt; &quot;及格&quot;,\n        _ =&gt; &quot;再接再厉&quot;,\n    }.to_string()\n}\n\nfn main() {\n    for s in [95, 70, 40] {\n        println!(&quot;{} -&gt; {}&quot;, s, label(s));\n    }\n}" explain="match 的每个分支都给出 &str，整体是一个表达式；.to_string() 把它变成拥有数据的 String 再返回。" />

## 七、常见坑

| 现象 | 处理 |
| --- | --- |
| `non-exhaustive patterns` | 补 `_ => ...` 或把枚举变体列全 |
| 分支「永远匹配不到」警告 | 顺序错了：把具体情况放到泛型兜底之前 |
| `expected &str, found ()` | 有一个分支只做了 `println!`，没给值；各分支类型要一致 |
| 用了变量兜底却没用到它 | 会触发 unused 警告，改成 `_` |
| `if let` 后忘了处理 `None` | 补 `else`，或改回完整 `match` |
| 想匹配区间却写成 `90..100` | `..` 不含右端，90..100 会漏掉 100；用 `..=` |

## 八、这一讲与第 25 讲的分工

| 本讲（入门） | [第 25 讲 模式匹配进阶](/core/patterns.md) |
| --- | --- |
| 字面量、范围、或模式、通配符、变量绑定 | 匹配守卫 `if`、`@` 绑定、切片模式、引用模式 |
| 元组与 `Option` 的简单解构 | 结构体 / 枚举嵌套解构、`ref` 与 `mut` |
| 知道穷举检查存在 | 不可达模式、全覆盖与 `#[non_exhaustive]` |
| `if let` 的基本用法 | 与 `let else`、错误处理链式写法的配合 |

<Quiz no="13-4" q="下面这段 match 会输出什么？" :options='["普通点：3 -2", "在 x 轴上，x = 3", "在 y 轴上，y = -2", "编译错误"]' answer="0" explain="point 是 (3, -2)，(0,0)、(x,0)、(0,y) 都不匹配，最后落到 (x, y) 并绑定 x=3、y=-2。" />

## 小结

- `match` = 自上而下按模式比对 + **编译器强制穷举** + 分支能解构绑定值。
- 常用模式：字面量、范围 `..=`、或模式 `|`、通配符 `_`、变量绑定。
- `if let` / `while let` 是「只关心一种情况」的简写，代价是失去穷举检查。
- `match` 是表达式，各分支必须给出同类型的值。
- 与第 07、11、12 讲的表达式主线一脉相承；进阶模式见第 25 讲。

<CheckList id="match-basics-check" title="学完本节，你应该能…" :items='["写出带兜底分支的 match 并解释穷举检查", "使用范围、或模式与变量绑定", "用模式解构元组并取出内部的值", "判断何时用 if let、何时必须用完整 match", "解释 non-exhaustive patterns 是什么意思", "把 match 当作表达式直接赋值给变量"]' />

[上一讲：控制流 if / loop / while / for →](/basics/control-flow.md) · [下一讲：Cargo 与项目结构 →](/basics/cargo.md)
