import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vitepress'
import './custom.css'

import HomePage from '../components/HomePage.vue'
import PathMap from '../components/PathMap.vue'
import ScenarioMatrix from '../components/ScenarioMatrix.vue'
import ProgressTracker from '../components/ProgressTracker.vue'
import Quiz from '../components/Quiz.vue'
import Predict from '../components/Predict.vue'
import FillBlank from '../components/FillBlank.vue'
import StepBox from '../components/StepBox.vue'
import OwnershipLab from '../components/OwnershipLab.vue'
import Compare from '../components/Compare.vue'
import Callout from '../components/Callout.vue'
import Term from '../components/Term.vue'
import Exercise from '../components/Exercise.vue'
import ConceptDiagram from '../components/ConceptDiagram.vue'
import StageHeader from '../components/StageHeader.vue'
import CheckList from '../components/CheckList.vue'
import CodeTabs from '../components/CodeTabs.vue'

const components: Record<string, any> = {
  HomePage, PathMap, ScenarioMatrix, ProgressTracker, Quiz, Predict, FillBlank,
  StepBox, OwnershipLab, Compare, Callout, Term, Exercise, ConceptDiagram,
  StageHeader, CheckList, CodeTabs,
}

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>'
const COPY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.5H3.6A1.6 1.6 0 0 0 2 5.1v6.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
const CHECK_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** shiki 把每行包在 .line 里，直接取 textContent 会丢掉换行符 */
function sourceOf(code: HTMLElement): string {
  const lines = code.querySelectorAll<HTMLElement>('.line')
  const text = lines.length
    ? Array.from(lines).map((l) => l.textContent || '').join('\n')
    : code.textContent || ''
  return text.replace(/\u200b/g, '').trim()
}

/** 给所有代码块加统一工具条：语言标签 + 在线运行(仅 Rust) + 复制 */
function enhanceCodeBlocks() {
  if (typeof document === 'undefined') return
  const blocks = document.querySelectorAll<HTMLElement>('.vp-doc div[class*="language-"]')
  blocks.forEach((block) => {
    if (block.classList.contains('rb-enhanced')) return
    const pre = block.querySelector('pre')
    const code = block.querySelector('code')
    if (!pre || !code) return
    block.classList.add('rb-enhanced')

    const m = block.className.match(/language-([a-z0-9+#-]+)/i)
    const lang = (m?.[1] || 'text').toLowerCase()

    const bar = document.createElement('div')
    bar.className = 'rb-codebar'

    const tag = document.createElement('span')
    tag.className = 'rb-codebar-lang'
    tag.textContent = lang.toUpperCase()

    const actions = document.createElement('div')
    actions.className = 'rb-codebar-actions'

    if (lang === 'rust') {
      const run = document.createElement('button')
      run.className = 'rb-run'
      run.type = 'button'
      run.innerHTML = PLAY_ICON + '<span>在线运行</span>'
      run.title = '在 Rust Playground 中打开（需要可编译的完整示例）'
      run.setAttribute('aria-label', '在 Rust Playground 中运行这段代码')
      run.addEventListener('click', () => {
        const url = 'https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&code=' +
          encodeURIComponent(sourceOf(code))
        window.open(url, '_blank', 'noopener,noreferrer')
      })
      actions.append(run)
    }

    const copy = document.createElement('button')
    copy.className = 'rb-copy'
    copy.type = 'button'
    copy.innerHTML = COPY_ICON
    copy.title = '复制代码'
    copy.setAttribute('aria-label', '复制代码')
    let restore: ReturnType<typeof setTimeout> | undefined
    copy.addEventListener('click', async () => {
      const text = sourceOf(code)
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        try { document.execCommand('copy') } catch { /* ignore */ }
        ta.remove()
      }
      copy.classList.add('done')
      copy.innerHTML = CHECK_ICON
      copy.title = '已复制'
      if (restore) clearTimeout(restore)
      restore = setTimeout(() => {
        copy.classList.remove('done')
        copy.innerHTML = COPY_ICON
        copy.title = '复制代码'
      }, 1600)
    })
    actions.append(copy)

    bar.append(tag, actions)
    block.insertBefore(bar, block.firstChild)
  })
}

/** 按「视觉宽度」估算单元格文本长度：中文/全角算 2，其余算 1。 */
function visualWidth(s: string): number {
  let w = 0
  for (const ch of s) w += /[\u2e80-\uffef]/u.test(ch) ? 2 : 1
  return w
}

/**
 * 表格列宽优化：内容本来就少的列（编号、标签、星级、状态等）保持不换行，
 * 把换行压力交给内容多的列。VitePress 的 auto 布局会优先满足 nowrap 列的
 * 最小宽度，再把剩余空间分给其它列，无需给每张表手写 colgroup。
 */
function optimizeTables() {
  const tables = document.querySelectorAll<HTMLTableElement>('.vp-doc table')
  tables.forEach((table) => {
    if (table.dataset.rbTableOptimized) return
    table.dataset.rbTableOptimized = '1'
    // 目录讲次表、场景徽章表等已有 fixed + 精确列宽，交给 CSS 处理
    if (getComputedStyle(table).tableLayout === 'fixed') return

    const rows = Array.from(table.querySelectorAll('tr'))
    const colCount = rows.reduce((n, r) => Math.max(n, r.children.length), 0)
    if (colCount < 2) return

    const widths = new Array<number>(colCount).fill(0)
    for (const row of rows) {
      for (let i = 0; i < row.children.length; i++) {
        const text = (row.children[i].textContent || '').trim()
        widths[i] = Math.max(widths[i], visualWidth(text))
      }
    }
    const longest = Math.max(...widths)
    // 只标注「自身内容短」且「不是最长列」的列；始终保留至少一列可换行，
    // 避免整张表都 nowrap 而撑出容器。
    const short = widths.map((w) => w <= 20 && w < longest)
    if (!short.some(Boolean)) return

    for (const row of rows) {
      for (let i = 0; i < row.children.length; i++) {
        if (short[i]) (row.children[i] as HTMLElement).classList.add('rb-nowrap')
      }
    }
  })
}

let timer: ReturnType<typeof setTimeout> | undefined

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    for (const [name, comp] of Object.entries(components)) {
      app.component(name, comp)
    }
  },
  setup() {
    const router = useRouter()
    const run = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        enhanceCodeBlocks()
        optimizeTables()
      }, 120)
    }
    onMounted(() => {
      run()
      router.onAfterRouteChanged = run
    })
    onUnmounted(() => {
      router.onAfterRouteChanged = undefined
    })
  },
} satisfies Theme
