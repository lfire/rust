<script setup lang="ts">
import { withBase } from 'vitepress'

const stages = [
  { lv: 'L0 · 导学', name: '先跑起来', desc: '基础概念串讲、装环境、写下第一行代码，建立学习地图', link: '/guide/opening', color: '#868e96', meta: '3 讲 + 导览' },
  { lv: 'L1 · 编程地基', name: '补齐零基础', desc: '程序是什么、栈与堆、值和类型、指针与引用、函数与表达式 —— 不跳步', link: '/foundation/', color: '#2b8a3e', meta: '5 讲' },
  { lv: 'L2 · 语法入门', name: '写得出小程序', desc: '变量、字符串、函数、控制流、match、Cargo，边写边猜输出', link: '/basics/', color: '#1c7ed6', meta: '7 讲' },
  { lv: 'L3 · 核心机制', name: '跨过那道坎', desc: '所有权 / 借用 / 生命周期 / trait / 泛型 / 错误处理，配交互实验台', link: '/core/', color: '#7048e8', meta: '15 讲' },
  { lv: 'L4 · 并发异步', name: '写出高效程序', desc: '线程、共享状态、channel、Future 与 async', link: '/concurrency/', color: '#e8590c', meta: '8 讲' },
  { lv: 'L5 · 工程实战', name: '做成真东西', desc: '九类场景（含 Rust × 前端与桌面）+ 贯穿式 KV Server 五步演进', link: '/projects/', color: '#c92a2a', meta: '28 讲' },
]
</script>

<template>
  <div class="rb-path">
    <a v-for="(s, i) in stages" :key="i" class="rb-path-card" :href="withBase(s.link)" :style="{borderTop:'3px solid '+s.color}">
      <div class="lv" :style="{color:s.color}">{{ s.lv }} <span style="color:var(--rb-muted);font-weight:600">· {{ s.meta }}</span></div>
      <div class="nm">{{ s.name }}</div>
      <div class="ds">{{ s.desc }}</div>
      <div style="margin-top:.7rem;font-size:12px;font-weight:700" :style="{color:s.color}">进入阶段 →</div>
    </a>
  </div>
</template>
