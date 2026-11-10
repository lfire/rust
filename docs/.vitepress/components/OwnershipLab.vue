<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Cell { name: string; value: string; state?: 'moved' | 'borrowed' | 'dropped' }
interface Step { line: string; stack: Cell[]; heap: Cell[]; log: string; err?: string }

const SCENES: Record<string, { label: string; desc: string; steps: Step[] }> = {
  move: {
    label: '1. 所有权移动 Move', desc: 'String 的数据在堆上，赋值会发生「移动」而不是复制',
    steps: [
      { line: 'fn main() {', stack: [], heap: [], log: '进入 main，栈帧创建。' },
      { line: '    let s1 = String::from("hello");', stack: [{ name: 's1', value: 'ptr | len=5 | cap=5' }], heap: [{ name: '0x01', value: '"hello"' }], log: 's1 拥有堆上的字符串。栈里只存 3 个机器字（指针/长度/容量）。' },
      { line: '    let s2 = s1;', stack: [{ name: 's1', value: '已失效', state: 'moved' }, { name: 's2', value: 'ptr | len=5 | cap=5' }], heap: [{ name: '0x01', value: '"hello"' }], log: '所有权从 s1 转移给 s2。注意：堆上的数据没有被复制，只是栈上的指针被搬走，s1 随即作废。' },
      { line: '    println!("{}", s2);', stack: [{ name: 's1', value: '已失效', state: 'moved' }, { name: 's2', value: 'ptr | len=5 | cap=5' }], heap: [{ name: '0x01', value: '"hello"' }], log: '使用 s2 没问题，输出 hello。' },
      { line: '    // println!("{}", s1); // 取消注释会报错', stack: [{ name: 's1', value: '已失效', state: 'moved' }, { name: 's2', value: 'ptr | len=5 | cap=5' }], heap: [{ name: '0x01', value: '"hello"' }], log: '如果还想用 s1，编译器会拒绝：borrow of moved value: `s1`。', err: 'error[E0382]: borrow of moved value: `s1`' },
      { line: '}', stack: [], heap: [], log: '离开作用域，s2 被 drop，堆内存自动释放。全程没有 GC，也没有手动 free。' },
    ],
  },
  copy: {
    label: '2. Copy 语义', desc: '固定大小、完全存在栈上的类型，赋值时按位复制',
    steps: [
      { line: 'fn main() {', stack: [], heap: [], log: '进入 main。' },
      { line: '    let x = 5;', stack: [{ name: 'x', value: '5' }], heap: [], log: 'i32 完全放在栈上，大小固定。' },
      { line: '    let y = x;', stack: [{ name: 'x', value: '5' }, { name: 'y', value: '5' }], heap: [], log: '因为复制代价极小且没有堆资源，Rust 直接按位复制一份，x 依然可用。' },
      { line: '    println!("{} {}", x, y);', stack: [{ name: 'x', value: '5' }, { name: 'y', value: '5' }], heap: [], log: '输出：5 5。实现了 Copy trait 的类型都这样：整数、浮点、bool、char、以及全由 Copy 组成的元组。' },
      { line: '}', stack: [], heap: [], log: '作用域结束，两个值一起出栈。' },
    ],
  },
  borrow: {
    label: '3. 只读借用', desc: '& 借用不抢走所有权，可以有任意多个只读借用',
    steps: [
      { line: 'fn main() {', stack: [], heap: [], log: '进入 main。' },
      { line: '    let s = String::from("rust");', stack: [{ name: 's', value: 'ptr | len=4' }], heap: [{ name: '0x02', value: '"rust"' }], log: 's 是所有者。' },
      { line: '    let len = calculate_length(&s);', stack: [{ name: 's', value: 'ptr | len=4' }, { name: '&s', value: '借用 → 0x02', state: 'borrowed' }], heap: [{ name: '0x02', value: '"rust"' }], log: '&s 创建一个引用：它指向同一个堆数据，但不拥有它，函数结束时引用消失，s 仍归原主人。' },
      { line: '    println!("{} {}", s, len);', stack: [{ name: 's', value: 'ptr | len=4' }], heap: [{ name: '0x02', value: '"rust"' }], log: 's 依然可用，输出 rust 4。' },
      { line: '}', stack: [], heap: [], log: '只有所有者 s 离开作用域时，堆数据才被释放。' },
    ],
  },
  mut: {
    label: '4. 借用规则冲突', desc: '同一时刻：任意多个 &T，或者恰好一个 &mut T，二者不可兼得',
    steps: [
      { line: 'fn main() {', stack: [], heap: [], log: '进入 main。' },
      { line: '    let mut s = String::from("hi");', stack: [{ name: 's', value: 'ptr | len=2' }], heap: [{ name: '0x03', value: '"hi"' }], log: '可变所有者 s。' },
      { line: '    let r1 = &s;', stack: [{ name: 's', value: 'ptr | len=2' }, { name: 'r1', value: '&s', state: 'borrowed' }], heap: [{ name: '0x03', value: '"hi"' }], log: '建立只读借用 r1。' },
      { line: '    let r2 = &mut s; // ❌', stack: [{ name: 's', value: 'ptr | len=2' }, { name: 'r1', value: '&s', state: 'borrowed' }, { name: 'r2', value: '&mut s ✗', state: 'moved' }], heap: [{ name: '0x03', value: '"hi"' }], log: '这里想要一个独占的可写借用，但只读借用 r1 还活着 —— 编译器直接拒绝。', err: 'error[E0502]: cannot borrow `s` as mutable because it is also borrowed as immutable' },
      { line: '    // println!("{}", r1);', stack: [{ name: 's', value: 'ptr | len=2' }, { name: 'r1', value: '&s', state: 'borrowed' }], heap: [{ name: '0x03', value: '"hi"' }], log: '这条规则从根上杜绝了「一边读一边被改」的数据竞争。让 r1 最后一次使用之后再创建 &mut s，就能通过。' },
      { line: '}', stack: [], heap: [], log: '作用域结束释放。' },
    ],
  },
  scope: {
    label: '5. 作用域与自动释放', desc: '值在离开作用域那一刻被 drop，不需要手动 free',
    steps: [
      { line: 'fn main() {', stack: [], heap: [], log: '进入 main 的外层作用域。' },
      { line: '    let outer = String::from("A");', stack: [{ name: 'outer', value: 'ptr → 0x04' }], heap: [{ name: '0x04', value: '"A"' }], log: 'outer 创建。' },
      { line: '    {', stack: [{ name: 'outer', value: 'ptr → 0x04' }], heap: [{ name: '0x04', value: '"A"' }], log: '进入内层块作用域。' },
      { line: '        let inner = String::from("B");', stack: [{ name: 'outer', value: 'ptr → 0x04' }, { name: 'inner', value: 'ptr → 0x05' }], heap: [{ name: '0x04', value: '"A"' }, { name: '0x05', value: '"B"' }], log: 'inner 创建，两个值同时存在。' },
      { line: '    } // inner 在这里被 drop', stack: [{ name: 'outer', value: 'ptr → 0x04' }], heap: [{ name: '0x04', value: '"A"' }], log: '内层块结束：inner 自动 drop，0x05 被回收；outer 不受影响。' },
      { line: '    println!("{}", outer);', stack: [{ name: 'outer', value: 'ptr → 0x04' }], heap: [{ name: '0x04', value: '"A"' }], log: '输出 A。' },
      { line: '} // outer 在这里被 drop', stack: [], heap: [], log: 'main 结束，outer 也被 drop。没有内存泄漏，也不需要 GC 停顿。' },
    ],
  },
}

const props = defineProps<{ scene?: string }>()
const current = ref(props.scene && SCENES[props.scene] ? props.scene : 'move')
const idx = ref(0)
const scene = computed(() => SCENES[current.value])
const step = computed(() => scene.value.steps[Math.min(idx.value, scene.value.steps.length - 1)])
function pick(k: string) { current.value = k; idx.value = 0 }
function next() { if (idx.value < scene.value.steps.length - 1) idx.value++ }
function prev() { if (idx.value > 0) idx.value-- }
watch(current, () => { idx.value = 0 })
</script>

<template>
  <div class="rb-card" style="padding:1rem">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem">
      <div>
        <div class="rb-eyebrow" style="color:var(--rb-purple)">交互实验台 · Ownership Lab</div>
        <div class="rb-title">一步一步看懂值是怎么被管理的</div>
      </div>
      <span class="rb-sub">{{ idx + 1 }} / {{ scene.steps.length }}</span>
    </div>
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin:.85rem 0 .5rem">
      <button v-for="(s, k) in SCENES" :key="k" class="rb-btn ghost"
        :style="{fontSize:'12px',padding:'5px 10px',borderColor: current===k ? 'var(--rb-orange)' : 'var(--rb-line)', color: current===k ? 'var(--rb-orange)' : 'var(--rb-ink)'} "
        @click="pick(String(k))">{{ s.label }}</button>
    </div>
    <div class="rb-sub" style="margin-bottom:.7rem">{{ scene.desc }}</div>
    <div class="rb-lab">
      <div class="rb-lab-head">
        <span style="font-size:12.5px;font-weight:700">当前执行到</span>
        <span style="font-family:var(--vp-font-family-mono);font-size:12px;color:var(--rb-orange)">{{ idx + 1 }} / {{ scene.steps.length }}</span>
      </div>
      <pre style="margin:0;padding:.85rem 1rem;background:var(--vp-code-block-bg);color:var(--vp-c-text-1);font-family:var(--vp-font-family-mono);font-size:12.8px;line-height:1.85;overflow-x:auto"><template v-for="(st, i) in scene.steps" :key="i"><span :style="{opacity: i <= idx ? 1 : .28, color: i === idx ? 'var(--rb-orange)' : 'inherit', fontWeight: i === idx ? 700 : 400}">{{ st.line }}</span>{{ '\n' }}</template></pre>
      <div class="rb-lab-canvas">
        <div class="rb-pane">
          <div class="rb-pane-title">栈 · Stack（变量）</div>
          <div v-if="!step.stack.length" class="rb-sub" style="font-size:12px">空</div>
          <div v-for="(c, i) in step.stack" :key="i" class="rb-cell" :class="c.state">
            <code>{{ c.name }}</code><span :class="{'rb-arrow': !c.state}">{{ c.value }}</span>
          </div>
        </div>
        <div class="rb-pane">
          <div class="rb-pane-title">堆 · Heap（数据）</div>
          <div v-if="!step.heap.length" class="rb-sub" style="font-size:12px">空</div>
          <div v-for="(c, i) in step.heap" :key="i" class="rb-cell" :class="c.state">
            <code>{{ c.name }}</code><span :class="{'rb-arrow': !c.state}">{{ c.value }}</span>
          </div>
        </div>
      </div>
      <div style="padding:0 1.1rem 1rem">
        <div class="rb-lab-log">{{ step.log }}</div>
        <div v-if="step.err" class="rb-feedback no" style="margin-top:.55rem;font-family:var(--vp-font-family-mono);font-size:12px">{{ step.err }}</div>
      </div>
    </div>
    <div class="q-foot" style="margin-top:.9rem;flex-wrap:wrap">
      <button class="rb-btn" :disabled="idx === 0" @click="prev">← 上一步</button>
      <button class="rb-btn primary" :disabled="idx >= scene.steps.length - 1" @click="next">执行下一步 →</button>
      <button class="rb-btn ghost" @click="idx = 0">从头看</button>
    </div>
  </div>
</template>
