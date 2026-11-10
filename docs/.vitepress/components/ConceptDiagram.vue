<script setup lang="ts">
import { computed, useId } from 'vue'

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
      { x: 65, y: 92, w: 200, h: 34, label: 'i32 / bool / f64  （固定大小）', tone: 'gray' },
      { x: 65, y: 136, w: 200, h: 34, label: 'String 的「指针/长度/容量」', tone: 'blue' },
      { x: 415, y: 92, w: 200, h: 34, label: '"Hello" 的真实字节', tone: 'orange' },
      { x: 415, y: 136, w: 200, h: 34, label: 'Vec<T> 的元素序列', tone: 'orange' },
    ],
    arrows: [{ x1: 265, y1: 153, x2: 415, y2: 110, label: '指向' }],
  },
  ownership: {
    h: 210,
    caption: '同一时刻，一个值只有一个所有者；所有者离开作用域，值自动释放',
    nodes: [
      { x: 30, y: 55, w: 170, h: 65, label: 'let s1 = String::from("hi")', sub: 's1 拥有值', tone: 'orange' },
      { x: 255, y: 55, w: 170, h: 65, label: 'let s2 = s1;', sub: '所有权移动 Move', tone: 'purple' },
      { x: 480, y: 55, w: 170, h: 65, label: 's2 拥有值', sub: 's1 失效', tone: 'green' },
    ],
    arrows: [{ x1: 200, y1: 87, x2: 255, y2: 87 }, { x1: 425, y1: 87, x2: 480, y2: 87 }],
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
    h: 190,
    caption: '引用不能比它指向的值活得更久',
    nodes: [
      { x: 50, y: 55, w: 250, h: 46, label: "let r;                  ─┐ r 的作用域", tone: 'purple' },
      { x: 50, y: 110, w: 250, h: 46, label: "  { let x = 5; r = &x; } ─┘ x 提前销毁", tone: 'red' },
      { x: 350, y: 55, w: 280, h: 100, label: '编译错误 E0597', sub: '`x` does not live long enough', tone: 'orange' },
    ],
    arrows: [{ x1: 300, y1: 133, x2: 350, y2: 105 }],
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
function tone(t?: string) { return TONES[t || 'gray'] || TONES.gray }
</script>

<template>
  <figure style="margin:1.5rem 0">
    <div v-if="title" class="rb-eyebrow" style="margin-bottom:.45rem">{{ title }}</div>
    <div style="border:1px solid var(--rb-line);border-radius:12px;background:var(--rb-surface);padding:1rem .6rem .3rem;box-shadow:var(--rb-shadow)">
      <svg :viewBox="`0 0 680 ${diagram.h}`" style="width:100%;height:auto;display:block" role="img">
        <defs>
          <marker :id="`ar-${uid}`" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <path d="M0 0 L9 4.5 L0 9 z" fill="var(--rb-muted)" />
          </marker>
        </defs>
        <g v-for="(a, i) in diagram.arrows" :key="'a' + i">
          <line :x1="a.x1" :y1="a.y1" :x2="a.x2" :y2="a.y2" stroke="var(--rb-muted)" stroke-width="1.6"
            stroke-dasharray="4 3" :marker-end="`url(#ar-${uid})`" />
          <text v-if="a.label" :x="(a.x1 + a.x2) / 2" :y="(a.y1 + a.y2) / 2 - 7"
            text-anchor="middle" font-size="11" fill="var(--rb-muted)">{{ a.label }}</text>
        </g>
        <g v-for="(n, i) in diagram.nodes" :key="'n' + i">
          <rect :x="n.x" :y="n.y" :width="n.w" :height="n.h" rx="9"
            :fill="tone(n.tone)" fill-opacity="0.08" :stroke="tone(n.tone)" stroke-width="1.4" />
          <text :x="n.x + 12" :y="n.y + (n.sub ? 23 : n.h / 2 + 5)" font-size="12.5" font-weight="650" fill="var(--rb-ink)">{{ n.label }}</text>
          <text v-if="n.sub" :x="n.x + 12" :y="n.y + 42" font-size="11" fill="var(--rb-muted)">{{ n.sub }}</text>
        </g>
      </svg>
    </div>
    <figcaption v-if="diagram.caption" style="font-size:12.5px;color:var(--rb-muted);text-align:center;margin-top:.55rem;line-height:1.7">
      {{ diagram.caption }}
    </figcaption>
  </figure>
</template>
