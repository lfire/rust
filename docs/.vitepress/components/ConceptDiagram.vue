<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue'
import ConceptDiagramSvg from './ConceptDiagramSvg.vue'

interface Node { x: number; y: number; w: number; h: number; label: string; sub?: string; tone?: string }
interface Arrow { x1: number; y1: number; x2: number; y2: number; label?: string }
interface Diagram { h: number; nodes: Node[]; arrows: Arrow[]; caption?: string }

const TONES: Record<string, string> = {
  orange: 'var(--rb-orange)', blue: 'var(--rb-blue)', green: 'var(--rb-green)',
  purple: 'var(--rb-purple)', red: 'var(--rb-red)', gray: 'var(--rb-muted)',
}

const D: Record<string, Diagram> = {
  callable: {
    h: 168,
    caption: '函数把「输入」变成「输出」；调用一次就压入一个栈帧，返回时销毁',
    nodes: [
      { x: 30, y: 48, w: 150, h: 62, label: '输入值', sub: '参数 a, b', tone: 'blue' },
      { x: 250, y: 48, w: 180, h: 62, label: '一段命名逻辑', sub: 'fn add(a, b)', tone: 'purple' },
      { x: 500, y: 48, w: 150, h: 62, label: '输出值', sub: '返回值', tone: 'green' },
    ],
    arrows: [
      { x1: 180, y1: 79, x2: 250, y2: 79, label: '传入' },
      { x1: 430, y1: 79, x2: 500, y2: 79, label: '交回' },
    ],
  },
  'stack-heap': {
    h: 250,
    caption: '栈：大小固定、自动回收；堆：大小可变、需要有人负责释放',
    nodes: [
      { x: 40, y: 40, w: 250, h: 190, label: '栈 Stack', sub: '快 · 连续 · 后进先出', tone: 'blue' },
      { x: 390, y: 40, w: 250, h: 190, label: '堆 Heap', sub: '灵活 · 分散 · 需管理', tone: 'orange' },
      { x: 65, y: 96, w: 200, h: 52, label: '标量值', sub: 'i32 / bool / f64 · 固定大小', tone: 'gray' },
      { x: 65, y: 154, w: 200, h: 52, label: 'String 变量', sub: '栈上：指针 / 长度 / 容量', tone: 'blue' },
      { x: 415, y: 96, w: 200, h: 52, label: '字符串字节', sub: '堆上：UTF-8 数据', tone: 'orange' },
      { x: 415, y: 154, w: 200, h: 52, label: 'Vec 元素', sub: '堆上：连续序列', tone: 'orange' },
    ],
    arrows: [{ x1: 265, y1: 180, x2: 415, y2: 122, label: '指向' }],
  },
  ownership: {
    h: 210,
    caption: '同一时刻，一个值只有一个所有者；所有者离开作用域，值自动释放',
    nodes: [
      { x: 25, y: 55, w: 190, h: 65, label: '① 创建 s1', sub: 'let s1 = String::from("hi")', tone: 'orange' },
      { x: 245, y: 55, w: 190, h: 65, label: '② 所有权移动', sub: 'let s2 = s1;', tone: 'purple' },
      { x: 465, y: 55, w: 190, h: 65, label: '③ s1 失效', sub: 's2 成为唯一所有者', tone: 'green' },
    ],
    arrows: [{ x1: 215, y1: 87, x2: 245, y2: 87 }, { x1: 435, y1: 87, x2: 465, y2: 87 }],
  },
  borrow: {
    h: 215,
    caption: '借用不转移所有权：任意多个只读借用，或恰好一个可写借用',
    nodes: [
      { x: 245, y: 30, w: 190, h: 60, label: 's : String（所有者）', tone: 'orange' },
      { x: 30, y: 130, w: 190, h: 60, label: '&s  只读借用 × N', sub: '可以同时存在多个', tone: 'blue' },
      { x: 460, y: 130, w: 190, h: 60, label: '&mut s  可写借用 × 1', sub: '独占，不能与只读共存', tone: 'red' },
    ],
    arrows: [{ x1: 300, y1: 90, x2: 150, y2: 130 }, { x1: 380, y1: 90, x2: 530, y2: 130 }],
  },
  lifetime: {
    h: 205,
    caption: '引用不能比它指向的值活得更久：两条作用域线相撞时，编译器直接拒绝',
    nodes: [
      { x: 25, y: 35, w: 290, h: 58, label: '① 引用 r 活得久', sub: 'let r; 在外层声明', tone: 'purple' },
      { x: 25, y: 115, w: 290, h: 58, label: '② 值 x 先销毁', sub: '{ let x = 5; r = &x; }', tone: 'red' },
      { x: 365, y: 75, w: 290, h: 58, label: '编译错误 E0597', sub: 'x does not live long enough', tone: 'orange' },
    ],
    arrows: [
      { x1: 315, y1: 64, x2: 365, y2: 95 }, { x1: 315, y1: 144, x2: 365, y2: 115 },
    ],
  },
  cargo: {
    h: 175,
    caption: 'Cargo 一条命令串起：依赖解析 → 编译 → 链接 → 运行/测试',
    nodes: [
      { x: 20, y: 55, w: 120, h: 55, label: 'Cargo.toml', sub: '声明依赖', tone: 'blue' },
      { x: 170, y: 55, w: 120, h: 55, label: 'crates.io', sub: '下载 crate', tone: 'purple' },
      { x: 320, y: 55, w: 120, h: 55, label: 'rustc', sub: '编译检查', tone: 'orange' },
      { x: 470, y: 55, w: 120, h: 55, label: 'target/', sub: '可执行文件', tone: 'green' },
    ],
    arrows: [
      { x1: 140, y1: 82, x2: 170, y2: 82 }, { x1: 290, y1: 82, x2: 320, y2: 82 },
      { x1: 440, y1: 82, x2: 470, y2: 82 },
    ],
  },
  error: {
    h: 205,
    caption: 'Rust 把「可能失败」写进类型：Result<T, E> 迫使调用方处理两条分支',
    nodes: [
      { x: 250, y: 25, w: 180, h: 52, label: 'Result<T, E>', tone: 'purple' },
      { x: 70, y: 120, w: 210, h: 58, label: 'Ok(T)  成功', sub: '继续往下走', tone: 'green' },
      { x: 400, y: 120, w: 210, h: 58, label: 'Err(E)  失败', sub: '? 提前返回 / match 处理', tone: 'red' },
    ],
    arrows: [{ x1: 300, y1: 77, x2: 180, y2: 120 }, { x1: 380, y1: 77, x2: 500, y2: 120 }],
  },
  trait: {
    h: 205,
    caption: 'Trait 是「能做什么」的约定，不同类型各自实现，调用方只依赖约定',
    nodes: [
      { x: 245, y: 25, w: 190, h: 52, label: 'trait Storage', sub: 'get / set / delete', tone: 'purple' },
      { x: 30, y: 120, w: 190, h: 58, label: 'MemTable', sub: 'impl Storage', tone: 'blue' },
      { x: 245, y: 120, w: 190, h: 58, label: 'SledDb', sub: 'impl Storage', tone: 'blue' },
      { x: 460, y: 120, w: 190, h: 58, label: 'MockDb（测试）', sub: 'impl Storage', tone: 'blue' },
    ],
    arrows: [
      { x1: 300, y1: 77, x2: 125, y2: 120 }, { x1: 340, y1: 77, x2: 340, y2: 120 },
      { x1: 380, y1: 77, x2: 555, y2: 120 },
    ],
  },
  thread: {
    h: 205,
    caption: '「通过通信共享内存」：线程之间用 channel 传递消息，而非直接抢同一块数据',
    nodes: [
      { x: 35, y: 60, w: 145, h: 58, label: '生产者线程', sub: 'tx.send(msg)', tone: 'blue' },
      { x: 265, y: 60, w: 150, h: 58, label: 'channel 队列', sub: 'mpsc', tone: 'orange' },
      { x: 495, y: 60, w: 145, h: 58, label: '消费者线程', sub: 'rx.recv()', tone: 'green' },
    ],
    arrows: [{ x1: 180, y1: 89, x2: 265, y2: 89, label: 'send' }, { x1: 415, y1: 89, x2: 495, y2: 89, label: 'recv' }],
  },
  async: {
    h: 215,
    caption: 'Future 本身什么都不做，交给 executor 轮询；遇到 IO 等待就让出线程',
    nodes: [
      { x: 30, y: 45, w: 160, h: 58, label: 'async fn', sub: '编译成状态机 Future', tone: 'purple' },
      { x: 255, y: 45, w: 160, h: 58, label: 'Executor（tokio）', sub: 'poll 轮询', tone: 'orange' },
      { x: 490, y: 45, w: 160, h: 58, label: 'Reactor / IO', sub: '事件就绪通知 Waker', tone: 'blue' },
      { x: 255, y: 140, w: 160, h: 48, label: 'Pending：让出线程', tone: 'gray' },
    ],
    arrows: [
      { x1: 190, y1: 74, x2: 255, y2: 74 }, { x1: 415, y1: 74, x2: 490, y2: 74 },
      { x1: 335, y1: 103, x2: 335, y2: 140 }, { x1: 490, y1: 88, x2: 415, y2: 160, label: 'wake' },
    ],
  },
  pipeline: {
    h: 185,
    caption: '把一个服务拆成协议 / 存储 / 服务三层，每层用 trait 解耦，才容易演进',
    nodes: [
      { x: 20, y: 55, w: 140, h: 58, label: '网络层', sub: 'Frame 编解码', tone: 'blue' },
      { x: 195, y: 55, w: 140, h: 58, label: 'Service 层', sub: 'CommandService', tone: 'purple' },
      { x: 370, y: 55, w: 140, h: 58, label: 'Storage 层', sub: 'trait 抽象', tone: 'orange' },
      { x: 545, y: 55, w: 115, h: 58, label: '存储引擎', sub: '内存 / 磁盘', tone: 'green' },
    ],
    arrows: [
      { x1: 160, y1: 84, x2: 195, y2: 84 }, { x1: 335, y1: 84, x2: 370, y2: 84 },
      { x1: 510, y1: 84, x2: 545, y2: 84 },
    ],
  },

  /* ---- 对照原始教材插图重绘的补充图：与正文知识点一一对应 ---- */
  'value-type': {
    h: 175,
    caption: '同一串二进制位，按什么类型解读，决定它占多少内存、能做哪些操作',
    nodes: [
      { x: 25, y: 55, w: 180, h: 62, label: '值', sub: '0100 0010', tone: 'blue' },
      { x: 250, y: 55, w: 180, h: 62, label: '类型', sub: 'i32 / char / bool', tone: 'purple' },
      { x: 475, y: 55, w: 180, h: 62, label: '解读结果', sub: '66 / B / true', tone: 'green' },
    ],
    arrows: [
      { x1: 205, y1: 86, x2: 250, y2: 86, label: '按类型读' },
      { x1: 430, y1: 86, x2: 475, y2: 86 },
    ],
  },
  'pointer-deref': {
    h: 205,
    caption: '& 取地址得到引用，* 顺着地址取回值；引用不拥有数据，原值仍可用',
    nodes: [
      { x: 20, y: 50, w: 145, h: 62, label: '变量 x', sub: '值 42', tone: 'blue' },
      { x: 190, y: 50, w: 145, h: 62, label: '地址', sub: '0x7ffd…', tone: 'gray' },
      { x: 360, y: 50, w: 145, h: 62, label: '引用 r', sub: '&x', tone: 'purple' },
      { x: 530, y: 50, w: 130, h: 62, label: '解引用', sub: '*r → 42', tone: 'green' },
    ],
    arrows: [
      { x1: 165, y1: 81, x2: 190, y2: 81 }, { x1: 335, y1: 81, x2: 360, y2: 81, label: '借用' },
      { x1: 505, y1: 81, x2: 530, y2: 81 },
    ],
  },
  'closure-capture': {
    h: 200,
    caption: '闭包把外围变量连同逻辑一起打包：捕获方式决定它实现 Fn / FnMut / FnOnce',
    nodes: [
      { x: 25, y: 48, w: 180, h: 62, label: '外围环境', sub: 'let factor = 3', tone: 'orange' },
      { x: 250, y: 48, w: 180, h: 62, label: '闭包', sub: '|x| x * factor', tone: 'purple' },
      { x: 475, y: 48, w: 180, h: 62, label: '调用结果', sub: 'multiply(7) = 21', tone: 'green' },
      { x: 250, y: 130, w: 180, h: 48, label: '捕获：借用 / 移动', tone: 'gray' },
    ],
    arrows: [
      { x1: 205, y1: 79, x2: 250, y2: 79, label: '捕获' },
      { x1: 430, y1: 79, x2: 475, y2: 79 },
      { x1: 115, y1: 110, x2: 250, y2: 154 },
    ],
  },
  vtable: {
    h: 215,
    caption: 'dyn Trait 是胖指针：数据指针指向值，虚表指针指向该类型的方法表',
    nodes: [
      { x: 25, y: 45, w: 180, h: 62, label: '具体值', sub: 'Vec<u8> / File', tone: 'blue' },
      { x: 250, y: 45, w: 180, h: 62, label: 'trait object', sub: '&dyn Write', tone: 'purple' },
      { x: 475, y: 45, w: 180, h: 62, label: '虚表 vtable', sub: 'write / flush', tone: 'orange' },
      { x: 250, y: 130, w: 405, h: 52, label: '运行期查表 → 动态分派到具体实现', tone: 'green' },
    ],
    arrows: [
      { x1: 205, y1: 76, x2: 250, y2: 76 }, { x1: 430, y1: 76, x2: 475, y2: 76 },
      { x1: 340, y1: 107, x2: 340, y2: 130 }, { x1: 565, y1: 107, x2: 565, y2: 130 },
    ],
  },
  monomorph: {
    h: 235,
    caption: '两条互斥的路径：泛型在编译期展开成多份专用代码；dyn Trait 只留一份代码、运行期查虚表',
    nodes: [
      { x: 20, y: 32, w: 150, h: 52, label: '泛型 + 单态化', sub: 'fn f<T: Trait>', tone: 'blue' },
      { x: 215, y: 18, w: 190, h: 44, label: 'f::<i32> 专用代码', tone: 'green' },
      { x: 215, y: 72, w: 190, h: 44, label: 'f::<String> 专用代码', tone: 'green' },
      { x: 450, y: 32, w: 205, h: 52, label: '编译期多份代码', sub: '零运行时开销', tone: 'green' },
      { x: 20, y: 140, w: 150, h: 52, label: 'dyn Trait', sub: '&dyn Trait', tone: 'purple' },
      { x: 215, y: 140, w: 190, h: 52, label: '一份通用代码', sub: '查虚表分发', tone: 'purple' },
      { x: 450, y: 140, w: 205, h: 52, label: '体积更小', sub: '有间接调用开销', tone: 'orange' },
    ],
    arrows: [
      { x1: 170, y1: 50, x2: 215, y2: 40 }, { x1: 170, y1: 66, x2: 215, y2: 94 },
      { x1: 405, y1: 40, x2: 450, y2: 50 },
      { x1: 170, y1: 166, x2: 215, y2: 166 }, { x1: 405, y1: 166, x2: 450, y2: 166 },
    ],
  },
  'concurrent-parallel': {
    h: 215,
    caption: '并发是「能同时处理多件事」的结构，并行是「真的在同一时刻一起跑」的手段',
    nodes: [
      { x: 20, y: 42, w: 130, h: 52, label: '单核', sub: '一个 CPU', tone: 'gray' },
      { x: 175, y: 30, w: 120, h: 44, label: '任务 A', tone: 'blue' },
      { x: 315, y: 30, w: 120, h: 44, label: '任务 B', tone: 'purple' },
      { x: 465, y: 30, w: 190, h: 44, label: '交替执行 = 并发', tone: 'orange' },
      { x: 20, y: 125, w: 130, h: 52, label: '双核', sub: '两个 CPU', tone: 'gray' },
      { x: 175, y: 118, w: 120, h: 44, label: '核心 1 → A', tone: 'blue' },
      { x: 315, y: 118, w: 120, h: 44, label: '核心 2 → B', tone: 'purple' },
      { x: 465, y: 118, w: 190, h: 44, label: '同时执行 = 并行', tone: 'green' },
    ],
    arrows: [
      { x1: 150, y1: 60, x2: 175, y2: 52 }, { x1: 295, y1: 52, x2: 315, y2: 52, label: '切换' },
      { x1: 435, y1: 52, x2: 465, y2: 52 },
      { x1: 150, y1: 148, x2: 175, y2: 140 }, { x1: 435, y1: 140, x2: 465, y2: 140 },
    ],
  },
  'io-latency': {
    h: 235,
    caption: '越往下越慢，且以数量级递增；面对慢 I/O，异步让出线程，同步则只能空等',
    nodes: [
      { x: 20, y: 26, w: 110, h: 46, label: 'CPU ≈ 1 ns', tone: 'green' },
      { x: 20, y: 78, w: 190, h: 46, label: '内存 ≈ 100 ns', tone: 'blue' },
      { x: 20, y: 130, w: 290, h: 46, label: 'SSD / 磁盘 ≈ 100 µs', tone: 'orange' },
      { x: 20, y: 182, w: 380, h: 46, label: '网络 I/O ≈ 10 ms', tone: 'red' },
      { x: 430, y: 45, w: 225, h: 62, label: '异步：让出线程', sub: '等待期间跑别的任务', tone: 'purple' },
      { x: 430, y: 135, w: 225, h: 62, label: '同步阻塞', sub: '线程空转，吞吐下降', tone: 'red' },
    ],
    arrows: [
      { x1: 400, y1: 190, x2: 430, y2: 96 },
      { x1: 400, y1: 212, x2: 430, y2: 170 },
    ],
  },
  'memory-align': {
    h: 225,
    caption: '编译器按对齐要求重排字段：同样的信息，填充字节更少、结构体更小',
    nodes: [
      { x: 20, y: 38, w: 70, h: 46, label: 'a: u8', tone: 'blue' },
      { x: 95, y: 38, w: 70, h: 46, label: 'padding', tone: 'gray' },
      { x: 170, y: 38, w: 110, h: 46, label: 'b: u16', tone: 'purple' },
      { x: 285, y: 38, w: 70, h: 46, label: 'c: u8', tone: 'blue' },
      { x: 360, y: 38, w: 70, h: 46, label: 'padding', tone: 'gray' },
      { x: 455, y: 38, w: 200, h: 46, label: '按声明顺序：6 字节', tone: 'red' },
      { x: 20, y: 128, w: 110, h: 46, label: 'b: u16', tone: 'purple' },
      { x: 135, y: 128, w: 70, h: 46, label: 'a: u8', tone: 'blue' },
      { x: 210, y: 128, w: 70, h: 46, label: 'c: u8', tone: 'blue' },
      { x: 305, y: 128, w: 350, h: 46, label: 'Rust 重排后：4 字节（无填充）', tone: 'green' },
    ],
    arrows: [{ x1: 340, y1: 84, x2: 340, y2: 128, label: '重排' }],
  },
  'enum-layout': {
    h: 205,
    caption: 'enum 用 tag 区分变体；编译器会利用空位做 niche 优化，让 Option 不多占空间',
    nodes: [
      { x: 20, y: 45, w: 195, h: 70, label: 'enum', sub: 'tag + payload', tone: 'blue' },
      { x: 240, y: 45, w: 195, h: 70, label: 'Option<T>', sub: 'Some / None', tone: 'purple' },
      { x: 460, y: 45, w: 195, h: 70, label: 'Result<T, E>', sub: 'Ok / Err', tone: 'orange' },
      { x: 20, y: 135, w: 635, h: 46, label: 'match 必须穷举所有变体，编译器替你检查遗漏', tone: 'green' },
    ],
    arrows: [
      { x1: 117, y1: 115, x2: 117, y2: 135 }, { x1: 557, y1: 115, x2: 557, y2: 135 },
    ],
  },
  'string-layout': {
    h: 235,
    caption: 'String 拥有堆缓冲区（指针/长度/容量），&str 只是指向其中一段的胖指针',
    nodes: [
      { x: 20, y: 40, w: 175, h: 70, label: '栈：String', sub: 'ptr / len / cap', tone: 'purple' },
      { x: 250, y: 40, w: 175, h: 70, label: '堆：字节', sub: '"hello" UTF-8', tone: 'orange' },
      { x: 480, y: 40, w: 175, h: 70, label: '栈：&str', sub: 'ptr / len', tone: 'blue' },
      { x: 20, y: 140, w: 635, h: 60, label: '&s 借用不复制数据；String::from 才分配新的堆内存', tone: 'green' },
    ],
    arrows: [
      { x1: 195, y1: 75, x2: 250, y2: 75, label: '指向' },
      { x1: 480, y1: 75, x2: 425, y2: 75, label: '借看' },
      { x1: 337, y1: 110, x2: 337, y2: 140 },
    ],
  },
  'slice-relation': {
    h: 200,
    caption: 'Vec<T> 拥有数据，&[T] 是数据视图；&Vec<T> 会自动解引用成 &[T]',
    nodes: [
      { x: 20, y: 45, w: 185, h: 65, label: 'Vec<T>', sub: '拥有堆上的元素', tone: 'purple' },
      { x: 245, y: 45, w: 185, h: 65, label: '&Vec<T>', sub: '对整个向量的借用', tone: 'blue' },
      { x: 470, y: 45, w: 185, h: 65, label: '&[T]', sub: '一段连续元素的视图', tone: 'green' },
      { x: 245, y: 135, w: 410, h: 44, label: '函数参数优先写 &[T]：能接更多调用方', tone: 'orange' },
    ],
    arrows: [
      { x1: 205, y1: 78, x2: 245, y2: 78, label: '借用' },
      { x1: 430, y1: 78, x2: 470, y2: 78, label: 'Deref' },
      { x1: 337, y1: 110, x2: 337, y2: 135 },
    ],
  },
  'vec-growth': {
    h: 205,
    caption: '容量够时直接追加；不够时重新分配更大的缓冲区，把旧元素搬过去再释放',
    nodes: [
      { x: 20, y: 45, w: 170, h: 65, label: 'len 4 / cap 4', sub: '缓冲区已满', tone: 'blue' },
      { x: 225, y: 45, w: 170, h: 65, label: 'push 第 5 个', sub: '容量不足', tone: 'orange' },
      { x: 430, y: 45, w: 225, h: 65, label: '分配 cap 8 + 搬移', sub: '旧缓冲区释放', tone: 'purple' },
      { x: 225, y: 135, w: 430, h: 44, label: '预先 Vec::with_capacity(n) 可避免反复扩容', tone: 'green' },
    ],
    arrows: [
      { x1: 190, y1: 78, x2: 225, y2: 78 }, { x1: 395, y1: 78, x2: 430, y2: 78 },
      { x1: 542, y1: 110, x2: 542, y2: 135 },
    ],
  },
  'arch-four': {
    h: 326,
    caption: '四层逐层收敛：上层决定系统怎么分块，下层约束日常怎么写代码',
    nodes: [
      { x: 40, y: 20, w: 600, h: 58, label: '① Structure · 架构风格', sub: '系统分成哪几块：分层 / 六边形 / 微服务 / 事件驱动', tone: 'blue' },
      { x: 70, y: 100, w: 540, h: 58, label: '② Characteristics · 质量属性', sub: '最在意什么：低延迟 / 可伸缩 / 可观测 / 可恢复', tone: 'purple' },
      { x: 100, y: 180, w: 480, h: 58, label: '③ Decisions · 硬性规则', sub: '哪些事不许破例：IO 必须走异步层；存储只通过 trait', tone: 'orange' },
      { x: 130, y: 260, w: 420, h: 58, label: '④ Design Principles · 设计原则', sub: '日常取舍的偏好：组合优先；错误必须带上下文', tone: 'green' },
    ],
    arrows: [
      { x1: 340, y1: 80, x2: 340, y2: 98 }, { x1: 340, y1: 160, x2: 340, y2: 178 },
      { x1: 340, y1: 240, x2: 340, y2: 258 },
    ],
  },
  'arch-metrics': {
    h: 220,
    caption: '质量属性不能全都要：先给系统排出优先级，再用类型系统与模块边界把规则固化',
    nodes: [
      { x: 255, y: 85, w: 170, h: 58, label: '系统目标', sub: '按场景取舍', tone: 'orange' },
      { x: 20, y: 35, w: 170, h: 44, label: '正确性', tone: 'green' },
      { x: 245, y: 25, w: 170, h: 44, label: '性能 / P99', tone: 'blue' },
      { x: 490, y: 35, w: 170, h: 44, label: '可观测', tone: 'purple' },
      { x: 20, y: 150, w: 170, h: 44, label: '安全 / 依赖治理', tone: 'red' },
      { x: 245, y: 160, w: 170, h: 44, label: '可维护性', tone: 'green' },
      { x: 490, y: 150, w: 170, h: 44, label: '可恢复性', tone: 'blue' },
    ],
    arrows: [
      { x1: 190, y1: 70, x2: 255, y2: 95 }, { x1: 330, y1: 69, x2: 330, y2: 85 },
      { x1: 490, y1: 70, x2: 425, y2: 95 }, { x1: 190, y1: 165, x2: 255, y2: 130 },
      { x1: 330, y1: 160, x2: 330, y2: 143 }, { x1: 490, y1: 165, x2: 425, y2: 130 },
    ],
  },
  'wasm-memory': {
    h: 225,
    caption: 'JS 与 WASM 各有自己的内存：传大数组要拷进去，结果要再拷回来，这是主要隐藏成本',
    nodes: [
      { x: 20, y: 45, w: 140, h: 62, label: 'JS 堆', sub: 'Uint8Array', tone: 'blue' },
      { x: 190, y: 45, w: 130, h: 62, label: '拷贝 ①', sub: '进线性内存', tone: 'orange' },
      { x: 350, y: 45, w: 140, h: 62, label: 'Rust 计算', sub: '逐像素处理', tone: 'purple' },
      { x: 520, y: 45, w: 135, h: 62, label: '拷贝 ②', sub: '写回 JS 堆', tone: 'red' },
      { x: 190, y: 135, w: 465, h: 54, label: '优化方向：数据常驻 WASM 侧 · 批量调用 · 只回传标量', tone: 'green' },
    ],
    arrows: [
      { x1: 160, y1: 76, x2: 190, y2: 76 }, { x1: 320, y1: 76, x2: 350, y2: 76 },
      { x1: 490, y1: 76, x2: 520, y2: 76 }, { x1: 587, y1: 107, x2: 587, y2: 135 },
    ],
  },
  'state-machine': {
    h: 205,
    caption: 'async fn 被编译成状态机：遇到未就绪的 I/O 就 Pending 让出线程，就绪后由 Waker 唤醒',
    nodes: [
      { x: 20, y: 45, w: 145, h: 62, label: 'Start', sub: '开始执行', tone: 'blue' },
      { x: 195, y: 45, w: 145, h: 62, label: 'Await I/O', sub: '发起异步读', tone: 'purple' },
      { x: 370, y: 45, w: 145, h: 62, label: 'Pending', sub: '让出线程', tone: 'orange' },
      { x: 545, y: 45, w: 115, h: 62, label: 'Done', sub: '返回结果', tone: 'green' },
      { x: 195, y: 135, w: 320, h: 44, label: 'Waker.wake() → executor 再次 poll', tone: 'gray' },
    ],
    arrows: [
      { x1: 165, y1: 76, x2: 195, y2: 76 }, { x1: 340, y1: 76, x2: 370, y2: 76 },
      { x1: 515, y1: 76, x2: 545, y2: 76 },
      { x1: 442, y1: 107, x2: 442, y2: 135, label: '就绪' },
      { x1: 195, y1: 157, x2: 165, y2: 100 },
    ],
  },
}

const props = defineProps<{
  type?: string
  title?: string
  labels?: string
  caption?: string
}>()
const uid = useId().replace(/:/g, '')
const diagram = computed<Diagram>(() => {
  const base = D[props.type || 'stack-heap'] || D['stack-heap']
  if (!props.labels && !props.caption) return base
  let nodes = base.nodes
  if (props.labels) {
    const parts = props.labels.split('|').map((s) => s.trim())
    nodes = base.nodes.map((n, i) => {
      const raw = parts[i]
      if (!raw) return n
      const [label, sub] = raw.split('::').map((s) => s.trim())
      return { ...n, label, sub: sub || n.sub }
    })
  }
  return { ...base, nodes, caption: props.caption ?? base.caption }
})
/* 放大查看：滚轮无极缩放（以指针为锚点）+ 拖拽平移画布。
   画布使用固定的 680px 逻辑宽度（与 SVG viewBox 一致），缩放/平移全部由 transform 承担，
   这样窗口尺寸变化不会改变内容本身的坐标系，锚点缩放的计算也始终稳定。 */
const zoomOpen = ref(false)
const scale = ref(1)      // 绝对倍率：1 = 680px 逻辑宽度按 1:1 渲染
const fitScale = ref(1)   // 「适应窗口」倍率，同时作为缩放上下限与百分比的基准
const panX = ref(0)
const panY = ref(0)
const dragging = ref(false)
const viewport = ref<HTMLElement | null>(null)
const BASE_W = 680
const PAD = 28            // 画布四周留白
const MIN_RATIO = 0.4     // 相对适应窗口：最小缩到 40%
const MAX_RATIO = 8       // 相对适应窗口：最大放到 800%
const zoomLevel = computed(() => Math.round(scale.value / (fitScale.value || 1) * 100))
let prevOverflow = ''

const canvasStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

/** 按视口与图的原始比例算出「整图完整可见」的倍率，并把画布居中。 */
function fitView() {
  const el = viewport.value
  if (!el) return
  const vw = el.clientWidth
  const vh = el.clientHeight
  const h = diagram.value.h || 200
  // 窄屏按宽度适配，固定 28px 留白会占掉太多，缩到视口的 3% 保证弹层里的图不小于正文
  const pad = Math.min(PAD, vw * 0.03)
  const s = Math.max(0.05, Math.min((vw - pad * 2) / BASE_W, (vh - pad * 2) / h))
  fitScale.value = s
  scale.value = s
  panX.value = (vw - BASE_W * s) / 2
  panY.value = (vh - h * s) / 2
}

/** 窗口尺寸变化时保持用户当前的相对倍率，只重算适配基准，不把画面突然打回 100%。 */
function onResize() {
  if (!zoomOpen.value) return
  const el = viewport.value
  if (!el) return
  const ratio = scale.value / (fitScale.value || 1)
  fitView()
  if (Math.abs(ratio - 1) > 0.001) {
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, ratio)
  }
}

function openZoom() {
  if (zoomOpen.value) return
  zoomOpen.value = true
  prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  // 等 flex 布局稳定后再算垂直居中，避免首帧 clientHeight 还没定下
  nextTick(() => requestAnimationFrame(() => requestAnimationFrame(fitView)))
}
function closeZoom() {
  if (!zoomOpen.value) return
  zoomOpen.value = false
  dragging.value = false
  pointers.clear()
  document.body.style.overflow = prevOverflow
  prevOverflow = ''
}

/** 以 (clientX, clientY) 为锚点缩放：锚点下的内容保持在原位置。 */
function zoomAt(clientX: number, clientY: number, factor: number) {
  const el = viewport.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const mx = clientX - rect.left
  const my = clientY - rect.top
  const cx = (mx - panX.value) / scale.value
  const cy = (my - panY.value) / scale.value
  const min = fitScale.value * MIN_RATIO
  const max = fitScale.value * MAX_RATIO
  const next = Math.min(max, Math.max(min, scale.value * factor))
  if (Math.abs(next - scale.value) < 0.0001) return
  scale.value = next
  panX.value = mx - cx * next
  panY.value = my - cy * next
}

function onWheel(e: WheelEvent) {
  // deltaY 越大缩得越多，用指数换算成连续倍率，触屏板的细小滚动也能平滑响应
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015))
}
function zoomByStep(factor: number) {
  const el = viewport.value
  if (!el) return
  const r = el.getBoundingClientRect()
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
}
function onDblClick() { fitView() }

/** 单指拖拽平移；双指捏合缩放（touch-action:none 会禁用浏览器原生缩放，必须自己实现）。 */
interface Pointer { id: number; x: number; y: number }
const pointers = new Map<number, Pointer>()
let dragStart = { x: 0, y: 0, px: 0, py: 0, id: -1 }
let pinchStart = { dist: 1, mx: 0, my: 0 }

function startDrag(p: Pointer) {
  dragStart = { x: p.x, y: p.y, px: panX.value, py: panY.value, id: p.id }
}
function pinchState() {
  const [a, b] = [...pointers.values()]
  return {
    dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
  }
}
function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) } catch { /* 非活跃指针时忽略 */ }
  pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
  if (pointers.size === 1) {
    dragging.value = true
    startDrag([...pointers.values()][0])
  } else if (pointers.size === 2) {
    dragging.value = false
    pinchStart = pinchState()
  }
}
function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
  if (pointers.size >= 2) {
    const now = pinchState()
    zoomAt(now.mx, now.my, now.dist / pinchStart.dist)
    // 捏合的同时两指整体移动，也要跟着平移，观感才跟手
    panX.value += now.mx - pinchStart.mx
    panY.value += now.my - pinchStart.my
    pinchStart = now
    return
  }
  if (!dragging.value || e.pointerId !== dragStart.id) return
  panX.value = dragStart.px + (e.clientX - dragStart.x)
  panY.value = dragStart.py + (e.clientY - dragStart.y)
}
function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  const rest = [...pointers.values()]
  if (rest.length === 1) {
    // 双指变成单指时无缝接着拖，避免画面跳一下
    dragging.value = true
    startDrag(rest[0])
  } else if (rest.length === 0) {
    dragging.value = false
    dragStart.id = -1
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!zoomOpen.value) return
  if (e.key === 'Escape') closeZoom()
  else if (e.key === '+' || e.key === '=') zoomByStep(1.2)
  else if (e.key === '-' || e.key === '_') zoomByStep(1 / 1.2)
  else if (e.key === '0') fitView()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  if (zoomOpen.value) document.body.style.overflow = prevOverflow
})
</script>

<template>
  <figure class="rb-figure">
    <div class="rb-fig-head">
      <div v-if="title" class="rb-eyebrow">{{ title }}</div>
      <span v-else />
      <button class="rb-zoom-btn" type="button" :aria-label="`放大查看：${title || '概念图'}`" @click="openZoom">
        ⤢ 放大查看
      </button>
    </div>

    <div class="rb-fig-frame" role="button" tabindex="0"
      :aria-label="`点击放大查看：${title || '概念图'}`"
      @click="openZoom" @keydown.enter.prevent="openZoom" @keydown.space.prevent="openZoom">
      <ConceptDiagramSvg :diagram="diagram" :uid="uid" />
    </div>

    <figcaption v-if="diagram.caption" class="rb-fig-caption">{{ diagram.caption }}</figcaption>

    <Teleport to="body">
      <div v-if="zoomOpen" class="rb-lightbox" role="dialog" aria-modal="true"
        :aria-label="title || '放大查看概念图'" @click.self="closeZoom">
        <div class="rb-lightbox-panel">
          <div class="rb-lightbox-head">
            <b>{{ title || '概念图' }}</b>
            <div class="rb-lightbox-actions">
              <button class="rb-btn ghost" type="button" aria-label="缩小" @click="zoomByStep(1 / 1.2)">−</button>
              <span class="rb-zoom-level" aria-live="polite">{{ zoomLevel }}%</span>
              <button class="rb-btn ghost" type="button" aria-label="放大" @click="zoomByStep(1.2)">＋</button>
              <button class="rb-btn ghost" type="button" @click="fitView">适应窗口</button>
              <button class="rb-btn ghost" type="button" aria-label="关闭放大" @click="closeZoom">✕ 关闭</button>
            </div>
          </div>
          <div ref="viewport" class="rb-lightbox-body" :class="{ dragging }"
            @wheel.prevent="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove"
            @pointerup="onPointerUp" @pointercancel="onPointerUp" @dblclick="onDblClick">
            <div class="rb-zoom-canvas" :style="canvasStyle">
              <ConceptDiagramSvg :diagram="diagram" :uid="uid + '-zoom'" />
            </div>
          </div>
          <div class="rb-lightbox-foot">
            <span v-if="diagram.caption">{{ diagram.caption }} · </span>100% 为适应窗口 · 滚轮 / 双指捏合缩放 · 拖拽平移 · 双击或 0 键复位 · ESC 关闭
          </div>
        </div>
      </div>
    </Teleport>
  </figure>
</template>
