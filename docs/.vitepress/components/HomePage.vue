<script setup lang="ts">
import { withBase } from 'vitepress'
import PathMap from './PathMap.vue'
import ScenarioMatrix from './ScenarioMatrix.vue'
import ProgressTracker from './ProgressTracker.vue'
import ConceptDiagram from './ConceptDiagram.vue'

const features = [
  { ico: '🧩', t: '一步一步，不跳步', d: '从「什么是变量」开始，而不是一上来就写 HTTP 客户端。每个新概念都先给直觉，再给术语。' },
  { ico: '🎯', t: '边读边答', d: '各讲穿插随堂检测、结果预测与代码填空。答错会立刻给出解释，而不是只判对错。' },
  { ico: '🔬', t: '看得见的所有权', d: '交互实验台逐语句演示栈、堆、Move、借用与作用域释放 —— Rust 最难的一关可以「看」着过。' },
  { ico: '▶️', t: '代码块一键运行', d: 'Rust 代码块都带一键运行，基础示例可直接送官方 Playground；带外部依赖的项目仍需在本地跑。' },
  { ico: '🏗️', t: '九类工程场景', d: '从命令行、网络、数据到 Rust × 前端、Tauri 桌面、WASM 边缘与嵌入式，类内由易到难，配贯穿式 KV Server。' },
  { ico: '📈', t: '自己的学习进度', d: '每节可打卡，首页自动汇总六个阶段的完成度，进度只保存在你的浏览器里。' },
]
const stats = [
  { n: '6', t: '递进阶段' }, { n: '66', t: '讲课程' },
  { n: '9', t: '类工程场景' }, { n: '28', t: '讲工程实战' },
]
</script>

<template>
  <div class="home">
    <section class="hp-hero">
      <span class="hp-kicker">从零开始 · 交互式中文教程</span>
      <h1>把 <em>Rust</em> 学成<br />你真正会用的语言</h1>
      <p>不假设你有任何系统编程基础。66 讲、六个递进阶段、随堂交互练习，以及九类工程场景（含 Rust × 前端与桌面） —— 从第一行 <code>println!</code> 走到一个生产级 KV 服务。</p>
      <div class="hp-actions">
        <a class="hp-btn main" :href="withBase('/guide/opening')">🚀 从第 01 讲开始</a>
        <a class="hp-btn alt" :href="withBase('/projects/')">🏗️ 直接看工程实战</a>
        <a class="hp-btn alt" :href="withBase('/guide/curriculum')">📖 66 讲完整目录</a>
      </div>
      <div class="hp-stats">
        <div class="hp-stat" v-for="(s, i) in stats" :key="i"><b>{{ s.n }}</b><span>{{ s.t }}</span></div>
      </div>
    </section>

    <section class="hp-section">
      <div class="hp-section-head">
        <div class="eyebrow">Why this course</div>
        <h2>为零基础重新设计的学习体验</h2>
        <p>原课程面向已有编程经验的开发者，开篇就写 HTTP 抓取工具。这套教程保留它的知识主线，但把地基补齐、把难点拆碎、把每个抽象都变成可以动手操作的实验。</p>
      </div>
      <div class="hp-grid">
        <div class="hp-feature" v-for="(f, i) in features" :key="i">
          <div class="ico">{{ f.ico }}</div><h4>{{ f.t }}</h4><p>{{ f.d }}</p>
        </div>
      </div>
    </section>

    <section class="hp-section" id="roadmap">
      <div class="hp-section-head">
        <div class="eyebrow">Learning path</div>
        <h2>六阶段递进路线</h2>
        <p>顺序经过精心设计：L0 先建立学习地图 → L1 补编程地基 → L2 学 Rust 语法 → L3 集中攻克所有权 → L4 并发与异步 → L5 进入工程实战。前一阶段的输出，正好是下一阶段的前置。</p>
      </div>
      <PathMap />
      <div style="margin-top:1rem">
        <ConceptDiagram type="cargo" title="先认识工具链：Cargo 会替你管理依赖与构建" />
      </div>
    </section>

    <section class="hp-section" id="scenarios">
      <div class="hp-section-head">
        <div class="eyebrow">Engineering scenarios</div>
        <h2>工程场景地图：分类 × 难度</h2>
        <p>不是零散的 demo 堆砌。九类场景覆盖服务端、浏览器 / WebView、容器与边缘、裸机四种宿主；每类内部从 ★ 走到 ★★★★★。其中 Rust × 前端与桌面是独立一类，含 WASM、Leptos、Tauri、Node 插件与全栈类型共享。点击分类标签可筛选。</p>
      </div>
      <ScenarioMatrix />
    </section>

    <section class="hp-section">
      <div class="hp-section-head">
        <div class="eyebrow">Your progress</div>
        <h2>学到哪了，一眼看得见</h2>
      </div>
      <ProgressTracker />
    </section>

    <section class="hp-cta">
      <h2>准备好写第一行 Rust 了吗？</h2>
      <p style="color:var(--rb-muted);font-size:14px;line-height:1.8;margin-bottom:1.3rem">先花 10 分钟装好环境，再跟着第 03 讲写下第一行 Rust 代码。</p>
      <a class="hp-btn main" style="background:var(--rb-orange)" :href="withBase('/guide/setup')">从装环境开始 →</a>
    </section>

    <div style="text-align:center;color:var(--rb-muted);font-size:12px;line-height:1.8;margin:2rem 0 .5rem">
      内容参考本地 <code>rust-coding/</code> 目录下的教学材料重新编撰 · 原始材料保持原样未改动<br />
      <a :href="withBase('/about/')" style="text-decoration:none">关于本站与内容来源说明 →</a>
    </div>
  </div>
</template>
