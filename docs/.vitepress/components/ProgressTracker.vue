<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { LESSONS, STAGE_LABEL, STAGE_COLOR, readDone, type Stage } from '../utils'

const done = ref<string[]>([])
function sync() { done.value = readDone() }
onMounted(() => { sync(); window.addEventListener('rust-progress-change', sync) })
onUnmounted(() => { if (typeof window !== 'undefined') window.removeEventListener('rust-progress-change', sync) })

const stages: Stage[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']
const pct = computed(() => Math.round(done.value.length / LESSONS.length * 100))
function stat(s: Stage) {
  const all = LESSONS.filter(l => l.stage === s)
  const n = all.filter(l => done.value.includes(l.path)).length
  return { n, total: all.length, pct: Math.round(n / all.length * 100) }
}
function resetAll() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('rust-course-done-v1')
  window.dispatchEvent(new CustomEvent('rust-progress-change'))
}
</script>

<template>
  <div class="hp-progress">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap">
      <div>
        <div class="rb-eyebrow">我的学习进度</div>
        <div class="rb-title" style="margin-top:.2rem">已完成 {{ done.length }} / {{ LESSONS.length }} 节</div>
      </div>
      <b style="font-size:1.6rem;color:var(--rb-orange);letter-spacing:-.03em">{{ pct }}%</b>
    </div>
    <div class="hp-bar"><i :style="{ width: pct + '%' }"></i></div>
    <div style="display:grid;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:1rem">
      <div v-for="s in stages" :key="s">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:.25rem">
          <span style="font-weight:650">{{ STAGE_LABEL[s] }}</span>
          <span style="color:var(--rb-muted)">{{ stat(s).n }}/{{ stat(s).total }}</span>
        </div>
        <div style="height:5px;border-radius:99px;background:var(--rb-soft);overflow:hidden">
          <i :style="{display:'block',height:'100%',borderRadius:'99px',width:stat(s).pct+'%',background:STAGE_COLOR[s],transition:'width .4s ease'}"></i>
        </div>
      </div>
    </div>
    <div style="margin-top:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
      <span class="rb-sub">进度只保存在你自己的浏览器里，不会上传。</span>
      <button class="rb-btn ghost" style="font-size:12px;padding:4px 10px" @click="resetAll">清空进度</button>
    </div>
  </div>
</template>
