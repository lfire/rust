---
title: 第 49 讲 · SQL / CSV 数据工具
description: 用一套查询 AST 适配 CSV、JSON、内存表多种数据源，体会「一鱼多吃」的抽象。
---

<StageHeader stage="L5 · 第 49 讲" level="★★★☆☆" time="80 分钟" goal="理解用枚举 + trait 做数据源抽象" prereq="L3 enum / trait / 迭代器" />

# 第 49 讲 · SQL / CSV 数据工具

**场景**：一份数据可能来自 CSV、JSON，也可能来自数据库，但用户只想写一句 `SELECT name WHERE score > 60`。原教材把这个思路叫「一鱼多吃」：**把查询解析成统一的中间表示（AST），再交给不同的数据源执行**。

这一讲会做一个教学级的最小版本，帮你建立「查询层 / 数据源层」分层直觉；末尾再指出现实项目里 `sqlparser`、`sqlx`、`datafusion` 各自的位置。

## 你会练到什么

- 用 `enum` 定义一棵极简查询 AST
- 用 `trait` 抽象「数据源」，让 CSV 和内存表共用同一套执行逻辑
- `Iterator` 适配器链做过滤与投影
- `serde` 处理 CSV / JSON 的序列化
- 感受「编译期多态」怎么让扩展新数据源几乎零改动

## 依赖

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
csv = "1"
anyhow = "1"
```

<ConceptDiagram type="pipeline" title="查询字符串 → AST → 执行器 → 数据源（可替换）"
  labels="SQL 文本::用户输入|解析成 AST::enum 表达|执行器::trait 分发|数据源::CSV / 内存表"
  caption="查询字符串 → AST → 执行器 → 数据源，替换数据源不用改执行器" />

## 第一步：定义查询 AST

```rust
#[derive(Debug, Clone)]
enum Expr {
    Col(String),
    Lit(String),
    Gt(Box<Expr>, Box<Expr>),
    Eq(Box<Expr>, Box<Expr>),
}

#[derive(Debug, Clone)]
struct Query {
    select: Vec<String>,
    from: String,
    filter: Option<Expr>,
    limit: Option<usize>,
}

// 教学版解析器：只支持  SELECT a,b FROM t WHERE col > 数字 [LIMIT n]
fn parse(sql: &str) -> anyhow::Result<Query> {
    let s = sql.trim().trim_end_matches(';');
    let upper = s.to_uppercase();
    let sel_end = upper.find(" FROM ").ok_or_else(|| anyhow::anyhow!("缺少 FROM"))?;
    let cols: Vec<String> = s[7..sel_end]
        .split(',').map(|x| x.trim().to_string()).collect();

    let rest = &s[sel_end + 6..];
    let mut parts = rest.splitn(2, " WHERE ");
    let from = parts.next().unwrap().trim().to_string();

    let mut filter = None;
    let mut limit = None;
    if let Some(tail) = parts.next() {
        let mut seg = tail.splitn(2, " LIMIT ");
        let cond = seg.next().unwrap().trim();
        if let Some(l) = seg.next() {
            limit = Some(l.trim().parse()?);
        }
        let toks: Vec<&str> = cond.split_whitespace().collect();
        if toks.len() == 3 && toks[1] == ">" {
            filter = Some(Expr::Gt(
                Box::new(Expr::Col(toks[0].into())),
                Box::new(Expr::Lit(toks[2].into())),
            ));
        }
    }
    Ok(Query { select: cols, from, filter, limit })
}
```

<Callout type="tip" title="为什么用 Box" text="`Expr` 里套 `Expr` 会形成递归类型，大小无法确定。`Box` 把它固定成一根指针 —— 这正是 L3 智能指针那一节讲的用途，这里第一次在真实项目里用到。" />

## 第二步：用 trait 抽象数据源

```rust
use serde_json::Value;

trait DataSource {
    fn name(&self) -> &str;
    fn rows(&self) -> Vec<Value>;
}

struct MemoryTable { name: String, rows: Vec<Value> }
impl DataSource for MemoryTable {
    fn name(&self) -> &str { &self.name }
    fn rows(&self) -> Vec<Value> { self.rows.clone() }
}

struct CsvTable { name: String, rows: Vec<Value> }
impl DataSource for CsvTable {
    fn name(&self) -> &str { &self.name }
    fn rows(&self) -> Vec<Value> { self.rows.clone() }
}

fn csv_to_values(text: &str) -> anyhow::Result<Vec<Value>> {
    let mut rdr = csv::Reader::from_reader(text.as_bytes());
    let headers: Vec<String> = rdr.headers()?.iter().map(|s| s.to_string()).collect();
    let mut out = Vec::new();
    for rec in rdr.records() {
        let rec = rec?;
        let mut map = serde_json::Map::new();
        for (h, v) in headers.iter().zip(rec.iter()) {
            let val = v.parse::<f64>()
                .map(|n| Value::from(n))
                .unwrap_or_else(|_| Value::String(v.to_string()));
            map.insert(h.clone(), val);
        }
        out.push(Value::Object(map));
    }
    Ok(out)
}
```

## 第三步：一个执行器服务所有数据源

```rust
fn eval_cond(row: &Value, e: &Expr) -> bool {
    match e {
        Expr::Eq(a, b) => val(row, a) == val(row, b),
        Expr::Gt(a, b) => {
            let (x, y) = (val(row, a), val(row, b));
            match (x.as_f64(), y.as_f64()) {
                (Some(m), Some(n)) => m > n,
                _ => x.to_string() > y.to_string(),
            }
        }
        _ => false,
    }
}

fn val<'a>(row: &'a Value, e: &Expr) -> std::borrow::Cow<'a, Value> {
    match e {
        Expr::Col(c) => std::borrow::Cow::Borrowed(&row[c]),
        Expr::Lit(s) => std::borrow::Cow::Owned(
            s.parse::<f64>().map(Value::from)
                .unwrap_or_else(|_| Value::String(s.clone()))
        ),
        _ => std::borrow::Cow::Owned(Value::Null),
    }
}

fn execute<T: DataSource>(q: &Query, src: &T) -> Vec<Value> {
    let rows = src.rows();
    let iter = rows.into_iter()
        .filter(|r| q.filter.as_ref().map(|e| eval_cond(r, e)).unwrap_or(true))
        .take(q.limit.unwrap_or(usize::MAX));

    if q.select == ["*"] {
        iter.collect()
    } else {
        iter.map(|r| {
            let mut m = serde_json::Map::new();
            for c in &q.select { m.insert(c.clone(), r[c].clone()); }
            Value::Object(m)
        }).collect()
    }
}
```

```rust
fn main() -> anyhow::Result<()> {
    let csv = "name,score\n小明,95\n小红,58\n小刚,73\n";
    let table = CsvTable { name: "students".into(), rows: csv_to_values(csv)? };

    let q = parse("SELECT name, score FROM students WHERE score > 60 LIMIT 5")?;
    let out = execute(&q, &table);
    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}
```

<Callout type="idea" title="抽象的价值在哪" text="新增一种数据源（JSON 文件、SQLite、HTTP 接口）只要再 `impl DataSource`，`parse` 和 `execute` 一行都不用改。这就是 L3 trait 与 L5 分层架构的结合点。" />

## 现实项目里的三个 crate

| crate | 定位 | 什么时候用 |
| --- | --- | --- |
| `sqlparser` | 把 SQL 文本解析成完整 AST | 要支持真正的 SQL 语法时，别自己写解析器 |
| `sqlx` | 编译期检查的异步 SQL 客户端 | 应用要连 PostgreSQL / MySQL / SQLite |
| `datafusion` | 列式查询引擎（Arrow） | 对 CSV / Parquet 做分析型查询、聚合、Join |

<Callout type="warn" title="上面的解析器只是教具" text="手写字符串切分无法处理引号、括号、AND/OR、函数等真实 SQL。理解 AST 与执行器分层之后，请换成 sqlparser + datafusion，别把教学解析器搬进生产。" />

<Quiz no="49-1" q="把查询解析成 AST 再执行，最大的好处是？" :options='["运行更快", "查询逻辑与数据源解耦，新增数据源不用改执行器", "可以省略错误处理", "不需要 trait"]' answer="1" explain="中间表示让「前端语法」和「后端存储」各自独立演化，是编译器、数据库、ORM 的共同思路。" />

<Quiz no="49-2" q="`Expr::Gt(Box&lt;Expr&gt;, Box&lt;Expr&gt;)` 里为什么要 Box？" :options='["为了支持多线程", "递归类型大小不确定，用指针固定大小", "为了让值可以被克隆", "Box 会自动求值"]' answer="1" explain="Box 把递归部分变成固定大小的堆指针，编译器才能算出 Expr 的大小。" />

<Predict no="49-3" q="给 execute 传一个实现了 DataSource 的新类型，需要改 execute 本身吗？" :options='["需要，得加一个 match 分支", "不需要，泛型 T: DataSource 已经覆盖所有实现", "需要重写 parse", "只有 CSV 类型能传"]' answer="1" output="不需要" explain="泛型约束按能力而非具体类型工作，这正是 trait 抽象的意义。" />

<Exercise title="加一个 AND 条件" task="给 Expr 增加 `And(Box&lt;Expr&gt;, Box&lt;Expr&gt;)` 变体，并在 eval_cond 里实现；顺手让解析器支持用 AND 连接的两个比较（提示：先按 AND 切分再递归解析）。" hints='["match 里加一个分支调用两次 eval_cond", "解析时按 AND 关键字切分成两段", "把单段比较的解析抽成一个小函数便于复用"]' solution="fn parse_cond(s: &str) -&gt; Option&lt;Expr&gt; { /* 解析 col &gt; 数字 */ }\n\n// 组合\nlet parts: Vec&lt;&amp;str&gt; = cond.split(&quot; AND &quot;).collect();\nfilter = match parts.len() {\n    1 =&gt; parse_cond(parts[0]),\n    2 =&gt; Some(Expr::And(\n        Box::new(parse_cond(parts[0])?),\n        Box::new(parse_cond(parts[1])?),\n    )),\n    _ =&gt; None,\n};" explain="把「解析一个条件」抽成函数，组合逻辑就变成纯结构拼装 —— 这叫组合子思想。" />

## 不用手写解析器：Nom 组合子

本讲手动切出了查询 AST。真实项目里更常见的做法是**解析器组合子**：每个小解析器就是一个普通 Rust 函数，组合子把若干小解析器拼成大的，可以无限叠加，代码形状几乎就是数据结构的形状。

Nom 的统一约定是：parser 接收输入，返回 `(剩余输入, 解析结果)`，即 `IResult<I, O> = Result<(I, O), Err<E>>`。因为总是把「还没读的部分」交回去，它天然适合边取数据边解析的流式场景，而且大部分路径零拷贝。

```rust
// 示意：Nom 7 风格，需要本地项目引入 nom = "7"
use nom::{bytes::complete::tag, sequence::Tuple, IResult};

struct Color { red: u8, green: u8, blue: u8 }

fn hex_primary(input: &str) -> IResult<&str, u8> {
    let (rest, two) = nom::bytes::complete::take_while_m_n(2, 2, |c: char| c.is_ascii_hexdigit())(input)?;
    Ok((rest, u8::from_str_radix(two, 16).unwrap()))
}

fn hex_color(input: &str) -> IResult<&str, Color> {
    let (input, _) = tag("#")(input)?;
    let (input, (red, green, blue)) = (hex_primary, hex_primary, hex_primary).parse(input)?;
    Ok((input, Color { red, green, blue }))
}
```

| 层次 | 常用工具 | 作用 |
| --- | --- | --- |
| 基本解析器 | `tag` / `tag_no_case` | 匹配固定字面量 |
| | `digit1` / `alpha1` / `hex_digit1` / `space0` | 匹配一类字符，`1` 表示至少一次、`0` 表示可为零 |
| | `i32` / `float` | 直接解析出数值类型 |
| 组合子 | `alt` | 多个分支择一 |
| | `tuple` / `pair` / `separated_pair` | 按顺序拼接，中间可带分隔符 |
| | `delimited` | 去掉首尾包裹（如括号） |
| | `map_res` / `take_while_m_n` | 把匹配结果转成自己的类型 / 限定重复次数 |

<Callout type="tip" title="怎么选解析方案" text="手写解析器可控，但边界分支最容易漏；正则上手快，复杂语法会迅速变得难读、报错也笼统；Nom 这类组合子小而可单测，适合协议帧、坐标、颜色、配置项；要描述一整套语言语法，再看 `pest`（独立 PEG 文件）或 `lalrpop`（类 Yacc）。另外注意 `tag` 返回的是闭包，要再接一次输入；元组上的 `.parse()` 来自 Nom 的 `Tuple` trait，标准库里查不到。" />

<Quiz no="49-4" q="Nom 的 parser 为什么返回 `(剩余输入, 解析结果)` 而不只是结果？" :options='["为了让代码更长", "便于把剩余输入交给下一个 parser 继续解析，支持组合与流式处理", "因为 Rust 不支持返回单个值", "为了绕过所有权检查"]' answer="1" explain="交回剩余输入是组合子能无限拼接的基础，也是 Nom 适合流式解析、能做零拷贝的原因。" />

## 扩展挑战

- 用 `sqlparser` 替换手写解析器，比较 AST 的复杂度。
- 用 `sqlx` 接一个 SQLite 文件，实现真正的 `DataSource`。
- 加聚合：`SELECT count(*) , avg(score)`，体会执行器从「逐行」升级到「分组」。
- 用 `datafusion` 跑同一份 CSV，比较手写执行器与列式引擎的性能差距。

<CheckList id="sql-check" title="验收清单" :items='["能解析并执行一条带 WHERE 与 LIMIT 的查询", "CSV 与内存表复用同一个 execute", "理解 Box 在递归 AST 中的作用", "知道真实项目该用哪些 crate"]' />

[下一个项目：第 50 讲 数据工程 →](/projects/data-engineering.md)
