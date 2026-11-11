---
title: 第 45 讲 · KV 第 1 步：内存版与 trait 抽象
description: 定义命令模型、Storage 与 CommandService 两个 trait，先把核心逻辑做对。
---

<StageHeader stage="L5 · 第 45 讲 · KV 第 1 步" level="★★★☆☆" time="70 分钟" goal="写出可测试、可替换存储的核心逻辑" prereq="L3 trait / enum / Result" />

# 第 45 讲 · KV 第 1 步：内存版与 trait 抽象

第一步**不写一行网络代码**。先把「有哪些命令」「数据怎么存」「谁来处理」定义清楚，并用单元测试保证正确。后面四步都会复用这一层的成果。

## 协议定义

原教材用 protobuf 定义命令。教学版先用 Rust 枚举表达同样的结构：

```rust
// proto/abi.proto（真实项目用 prost 生成对应类型）
// message CommandRequest {
//   oneof request_data { Hget hget = 1; Hset hset = 2; Hdel hdel = 3; }
// }
```

```rust
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Str(String),
    Int(i64),
}

#[derive(Debug, Clone)]
pub enum Command {
    Get { table: String, key: String },
    Set { table: String, key: String, value: Value },
    Del { table: String, key: String },
}

#[derive(Debug, Clone, PartialEq)]
pub enum Response {
    Value(Option<Value>),
    Ok,
}
```

<Callout type="tip" title="为什么用 enum 而不是一堆 if" text="枚举让「命令的种类」成为类型，配合 `match` 的穷举检查：以后加 `Publish` / `Subscribe` 命令时，编译器会把所有需要改动的地方一次性列给你。第 4 步的 Pub/Sub 就是靠这点才敢大改。" />

## `Storage` trait：把「怎么存」隔离出去

```rust
pub trait Storage: Send + Sync + 'static {
    fn get(&self, table: &str, key: &str) -> Option<Value>;
    fn set(&mut self, table: String, key: String, value: Value) -> Option<Value>;
    fn del(&mut self, table: &str, key: &str) -> Option<Value>;
    fn contains(&self, table: &str, key: &str) -> bool;
}

#[derive(Default, Debug)]
pub struct MemTable {
    data: HashMap<String, HashMap<String, Value>>,
}

impl Storage for MemTable {
    fn get(&self, table: &str, key: &str) -> Option<Value> {
        self.data.get(table)?.get(key).cloned()
    }
    fn set(&mut self, table: String, key: String, value: Value) -> Option<Value> {
        self.data.entry(table).or_default().insert(key, value)
    }
    fn del(&mut self, table: &str, key: &str) -> Option<Value> {
        self.data.get_mut(table)?.remove(key)
    }
    fn contains(&self, table: &str, key: &str) -> bool {
        self.data.get(table).map(|t| t.contains_key(key)).unwrap_or(false)
    }
}
```

<ConceptDiagram type="trait" title="MemTable / SledDb / MockDb 都实现同一个 Storage" />

## `CommandService` trait：把「怎么处理」也隔离出去

```rust
pub trait CommandService {
    fn execute(self, store: &impl Storage) -> Response;
}

impl CommandService for Command {
    fn execute(self, store: &impl Storage) -> Response {
        match self {
            Command::Get { table, key } => Response::Value(store.get(&table, &key)),
            Command::Set { .. } | Command::Del { .. } => {
                // 下面 Service 里会用可变存储处理
                Response::Ok
            }
        }
    }
}
```

更地道的做法是把命令拆成独立类型（原教材的做法）：`Hget` / `Hset` / `Hdel` 各自 `impl CommandService`，`CommandRequest` 里的 `oneof` 分发到对应实现。优势是**每条命令可以单独测**，而且加新命令只需新增一个 impl。

## `Service`：统一的执行入口

```rust
pub struct Service<S: Storage> {
    inner: S,
}

impl<S: Storage> Service<S> {
    pub fn new(inner: S) -> Self { Self { inner } }

    pub fn execute(&mut self, cmd: Command) -> Response {
        match cmd {
            Command::Get { table, key } => Response::Value(self.inner.get(&table, &key)),
            Command::Set { table, key, value } => {
                self.inner.set(table, key, value);
                Response::Ok
            }
            Command::Del { table, key } => {
                self.inner.del(&table, &key);
                Response::Ok
            }
        }
    }
}
```

<StepBox title="第 1 步的落地顺序" :steps='[{"title":"定义 Value / Command / Response","body":"用 enum 描述所有可能的值与命令，先不写实现。","tip":"类型定下来，后面讨论才有共同语言。"},{"title":"定义 Storage trait","body":"列出 get / set / del / contains 四个最小操作。","tip":"trait 是「需要什么能力」，不是「打算怎么实现」。"},{"title":"实现 MemTable","body":"用嵌套 HashMap 存表与键，实现 Storage。","tip":"get 返回 clone 出的值，避免把引用暴露给调用方。"},{"title":"实现 Service","body":"接收命令、分发到存储、包装成 Response。","tip":"Service 只依赖 trait，不依赖 MemTable 具体类型。"},{"title":"写单元测试","body":"覆盖 set/get、删除、不同表互不干扰、读不存在返回 None。"}]' />

## 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_then_get() {
        let mut svc = Service::new(MemTable::default());
        svc.execute(Command::Set {
            table: "t1".into(), key: "k".into(),
            value: Value::Int(42),
        });
        let r = svc.execute(Command::Get { table: "t1".into(), key: "k".into() });
        assert_eq!(r, Response::Value(Some(Value::Int(42))));
    }

    #[test]
    fn tables_are_isolated() {
        let mut svc = Service::new(MemTable::default());
        svc.execute(Command::Set {
            table: "a".into(), key: "k".into(), value: Value::Str("v".into()),
        });
        assert_eq!(
            svc.execute(Command::Get { table: "b".into(), key: "k".into() }),
            Response::Value(None)
        );
    }
}
```

<Callout type="idea" title="现在就可以换存储" text="写一个 `impl Storage for MockDb`，把它传给 `Service::new`，单元测试就能在完全可控的数据上跑；以后换成 sled 持久化，Service 一行都不用改。这就是第 2 步敢加网络、第 4 步敢大重构的底气。" />

<Quiz no="45-1" q="把 Storage 定义成 trait 而不是直接用 MemTable，主要为了？" :options='["让编译更快", "存储实现可替换，Service 与网络层不受影响", "减少代码行数", "绕过所有权检查"]' answer="1" explain="解耦是这一步的核心目标，后续换持久化、加 mock 测试都依赖它。" />

<Quiz no="45-2" q="`Service&lt;S: Storage&gt;` 这种写法属于？" :options='["动态分发", "泛型 + trait bound，编译期静态分发", "生命周期标注", "宏"]' answer="1" explain="泛型参数加约束，编译器为具体类型生成专用代码，零成本。" />

<Predict no="45-3" q="新增一条 Publish 命令后，编译器会？" :options='["自动实现处理逻辑", "在所有 match 处报 non-exhaustive patterns，列出需要补的地方", "运行时 panic", "静默忽略"]' answer="1" output="error[E0004]: non-exhaustive patterns" explain="穷举检查把「新增功能后忘记改的地方」变成一串编译错误，重构安全性由此而来。" />

<Exercise title="加一条 Exists 命令" task="给 Command 增加 `Exists { table, key }`，返回 `Response::Bool(bool)`；同时补一个单元测试。" hints='["Response 也要新增一个变体", "Storage 已经有 contains 可以直接用", "match 里加一个分支，编译器会提示你漏了哪些地方"]' solution="// Command 新增：Exists { table: String, key: String }\n// Response 新增：Bool(bool)\nCommand::Exists { table, key } =&gt; {\n    Response::Bool(self.inner.contains(&amp;table, &amp;key))\n}" explain="跟着编译错误逐个补齐，是 Rust 重构最舒服的地方。" />

## 本步验收

<CheckList id="kv1-check" title="第 1 步验收" :items='["Command / Response 用 enum 表达且穷举完整", "Storage trait 与 MemTable 实现分离", "Service 只依赖 trait", "cargo test 全部通过"]' />

核心逻辑已经稳固。下一步让它「能被别人调用」：加网络层和协议帧。

[下一讲：第 46 讲 KV 第 2 步 网络与协议帧 →](/projects/kv/2-network.md)
