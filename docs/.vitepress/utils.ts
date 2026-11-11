/** 学习进度：全部保存在浏览器本地，SSR 安全 */
import { withBase } from 'vitepress'

export type Stage = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export interface Lesson { path: string; title: string; stage: Stage }

/**
 * 统计口径（已定稿，不再变更）：
 * - 66 讲 = 课程讲次口径，用于总目录、首页统计与阶段划分
 *   （L0 3 / L1 5 / L2 7 / L3 15 / L4 8 / L5 28）。
 * - LESSONS = 可打卡页面口径（76 项）：66 讲一讲一页，一个页面一条记录，
 *   另含阶段导览、场景总览、目录、练习页，以及 1 个不计入讲次的 L2 → L3 过渡页。
 * 66 讲与 76 项不相等，是因为后者额外计入了非讲次的导览与练习页。
 */
export const LESSONS: Lesson[] = [
  { path: '/guide/opening', title: '第 01 讲 开篇：基础概念串讲', stage: 'L0' },
  { path: '/guide/', title: '如何使用这套教程', stage: 'L0' },
  { path: '/guide/setup', title: '第 02 讲 装好你的 Rust 环境', stage: 'L0' },
  { path: '/guide/hello', title: '第 03 讲 第一行 Rust 代码', stage: 'L0' },
  { path: '/foundation/', title: '阶段一导览', stage: 'L1' },
  { path: '/foundation/memory', title: '第 05 讲 栈与堆', stage: 'L1' },
  { path: '/foundation/concepts', title: '第 04 讲 程序、数据、值与类型', stage: 'L1' },
  { path: '/foundation/pointers', title: '第 06 讲 指针、引用与地址', stage: 'L1' },
  { path: '/foundation/callables', title: '第 07 讲 函数、方法、闭包与表达式', stage: 'L1' },
  { path: '/foundation/why-rust', title: '第 08 讲 为什么学 Rust', stage: 'L1' },
  { path: '/basics/', title: '阶段二导览', stage: 'L2' },
  { path: '/basics/variables', title: '第 09 讲 变量、可变性与类型推导', stage: 'L2' },
  { path: '/basics/strings', title: '第 10 讲 字符串 &str 与 String', stage: 'L2' },
  { path: '/basics/functions', title: '第 11 讲 函数、语句与表达式', stage: 'L2' },
  { path: '/basics/control-flow', title: '第 12 讲 控制流 if / loop / while / for', stage: 'L2' },
  { path: '/basics/match-basics', title: '第 13 讲 match 与模式匹配入门', stage: 'L2' },
  { path: '/basics/cargo', title: '第 14 讲 Cargo 与项目结构', stage: 'L2' },
  { path: '/basics/capstone', title: '第 15 讲 阶段综合：成绩统计', stage: 'L2' },
  { path: '/basics/ownership-first-look', title: '阶段过渡 · 所有权初体验', stage: 'L2' },
  { path: '/core/', title: '阶段三导览', stage: 'L3' },
  { path: '/core/ownership', title: '第 16 讲 所有权三法则与 Move', stage: 'L3' },
  { path: '/core/copy-drop', title: '第 17 讲 Copy、Clone 与自动 drop', stage: 'L3' },
  { path: '/core/borrowing', title: '第 18 讲 借用与引用 &T', stage: 'L3' },
  { path: '/core/mutable-borrow', title: '第 19 讲 可变借用与借用规则', stage: 'L3' },
  { path: '/core/slices', title: '第 20 讲 切片 &str 与 &[T]', stage: 'L3' },
  { path: '/core/lifetime', title: '第 21 讲 生命周期直觉', stage: 'L3' },
  { path: '/core/lifetime-annotations', title: '第 22 讲 生命周期标注与省略规则', stage: 'L3' },
  { path: '/core/struct-enum', title: '第 23 讲 struct、impl 与方法', stage: 'L3' },
  { path: '/core/enums', title: '第 24 讲 enum、Option 与 Result', stage: 'L3' },
  { path: '/core/patterns', title: '第 25 讲 模式匹配进阶', stage: 'L3' },
  { path: '/core/collections', title: '第 26 讲 集合容器 Vec / HashMap', stage: 'L3' },
  { path: '/core/error-handling', title: '第 27 讲 错误处理', stage: 'L3' },
  { path: '/core/traits', title: '第 28 讲 Trait：定义与实现', stage: 'L3' },
  { path: '/core/generics', title: '第 29 讲 泛型与 trait bound', stage: 'L3' },
  { path: '/core/smart-pointers', title: '第 30 讲 上 · 智能指针', stage: 'L3' },
  { path: '/core/closures-iterators', title: '第 30 讲 下 · 闭包与迭代器', stage: 'L3' },
  { path: '/concurrency/', title: '阶段四导览', stage: 'L4' },
  { path: '/concurrency/send-sync', title: '第 31 讲 数据竞争与 Send/Sync', stage: 'L4' },
  { path: '/concurrency/threads', title: '第 32 讲 线程与 move 闭包', stage: 'L4' },
  { path: '/concurrency/shared-state', title: '第 33 讲 共享状态 Arc + Mutex', stage: 'L4' },
  { path: '/concurrency/atomics', title: '第 34 讲 Atomic、Condvar 与 RwLock', stage: 'L4' },
  { path: '/concurrency/channels', title: '第 35 讲 消息传递 Channel', stage: 'L4' },
  { path: '/concurrency/future-executor', title: '第 36 讲 Future 与 executor', stage: 'L4' },
  { path: '/concurrency/async', title: '第 37 讲 async/await、Waker 与 Pin', stage: 'L4' },
  { path: '/concurrency/async-io', title: '第 38 讲 异步 IO、Stream / Sink 与 tokio', stage: 'L4' },
  { path: '/projects/', title: '工程场景地图', stage: 'L5' },
  { path: '/projects/guess-number', title: '第 39 讲 猜数字游戏', stage: 'L5' },
  { path: '/projects/mini-grep', title: '第 40 讲 mini-grep', stage: 'L5' },
  { path: '/projects/scrape-url', title: '第 41 讲 网页抓取工具', stage: 'L5' },
  { path: '/projects/todo-cli', title: '第 42 讲 待办清单', stage: 'L5' },
  { path: '/projects/cli-engineering', title: '第 43 讲 CLI 工程化', stage: 'L5' },
  { path: '/projects/image-server', title: '第 44 讲 图片服务器', stage: 'L5' },
  { path: '/projects/sql-data-tool', title: '第 49 讲 SQL / CSV 工具', stage: 'L5' },
  { path: '/projects/data-engineering', title: '第 50 讲 数据工程', stage: 'L5' },
  { path: '/projects/mpsc-channel', title: '第 51 讲 手写 MPSC', stage: 'L5' },
  { path: '/projects/actor', title: '第 52 讲 Actor 模型', stage: 'L5' },
  { path: '/projects/ffi', title: '第 53 讲 unsafe 与 FFI', stage: 'L5' },
  { path: '/projects/kv/', title: 'KV Server 总览', stage: 'L5' },
  { path: '/projects/kv/1-memory', title: '第 45 讲 KV 第 1 步', stage: 'L5' },
  { path: '/projects/kv/2-network', title: '第 46 讲 KV 第 2 步', stage: 'L5' },
  { path: '/projects/kv/3-async', title: '第 47 讲 KV 第 3 步', stage: 'L5' },
  { path: '/projects/network-advanced', title: '第 48 讲 网络编程进阶', stage: 'L5' },
  { path: '/projects/kv/4-refactor', title: '第 55 讲 KV 第 4 步', stage: 'L5' },
  { path: '/projects/kv/5-production', title: '第 56 讲 KV 第 5 步', stage: 'L5' },
  { path: '/projects/pyo3', title: '第 54 讲 PyO3 扩展', stage: 'L5' },
  { path: '/projects/production', title: '第 57 讲 软件架构、生态与持续精进', stage: 'L5' },
  { path: '/projects/frontend/', title: 'Rust × 前端场景总览', stage: 'L5' },
  { path: '/projects/frontend/wasm', title: '第 58 讲 WASM 工具链', stage: 'L5' },
  { path: '/projects/frontend/wasm-practice', title: '第 59 讲 Rust 计算模块加速前端', stage: 'L5' },
  { path: '/projects/frontend/leptos', title: '第 60 讲 Leptos 前端 SPA', stage: 'L5' },
  { path: '/projects/frontend/tauri', title: '第 61 讲 Tauri 桌面应用', stage: 'L5' },
  { path: '/projects/frontend/node-addon', title: '第 62 讲 Node 原生插件', stage: 'L5' },
  { path: '/projects/frontend/fullstack', title: '第 63 讲 全栈类型共享', stage: 'L5' },
  { path: '/projects/grpc', title: '第 64 讲 tonic gRPC 微服务', stage: 'L5' },
  { path: '/projects/edge', title: '第 65 讲 边缘与 Serverless', stage: 'L5' },
  { path: '/projects/embedded', title: '第 66 讲 嵌入式与图形', stage: 'L5' },
]

export const STAGE_LABEL: Record<Stage, string> = {
  L0: '导学', L1: '编程地基', L2: 'Rust 语法', L3: '核心机制', L4: '并发异步', L5: '工程实战',
}
export const STAGE_COLOR: Record<Stage, string> = {
  L0: '#868e96', L1: '#2b8a3e', L2: '#1c7ed6', L3: '#7048e8', L4: '#e8590c', L5: '#c92a2a',
}

const KEY = 'rust-course-done-v1'
const CHECK_KEY = 'rust-course-checks-v1'

/**
 * useRoute().path 会带部署 base（如 /rust/guide/），而 LESSONS 里记的是 /guide/。
 * 统一归一化后再存储、比较，打卡才能正确计入进度；同时兼容旧数据。
 */
function basePrefix(): string {
  try {
    const b = withBase('/')
    return b === '/' ? '' : b.replace(/\/$/, '')
  } catch { return '' }
}

export function normPath(path: string): string {
  let p = String(path || '').replace(/\.html$/, '')
  const base = basePrefix()
  if (base && p.startsWith(base + '/')) p = p.slice(base.length)
  else if (base && p === base) p = '/'
  return p
}

export function readDone(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return (Array.isArray(raw) ? raw : []).map((p) => normPath(String(p)))
  } catch { return [] }
}

export function isDone(path: string) { return readDone().includes(normPath(path)) }

export function setDone(path: string, done: boolean) {
  if (typeof window === 'undefined') return
  const key = normPath(path)
  const cur = new Set(readDone())
  done ? cur.add(key) : cur.delete(key)
  localStorage.setItem(KEY, JSON.stringify([...cur]))
  window.dispatchEvent(new CustomEvent('rust-progress-change'))
}

export function readChecks(id: string): boolean[] {
  if (typeof window === 'undefined') return []
  try {
    const all = JSON.parse(localStorage.getItem(CHECK_KEY) || '{}')
    return all[id] || []
  } catch { return [] }
}

export function setChecks(id: string, arr: boolean[]) {
  if (typeof window === 'undefined') return
  let all: Record<string, boolean[]> = {}
  try { all = JSON.parse(localStorage.getItem(CHECK_KEY) || '{}') } catch { /* ignore */ }
  all[id] = arr
  localStorage.setItem(CHECK_KEY, JSON.stringify(all))
}
