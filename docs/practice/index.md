---
title: 综合自测
description: 按阶段分组的自测题库，答错会给出解释并指向对应章节。
---

<StageHeader stage="附录 · 练习与速查" level="★★★☆☆" time="20 分钟" goal="找出自己还没吃透的章节" prereq="建议走完 66 讲之后再来" />

# 综合自测

这份题库按阶段分组，用来**定位薄弱点**，不是用来打分。每道题答错后都会给出解释，点链接就能回到对应章节重看。

<ProgressTracker />

## L1 · 编程地基

<Quiz no="A-1" q="Rust 既没有 GC 也不需要手动 free，它靠什么保证内存被正确释放？" :options='["运行时引用计数", "编译期确定所有权与作用域，自动插入释放代码", "操作系统定期回收", "程序员写 drop 调用"]' answer="1" explain="见《栈与堆》与《所有权三法则与 Move》两节。" />

<Quiz no="A-2" q="关于栈和堆，哪一句是错的？" :options='["栈上数据大小需在编译期确定", "函数返回时栈帧自动销毁", "堆上的数据必须有人负责释放", "String 的字符直接全部存放在栈上"]' answer="3" explain="String 在栈上只存指针/长度/容量，字符在堆上。见 《栈与堆》一节。" />

## L2 · Rust 语法

<Quiz no="A-3" q="想让变量后面可以重新赋值，正确写法是？" :options='["let x = 5;", "let mut x = 5;", "var x = 5;", "const mut x = 5;"]' answer="1" explain="见第 09 讲《变量、可变性与类型推导》。" />

<Quiz no="A-4" q="函数最后一个表达式后面加了分号，会导致？" :options='["返回值变成单元类型，若声明了返回类型则编译失败", "没有影响", "自动转成字符串", "运行变慢"]' answer="0" explain="见 《函数、语句与表达式》一节。" />

<Quiz no="A-5" q="`match` 少写了一个分支，编译器会？" :options='["运行时 panic", "报 non-exhaustive patterns", "自动补一个默认分支", "静默跳过"]' answer="1" explain="见第 13 讲《match 与模式匹配入门》。" />

<Quiz no="A-6" q="`cargo check` 相比 `cargo build` 的特点是？" :options='["会生成可发布的二进制文件", "只做检查不生成产物，速度更快", "只能检查测试代码", "会自动格式化代码"]' answer="1" explain="见 《Cargo 与项目结构》一节。" />

## L3 · 核心机制（重点）

<Quiz no="A-7" q="执行 `let b = a;` 后 a 不能再用，最准确的解释是？" :options='["a 被删除了", "堆数据被搬走了", "所有权移交给 b，保证只有一个人负责释放堆内存", "String 不允许被打印两次"]' answer="2" explain="见《所有权三法则与 Move》一节（第 16 讲）。" />

<Quiz no="A-8" q="同一时刻，下面哪种借用组合合法？" :options='["一个 &mut T 与一个 &T 共存", "两个 &mut T 共存", "多个 &T 共存", "旧 &T 已不再使用后再创建一个 &mut T"]' answer="2,3" multi="true" explain="见《可变借用与借用规则》一节（第 19 讲）。" />

<Quiz no="A-9" q="生命周期标注 a 的作用是？" :options='["延长变量存活时间", "描述引用之间的约束关系供编译器检查", "在运行时追踪对象", "把值移到静态区"]' answer="1" explain="见《生命周期标注与省略规则》一节（第 22 讲）。" />

<Quiz no="A-10" q="Rust 里「一个值可能不存在」用哪个类型表达？" :options='["null", "Option 的 Some / None", "空字符串", "bool 加一个标记变量"]' answer="1" explain="见《enum、Option 与 Result》一节（第 24 讲）。" />

<Quiz no="A-11" q="`?` 运算符遇到 Err 时会？" :options='["panic", "从当前函数提前返回这个 Err", "转成 None 继续执行", "打印后忽略"]' answer="1" explain="见 《错误处理》一节。" />

<Quiz no="A-12" q="`T: Clone + Debug` 表示？" :options='["T 必须同时实现两个 trait", "T 只能是 Clone 类型", "函数返回两个值", "T 是动态分发"]' answer="0" explain="见《泛型、trait bound 与 trait object》一节（第 29 讲）。" />

<Quiz no="A-13" q="`Rc&lt;T&gt;` 不能跨线程，应该换成？" :options='["Box", "Arc", "RefCell", "Cow"]' answer="1" explain="Arc 用原子操作维护引用计数。见 《智能指针》一节。" />

## L4 · 并发与异步

<Quiz no="A-14" q="`thread::spawn` 的闭包常需要 move，因为？" :options='["闭包会更快", "新线程可能比当前函数活得久，不能借用栈上局部变量", "spawn 强制要求", "move 会自动加锁"]' answer="1" explain="见《数据竞争与 Send/Sync》一节（第 31 讲）与《线程与 Send》。" />

<Quiz no="A-15" q="Future::poll 返回 Pending 表示？" :options='["出错了", "还没完成，让出线程，就绪时由 Waker 唤醒", "Future 已销毁", "需要新线程"]' answer="1" explain="见《Future 与 executor》一节（第 36 讲）。" />

<Quiz no="A-16" q="关于 channel，哪些说法正确？" :options='["send 会转移值的所有权", "所有 tx 被 drop 后 recv 返回 Err", "sync_channel 提供背压", "一个 channel 可以有多个 rx 同时消费"]' answer="0,1,2" multi="true" explain="标准库 mpsc 是单消费者；多个 rx 要用 broadcast。见 《消息传递 Channel》一节。" />

## L5 · 工程实战

<Quiz no="A-17" q="KV Server 把 Storage 定义成 trait，最大收益是？" :options='["编译更快", "存储实现可替换，上层代码不必改动", "能少写测试", "Rust 强制要求"]' answer="1" explain="见 《KV 第 1 步》一节。" />

<Quiz no="A-18" q="TCP 上为什么需要自定义帧？" :options='["为了加密", "TCP 是字节流没有消息边界，需要长度前缀划分消息", "为了压缩", "protobuf 要求"]' answer="1" explain="见 《KV 第 2 步》一节。" />

<Quiz no="A-19" q="做一次大重构时，最稳妥的顺序是？" :options='["先全部重写再补测试", "先确保测试全绿，再小步改动，每步保持测试通过", "先上线再修", "跳过测试直接改"]' answer="1" explain="见 《KV 第 4 步》一节。" />

<Quiz no="A-20" q="本教程的工程场景是按什么逻辑组织的？" :options='["按语法出现顺序", "先按场景分类，类内按难度递进，另加一条贯穿线", "按代码行数", "随机"]' answer="1" explain="见 [场景地图](/projects/)。" />

## 下一步

<Callout type="idea" title="错题怎么用" text="把答错的题对应章节重读一遍，再做一遍该节的「预测输出」和「补全代码」。Rust 的理解是螺旋式的 —— 第二遍看所有权，常常会有第一遍完全没有的通透感。" />

<CheckList id="quiz-check" title="自测完成" :items='["我完成了全部 20 道题", "我把错题对应的章节重新看了一遍", "我能用自己的话解释所有权三法则", "我能定位自己还没吃透的讲次"]' />

[查阅语法速查表 →](/practice/cheatsheet.md) · [看看常见问题 →](/practice/faq.md) · [回到 66 讲完整目录 →](/guide/curriculum.md)
