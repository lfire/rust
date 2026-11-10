---
title: 第 61 讲 · Tauri 桌面应用
description: 用 Rust 命令 + 系统 WebView 做一个本地笔记应用，理解 IPC、能力系统与和 Electron 的取舍。
---

<StageHeader stage="L5 · 第 61 讲" level="★★★★☆" time="85 分钟" goal="做出一个可打包的 Rust 桌面应用" prereq="L3 全部 + 基础前端 / Node" />

# 第 61 讲 · Tauri 桌面应用

**场景**：一个本地 Markdown 笔记工具。界面用 HTML/CSS/JS（WebView），文件读写、路径管理、搜索交给 Rust。这是 Rust 与前端结合最直观的形态：**前端负责好看，Rust 负责可信**。

## 为什么不是 Electron

| 维度 | Electron | Tauri |
| --- | --- | --- |
| 渲染层 | 内嵌一份 Chromium | 复用**系统 WebView**（Windows WebView2 / macOS WKWebView / Linux WebKitGTK） |
| 安装包体积 | 通常 80–150 MB | 常见 3–15 MB |
| 常驻内存 | 较高（自带浏览器全套） | 明显更低 |
| 后端 | Node.js | **Rust** |
| 跨系统一致性 | 高（同一份 Chromium） | 需要处理 WebView 差异（CSS 兼容、API 支持） |
| 适合 | 重度依赖 Chromium 特性、要求像素级一致 | 工具类、本地文件处理、要求小而快 |

<Callout type="idea" title="取舍点" text="Tauri 用「系统 WebView」换来小体积，代价是不同操作系统上的渲染引擎不一样。上线前必须在三个平台各跑一遍 UI 回归 —— 这是它和 Electron 最实质的区别，不是一句「更快更小」能概括的。" />

## 工具链与结构

```bash
node -v                       # 18+
npm create tauri-app@latest notes-desktop
# 选：前端用 Vanilla / React / Vue 皆可，本例用 Vanilla + TS
cd notes-desktop && npm install
```

```text
notes-desktop/
├── package.json
├── src/                     # 前端界面（WebView）
│   ├── index.html
│   └── main.ts
├── src-tauri/               # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/
│   └── src/
│       ├── main.rs
│       └── lib.rs
```

```toml
# src-tauri/Cargo.toml
[package]
name = "notes-desktop"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

<StepBox title="分步实现" :steps='[{"title":"定义 Rust 命令","body":"用 `#[tauri::command]` 标记函数，参数与返回值都实现 Serialize / Deserialize。","tip":"命令是前端唯一能调用的 Rust 入口，天然形成一道边界。"},{"title":"管理笔记目录","body":"用 `tauri::State&lt;Mutex&lt;PathBuf&gt;&gt;` 保存根目录，启动时在 AppData 下创建 notes/。","tip":"路径集中管理，避免每个命令各自拼字符串。"},{"title":"实现三个命令","body":"list_notes / read_note / save_note，全部返回 Result&lt;T, String&gt; 而不是 panic。","tip":"错误转成 String，前端才能显示可读提示。"},{"title":"防路径穿越","body":"文件名只取 file_name()，拒绝含 .. 或路径分隔符的输入。","tip":"WebView 里的内容不可信，即使它看起来是自己的前端。"},{"title":"注册命令与前端调用","body":"`invoke_handler(tauri::generate_handler![...])`，前端用 invoke 调用。","tip":"命令名与参数名要和前端对象键一致（驼峰）。"},{"title":"配置 capabilities 并打包","body":"在 capabilities/default.json 里只开放需要的权限，然后 npm run tauri build。"}]' />

## 完整代码：`src-tauri/src/lib.rs`

```rust
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

struct AppState { notes_dir: Mutex<PathBuf> }

#[derive(Serialize)]
struct NoteMeta { name: String, size: u64 }

/// 只接受纯文件名，拒绝任何路径分隔符或上级目录跳转
fn safe_name(name: &str) -> Result<String, String> {
    let p = Path::new(name);
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || p.file_name().and_then(|s| s.to_str()) != Some(name)
    {
        return Err("非法文件名".into());
    }
    Ok(name.to_string())
}

#[tauri::command]
fn list_notes(state: tauri::State<'_, AppState>) -> Result<Vec<NoteMeta>, String> {
    let dir = state.notes_dir.lock().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&*dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            out.push(NoteMeta {
                name: entry.file_name().to_string_lossy().into_owned(),
                size: entry.metadata().map(|m| m.len()).unwrap_or(0),
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
fn read_note(name: &str, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let safe = safe_name(name)?;
    let dir = state.notes_dir.lock().map_err(|e| e.to_string())?;
    fs::read_to_string(dir.join(safe)).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_note(name: &str, body: &str, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let safe = safe_name(name)?;
    let dir = state.notes_dir.lock().map_err(|e| e.to_string())?;
    // 原子写：先写临时文件再 rename，避免崩溃时留下半截笔记
    let tmp = dir.join(format!(".{}.tmp", safe));
    fs::write(&tmp, body).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(safe)).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let base = app.path().app_data_dir().expect("无法取得应用数据目录");
            let notes = base.join("notes");
            fs::create_dir_all(&notes).expect("无法创建笔记目录");
            app.manage(AppState { notes_dir: Mutex::new(notes) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_notes, read_note, save_note])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
```

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { notes_desktop_lib::run() }
```

## 前端调用

```typescript
// src/main.ts
import { invoke } from '@tauri-apps/api/core';

type NoteMeta = { name: string; size: number };

async function refresh() {
  const notes = await invoke<NoteMeta[]>('list_notes');
  document.querySelector('#list')!.innerHTML = notes
    .map((n) => `<li data-name="${n.name}">${n.name} (${n.size}B)</li>`)
    .join('');
}

document.querySelector('#save')!.addEventListener('click', async () => {
  const name = (document.querySelector('#name') as HTMLInputElement).value;
  const body = (document.querySelector('#body') as HTMLTextAreaElement).value;
  try {
    await invoke('save_note', { name, body });
    await refresh();
  } catch (e) {
    alert(`保存失败：${e}`);   // Rust 返回的 Err(String) 会到这里
  }
});

refresh();
```

<Callout type="warn" title="前端也不可信" text="即使 WebView 加载的是你自己打包的静态资源，也要把每个命令参数当作外部输入校验。上面的 `safe_name` 挡住 `../` 与路径分隔符，就是防止恶意内容（或被注入的脚本）借 save_note 写到应用目录之外。Tauri v2 的 capabilities/permissions 是第二道防线：只开放真正需要的插件权限。" />

## 运行与打包

```bash
npm run tauri dev       # 开发：Rust 热编译 + 前端热更新
npm run tauri build     # 产出 dmg / msi / AppImage / deb
```

`src-tauri/tauri.conf.json` 里关注这几项：`identifier`（应用唯一标识）、`app.windows`（尺寸、标题、是否可调整）、`bundle.targets`（打包格式）、`bundle.icon`（各平台图标）。

## IPC 与事件

| 方式 | 方向 | 适用 |
| --- | --- | --- |
| `invoke("cmd", args)` | 前端 → Rust，有返回值 | 查询、保存等请求响应 |
| `app.emit("event", payload)` + `listen()` | Rust → 前端，推送 | 后台任务进度、文件变更通知 |
| 插件（fs / dialog / shell） | 双向 | 用官方封装好的系统能力，别自己重造 |

长任务不要卡在 `#[tauri::command]` 里同步跑：用 `tauri::async_runtime::spawn` 或把命令声明成 `async fn`，再通过事件把进度推给界面。

<Quiz no="61-1" q="Tauri 相比 Electron 体积小，主要原因是？" :options='["Rust 编译产物天生比 JS 小", "复用系统 WebView，不内嵌 Chromium", "把前端代码压缩得更狠", "去掉了所有系统 API"]' answer="1" explain="省掉的是整份浏览器运行时；代价是跨平台渲染一致性需要额外测试。" />

<Quiz no="61-2" q="`save_note` 里为什么要校验文件名？" :options='["为了支持中文", "WebView 内容不应被完全信任，防止路径穿越写到应用目录之外", "Tauri 强制要求", "为了提升性能"]' answer="1" explain="命令是安全边界，参数必须校验；capabilities 权限系统是第二层防护。" />

<Exercise title="加一个删除命令" task="实现 `delete_note(name)` 命令：复用 safe_name 校验，删除对应 .md 文件；文件不存在时返回可读错误而不是 panic。前端加一个删除按钮并刷新列表。" hints='["用 std::fs::remove_file", "先判断路径是否存在，给出中文错误", "前端 invoke 的 catch 里展示错误"]' solution="#[tauri::command]\nfn delete_note(name: &str, state: tauri::State&lt;'_, AppState&gt;) -&gt; Result&lt;(), String&gt; {\n    let safe = safe_name(name)?;\n    let dir = state.notes_dir.lock().map_err(|e| e.to_string())?;\n    let path = dir.join(safe);\n    if !path.exists() { return Err(&quot;笔记不存在&quot;.into()); }\n    std::fs::remove_file(path).map_err(|e| e.to_string())\n}\n// 别忘了加进 generate_handler![list_notes, read_note, save_note, delete_note]" explain="所有命令共用 safe_name，校验逻辑只写一份 —— 这正是把边界收在一处的价值。" />

## 常见坑

| 现象 | 处理 |
| --- | --- |
| 前端 `invoke` 报 command not found | 忘了把命令加进 `generate_handler![]`，或名字大小写不一致 |
| 参数收不到 | JS 对象键用驼峰，Rust 参数名要对应（`notesDir` ↔ `notes_dir`） |
| 生产构建白屏 | 前端资源路径 / `frontendDist` 配置不对，或 devUrl 与 build 混用 |
| 不同平台样式不一致 | 系统 WebView 差异；加 CSS 回归测试，避免依赖最新浏览器特性 |
| 权限报错 | Tauri v2 需在 `capabilities/default.json` 显式开放插件权限 |

## 扩展挑战

- 用 `tauri-plugin-store` / `tauri-plugin-dialog` 替换手写文件选择逻辑。
- 加全局快捷键与系统托盘（`tray-icon` feature）。
- 用 `app.emit` 把「后台索引进度」推到界面，做进度条。
- 接 [第 60 讲 Leptos](/projects/frontend/leptos.md) 作为前端，做成**全 Rust 技术栈**的桌面应用。
- 用 `tauri-plugin-updater` 实现签名更新，并在 CI 里做三平台打包。

<CheckList id="tauri-check" title="验收清单" :items='["npm run tauri dev 能打开窗口并列出笔记", "保存 / 读取 / 删除都走 Rust 命令", "非法文件名被拒绝且给出中文提示", "Result 错误能在前端显示而非白屏", "npm run tauri build 产出安装包"]' />

[下一个项目：第 62 讲 Node 原生插件 →](/projects/frontend/node-addon.md)
