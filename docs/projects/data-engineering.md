---
title: 第 50 讲 · 数据工程
description: 用 sqlx 访问关系数据库、用 DataFusion 对 CSV/Parquet 做分析型查询，理解 OLTP 与 OLAP 两种数据路径。
---

<StageHeader stage="L5 · 第 50 讲" level="★★★★☆" time="70 分钟" goal="能按场景在关系库客户端与列式引擎之间选型" prereq="第 49 讲 SQL/CSV 工具 + L3 错误处理" />

# 第 50 讲 · 数据工程

[第 49 讲 SQL / CSV 查询工具](/projects/sql-data-tool.md) 自己写了个教学级 AST 执行器。真实项目里，两条路径各有成熟工具：**要连数据库做增删改查用 sqlx，要对文件做聚合分析用 DataFusion**。这一讲把两者都跑一遍，并说清什么时候该用哪个。

## 两条数据路径

| 维度 | OLTP（sqlx / diesel） | OLAP（DataFusion / Polars） |
| --- | --- | --- |
| 对象 | 关系库里的一行行记录 | CSV / Parquet / Arrow 列式数据 |
| 典型操作 | 按主键查、插入、更新、事务 | 扫描、过滤、分组聚合、Join |
| 优化重点 | 索引、连接池、事务边界 | 列裁剪、谓词下推、并行扫描 |
| 数据规模 | 大表但每次只取少量行 | 一次扫描百万～亿行 |
| 代表 crate | `sqlx`、`diesel`、`sea-orm` | `datafusion`、`polars` |

<Callout type="idea" title="别用错工具" text="拿 `sqlx` 逐行读一千万条记录再在 Rust 里 group by，通常比 DataFusion 直接扫描 Parquet 慢一个数量级；反过来，拿列式引擎做单条主键更新也不合适。判断标准是「这次操作主要是在找少量行，还是在大批量算统计」。" />

## 依赖

```toml
[dependencies]
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "macros"] }
datafusion = "43"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
anyhow = "1"
```

```bash
cargo install sqlx-cli        # 可选：迁移与 offline 模式
sqlite3 demo.db < init.sql    # 准备测试数据
```

<StepBox title="分步实现" :steps='[{"title":"建表与连接池","body":"`SqlitePoolOptions::new().max_connections(5).connect(...)`，用 migrate 建表。","tip":"连接池是长驻对象，别每个请求建一次。"},{"title":"类型映射","body":"`#[derive(sqlx::FromRow)] struct User`，用 query_as 直接得到结构体。","tip":"字段名与列名的对应关系要显式核对。"},{"title":"参数化查询","body":"`sqlx::query(...).bind(id)`，绝不拼接 SQL 字符串。","tip":"bind 同时解决注入与类型转义。"},{"title":"事务","body":"`pool.begin()` 后在事务里多次操作，最后 commit。","tip":"错误时自动 rollback，靠 RAII 保证。"},{"title":"切到 DataFusion","body":"`SessionContext` 注册 CSV 为表，写 SQL 做聚合，collect 结果。","tip":"用 register_csv 时指定 schema 可避免类型推断偏差。"},{"title":"对比与选型","body":"同一份数据分别用两种方式算总金额，记录耗时与代码量。"}]' />

## 一、sqlx：关系库访问

```rust
use anyhow::Result;
use sqlx::{sqlite::SqlitePoolOptions, FromRow, SqlitePool};

#[derive(Debug, FromRow, serde::Serialize)]
struct Order {
    id: i64,
    customer: String,
    amount: f64,
}

async fn init(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS orders (
           id INTEGER PRIMARY KEY,
           customer TEXT NOT NULL,
           amount REAL NOT NULL
         )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn insert(pool: &SqlitePool, customer: &str, amount: f64) -> Result<i64> {
    // 参数化：绝不 format! 拼 SQL
    let row = sqlx::query("INSERT INTO orders (customer, amount) VALUES (?, ?)")
        .bind(customer)
        .bind(amount)
        .execute(pool)
        .await?;
    Ok(row.last_insert_rowid())
}

async fn top_orders(pool: &SqlitePool, min_amount: f64) -> Result<Vec<Order>> {
    let rows = sqlx::query_as::<_, Order>(
        "SELECT id, customer, amount FROM orders WHERE amount >= ? ORDER BY amount DESC",
    )
    .bind(min_amount)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

async fn transfer_bonus(pool: &SqlitePool, customer: &str, bonus: f64) -> Result<()> {
    let mut tx = pool.begin().await?;               // 事务开始
    sqlx::query("UPDATE orders SET amount = amount + ? WHERE customer = ?")
        .bind(bonus)
        .bind(customer)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO audit (note) VALUES (?)")
        .bind(format!("bonus for {}", customer))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;                            // 出错则 Drop 自动回滚
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect("sqlite://demo.db")
        .await?;
    init(&pool).await?;
    insert(&pool, "小明", 128.5).await?;
    for o in top_orders(&pool, 100.0).await? {
        println!("{} {} {}", o.id, o.customer, o.amount);
    }
    Ok(())
}
```

<Callout type="tip" title="编译期检查 SQL" text="`sqlx::query!` / `query_as!` 宏会在**编译期**连数据库校验 SQL 与列类型。团队开发时用 `cargo sqlx prepare` 生成 `.sqlx/` 离线缓存，CI 就不必带数据库。上面用的是运行时版本 `query_as`，上手更简单。" />

## 二、DataFusion：对文件做分析查询

```rust
use anyhow::Result;
use datafusion::prelude::*;
use datafusion::arrow::util::pretty::pretty_format_batches;

#[tokio::main]
async fn main() -> Result<()> {
    let ctx = SessionContext::new();

    // 把 CSV 注册成一张表；Parquet 用 register_parquet
    ctx.register_csv("orders", "data/orders.csv", CsvReadOptions::new())
        .await?;

    // 列裁剪 + 谓词下推 + 聚合，由引擎优化，不需要手写循环
    let df = ctx
        .sql(
            "SELECT customer,
                    COUNT(*) AS cnt,
                    ROUND(SUM(amount), 2) AS total
             FROM orders
             WHERE amount > 50
             GROUP BY customer
             ORDER BY total DESC
             LIMIT 10",
        )
        .await?;

    let batches = df.collect().await?;
    println!("{}", pretty_format_batches(&batches)?);

    // 也可以看它生成的物理计划，确认谓词有没有下推
    println!("{}", df.clone().explain(false, false)?.collect().await?
        .iter().map(|b| pretty_format_batches(&[b.clone()]).unwrap().to_string())
        .collect::<Vec<_>>().join("\n"));
    Ok(())
}
```

```bash
# data/orders.csv
customer,amount
小明,128.5
小红,42
小明,76
小刚,210
```

## 量化对比（示意）

| 任务 | sqlx + 手写聚合 | DataFusion |
| --- | --- | --- |
| 100 万行 CSV 求分组总额 | 需先入库、逐行 fetch、Rust 里累加 | 直接 register_csv + 一条 SQL |
| 单行主键查询 | 微秒级、走索引 | 需全表扫描，不合适 |
| 内存占用 | 可控（流式 fetch） | 按批（RecordBatch）处理 |

> 具体数字请在自己数据上测。重点是：**OLAP 引擎的价值在于列裁剪、谓词下推与并行扫描**，不是「SQL 写起来短」。

<Quiz no="50-1" q="要给一个千万行的 Parquet 文件算分组总额，最合适的是？" :options='["sqlx 逐行 fetch 到 Rust 里累加", "DataFusion 注册表后写一条 GROUP BY", "用 HashMap 手写循环", "用 serde_json 读进来"]' answer="1" explain="列式引擎会做列裁剪、谓词下推与并行扫描，正是这类分析型负载的甜区。" />

<Quiz no="50-2" q="`sqlx::query(...).bind(value)` 相比字符串拼接的主要作用是？" :options='["让 SQL 更好看", "参数化查询，避免注入并正确处理类型转义", "加快编译", "自动生成索引"]' answer="1" explain="bind 把值交给驱动处理，既防注入也避免引号/转义错误。" />

<Exercise title="加一个时间维度" task="假设 orders 表/CSV 有 `created_at` 日期列，用 DataFusion 写一条 SQL 按月统计总额，并说明：如果这个查询要每秒跑上千次，你会怎么改?" hints='["用 date_trunc 或 substr 提取月份", "高频查询应预聚合：物化结果表 / 缓存 / 增量更新", "DataFusion 适合批量分析而非高并发点查"]' solution="SELECT substr(created_at, 1, 7) AS month,\n       ROUND(SUM(amount), 2) AS total\nFROM orders\nGROUP BY month\nORDER BY month;" explain="秒级上千次点查应把结果预聚合进关系库或缓存，DataFusion 每次重新扫全表并不划算。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| `query!` 宏编译失败 | 需要 DATABASE_URL 或 `.sqlx/` 离线缓存 |
| CSV 类型推断错 | 用 `CsvReadOptions` 显式指定 Schema，别让引擎猜 |
| SQLite 并发写报 locked | 开 WAL 模式、缩小事务范围、控制连接池大小 |
| N+1 查询 | 一条 JOIN / IN 查询取回，别在循环里查库 |
| 大结果集 OOM | 用 `fetch` 流式处理或分页，别一次 `fetch_all` |

## 扩展挑战

- 用 `sqlx::query!` + `cargo sqlx prepare` 把 SQL 校验挪到编译期并接入 CI。
- 用 DataFusion 的 `EXPLAIN` 验证谓词下推是否生效。
- 把 Parquet + 对象存储接进来，比较本地文件与远端扫描的差异。
- 用 [第 49 讲 教学版 AST](/projects/sql-data-tool.md) 生成 SQL 交给 DataFusion 执行，串起两讲。
- 加 `tracing` 记录每条慢查询，配 [KV 第 5 步 指标](/projects/kv/5-production.md)。

<CheckList id="data-eng-check" title="验收清单" :items='["sqlx 能建表、插入、参数化查询与事务", "DataFusion 能对 CSV 做 GROUP BY 聚合", "能说出 OLTP 与 OLAP 的选型依据", "看过一次 EXPLAIN 物理计划", "没有用字符串拼接 SQL"]' />

[上一讲：第 49 讲 SQL / CSV 工具 →](/projects/sql-data-tool.md) · [下一讲：第 51 讲 手写 MPSC channel →](/projects/mpsc-channel.md) · [回到场景地图 →](/projects/)
