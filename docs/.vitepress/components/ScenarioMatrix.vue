<script setup lang="ts">
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'

interface Row { cat: string; name: string; desc: string; level: number; prereq: string; link: string }
const rows: Row[] = [
  { cat: '命令行工具', name: '39 猜数字游戏', desc: '标准库 rand + loop + 输入解析，第一个能玩的程序', level: 1, prereq: 'L2 语法', link: '/projects/guess-number' },
  { cat: '命令行工具', name: '40 mini-grep 文件搜索', desc: '参数解析、读文件、错误处理，命令行工具的标准骨架', level: 2, prereq: 'L2 + L3 错误处理', link: '/projects/mini-grep' },
  { cat: '命令行工具', name: '41 网页抓取转 Markdown', desc: '第一次用外部 crate：reqwest + html2md', level: 2, prereq: 'L2 Cargo', link: '/projects/scrape-url' },
  { cat: '命令行工具', name: '42 待办清单（serde 持久化）', desc: 'struct + JSON 序列化 + 文件读写，数据能存下来', level: 3, prereq: 'L3 结构体 / Result', link: '/projects/todo-cli' },
  { cat: '命令行工具', name: 'CLI 工程化与集成测试', desc: '子命令、退出码、stdout/stderr 分离、assert_cmd 端到端测试', level: 3, prereq: '第 40 讲 mini-grep', link: '/projects/cli-engineering' },
  { cat: '网络服务', name: '44 图片服务器', desc: 'HTTP 服务、路由、缩略图、缓存，理解请求响应模型', level: 3, prereq: 'L3 + L4', link: '/projects/image-server' },
  { cat: '网络服务', name: 'KV 第 2 步 网络与协议帧', desc: '自定义 Frame、TcpListener、协议编解码', level: 4, prereq: 'L3 trait + L4', link: '/projects/kv/2-network' },
  { cat: '数据处理', name: '49 SQL / CSV 查询工具', desc: '一套 AST 适配多种数据源，体会「一鱼多吃」的抽象', level: 3, prereq: 'L3 enum / trait', link: '/projects/sql-data-tool' },
  { cat: '数据处理', name: '数据工程：sqlx / DataFusion', desc: '关系库事务与参数化查询、列式引擎 GROUP BY 与谓词下推', level: 4, prereq: '第 49 讲 + L3 错误处理', link: '/projects/data-engineering' },
  { cat: '并发系统', name: '51 手写 MPSC channel', desc: '用 Mutex + Condvar 从零实现多生产者单消费者队列', level: 4, prereq: 'L4 并发', link: '/projects/mpsc-channel' },
  { cat: '并发系统', name: 'Actor 模型与任务分发', desc: '私有状态 + mailbox、tell/ask、worker pool 与监督重启', level: 4, prereq: '第 51 讲 + L4 并发', link: '/projects/actor' },
  { cat: '并发系统', name: 'KV 第 3 步 TLS 与异步', desc: 'x509 证书、TLS 加密、Future 与 tokio 异步 IO', level: 4, prereq: 'L4 异步', link: '/projects/kv/3-async' },
  { cat: '网络服务', name: '网络编程进阶', desc: '连接注册表、有界发件箱背压、心跳超时与优雅关闭', level: 4, prereq: 'KV 第 2 步 + L4 异步', link: '/projects/network-advanced' },
  { cat: '跨语言 / 底层', name: '54 PyO3 写 Python 扩展', desc: '把 Rust struct 变成 Python 类，给 Python 加速', level: 4, prereq: 'L3 + FFI 概念', link: '/projects/pyo3' },
  { cat: '跨语言 / 底层', name: 'unsafe Rust 与 FFI', desc: '裸指针、extern C、repr(C) 与 CString，把 unsafe 收进安全封装', level: 5, prereq: 'L3 + 第 54 讲 PyO3', link: '/projects/ffi' },
  { cat: '架构与生产化', name: 'KV 第 1 步 内存版与 trait 抽象', desc: 'CommandService / Storage 两个 trait 撑起整个系统', level: 3, prereq: 'L3 trait', link: '/projects/kv/1-memory' },
  { cat: '架构与生产化', name: 'KV 第 4 步 重构与 Pub/Sub', desc: 'yamux 多路复用 + 事件通知，学会做「大重构」', level: 5, prereq: 'KV 第 1–3 步', link: '/projects/kv/4-refactor' },
  { cat: '架构与生产化', name: 'KV 第 5 步 生产化', desc: '配置、集成测试、性能压测、指标监控、CI/CD', level: 5, prereq: 'KV 第 4 步', link: '/projects/kv/5-production' },
  { cat: '架构与生产化', name: '57 软件架构、生态与持续精进', desc: '代码仓库、文档、特性管理、架构风格与设计原则', level: 5, prereq: '全部阶段', link: '/projects/production' },
  { cat: '前端与桌面', name: '场景总览：五条路径怎么选', desc: 'WASM / Rust SPA / Tauri / Node 插件 / 全栈同构的选型对比', level: 2, prereq: '无（先看这张地图）', link: '/projects/frontend/' },
  { cat: '前端与桌面', name: '58/59 WASM 工具链与前端加速', desc: 'wasm-bindgen + wasm-pack，Rust 计算模块给 JS 调用，含线性内存边界与性能对比', level: 3, prereq: 'L3 + 基础 JS', link: '/projects/frontend/wasm' },
  { cat: '前端与桌面', name: '60 Leptos 写前端 SPA', desc: '纯 Rust 组件与响应式信号，CSR / SSR / 水合', level: 4, prereq: 'L3 trait + 组件思维', link: '/projects/frontend/leptos' },
  { cat: '前端与桌面', name: '61 Tauri 桌面应用', desc: 'Rust 命令 + WebView IPC，对比 Electron 的体积与启动', level: 4, prereq: 'L3 + 前端基础', link: '/projects/frontend/tauri' },
  { cat: '前端与桌面', name: '62 Node 原生插件', desc: 'napi-rs 写 Node addon，理解 SWC / Rspack 一类工具链', level: 5, prereq: 'L3 + FFI 概念', link: '/projects/frontend/node-addon' },
  { cat: '前端与桌面', name: '63 全栈类型共享', desc: 'ts-rs 从 Rust 生成 TS 类型，axum + 前端端到端类型安全', level: 4, prereq: 'L3 + 网络基础', link: '/projects/frontend/fullstack' },
  { cat: '云原生与边缘', name: '64 tonic gRPC 微服务', desc: 'protobuf 契约、四种流式 RPC、拦截器与优雅关闭', level: 4, prereq: 'L3 + L4 异步', link: '/projects/grpc' },
  { cat: '云原生与边缘', name: '65 边缘与 Serverless', desc: 'WASI、冷启动、边缘 WASM 函数部署', level: 4, prereq: 'L4 + WASM 基础', link: '/projects/edge' },
  { cat: '嵌入式与图形', name: '66 嵌入式与图形', desc: 'no_std 交叉编译与 HAL；wgpu 渲染管线、Bevy ECS', level: 5, prereq: 'L3 + 系统基础', link: '/projects/embedded' },
]
const cats = [
  '全部', '命令行工具', '网络服务', '数据处理', '并发系统', '跨语言 / 底层',
  '架构与生产化', '前端与桌面', '云原生与边缘', '嵌入式与图形',
]
const active = ref('全部')
const shown = computed(() => active.value === '全部' ? rows : rows.filter(r => r.cat === active.value))
function badge(l: number) { return 'l' + Math.min(5, Math.max(1, l)) }
function stars(l: number) { return '★'.repeat(l) + '☆'.repeat(5 - l) }
</script>

<template>
  <div>
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:1rem">
      <button v-for="c in cats" :key="c" class="rb-btn ghost"
        :style="{fontSize:'12px',padding:'5px 11px',borderColor: active===c ? 'var(--rb-orange)':'var(--rb-line)', color: active===c ? 'var(--rb-orange)':'var(--rb-ink)', background: active===c ? 'var(--rb-orange-soft)':'transparent'}"
        @click="active = c">{{ c }}</button>
    </div>
    <div style="overflow:hidden;border:1px solid var(--rb-line);border-radius:12px;box-shadow:var(--rb-shadow)">
      <table class="rb-matrix" style="margin:0;width:100%">
        <colgroup>
          <col style="width:14%" /><col style="width:20%" /><col style="width:40%" />
          <col style="width:11%" /><col style="width:15%" />
        </colgroup>
        <thead><tr><th>场景分类</th><th>项目</th><th>你会练到什么</th><th>难度</th><th>建议前置</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in shown" :key="i">
            <td><span class="rb-badge" :class="badge(r.level)">{{ r.cat }}</span></td>
            <td><a :href="withBase(r.link)" style="font-weight:700;text-decoration:none">{{ r.name }}</a></td>
            <td style="color:var(--rb-muted);line-height:1.65">{{ r.desc }}</td>
            <td class="rb-stars">{{ stars(r.level) }}</td>
            <td style="color:var(--rb-muted);font-size:12px">{{ r.prereq }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="rb-sub" style="margin-top:.6rem">
      组织逻辑：<b>先按工程场景归类，共 9 类</b>（命令行 / 网络 / 数据 / 并发 / 跨语言 / 生产化 / <b>前端与桌面</b> / 云原生与边缘 / 嵌入式与图形），<b>每类内部再按难度从 ★ 到 ★★★★★ 递进</b>；
      KV Server 是一条贯穿线，把 trait、网络、TLS、异步、重构、CI/CD 串成完整演进史。
      另有一条<b>宿主维度</b>：前六类跑在服务器或本机进程，前端与桌面跑在浏览器 / WebView，云原生跑在容器与边缘节点，嵌入式跑在裸机环境 —— 同一套 Rust 知识在不同宿主上要额外处理不同的边界问题。
    </div>
  </div>
</template>
