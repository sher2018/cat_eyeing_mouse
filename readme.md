# Cat Eyeing Mouse — 猫盯着鼠标 浏览器扩展

> 一只悬浮在网页右下角的猫咪，眼睛/姿态实时跟随鼠标移动，营造"猫始终盯着老鼠（鼠标）"的趣味桌面宠物效果。

## 功能特性

- 🐱 **8方向姿态跟踪** — 根据鼠标相对猫咪中心位置，实时切换8个朝向 + 中心hover态
- 🎬 **Canvas平滑过渡** — 基于 crossfade（交叉淡入淡出）实现姿态切换动画，无硬切跳变
- 🖱️ **可拖拽停靠** — 按住猫咪拖动到任意位置，位置持久化存储于 `chrome.storage.local`
- 💤 **智能休息态** — 鼠标静止10秒后自动进入休息态，唤醒平滑过渡
- 🌍 **双语i18n** — 中英文自动适配，遵循WebExtension标准规范
- 🔒 **零隐私风险** — 纯前端实现，无网络请求、无数据上报
- 🎯 **Chrome/Edge双端支持** — 同一Manifest V3包同时支持Chrome和Edge浏览器

---

## 项目目录结构

```
cat_eyeing_mouse/
├── manifest.json                          # Manifest V3 清单（Chrome/Edge 共用）
├── package.json                           # 构建/测试脚本（esbuild + vitest）
├── LICENSE                                # 开源协议
│
├── _locales/                              # i18n 语言包（WebExtension 标准，须位于扩展根目录）
│   ├── en/messages.json                   #   英文文案（默认回退）
│   └── zh_CN/messages.json                #   中文文案
│
├── doc/                                   # 设计文档
│   ├── 0.requirements_document.md         # 产品需求文档 (PRD)
│   ├── 1.software_architecture_document.md # 软件架构设计书 (SAD)
│   ├── 2.detailed_design_specification.md # 详细设计规格说明书
│   └── 3.detailed_test_cases.md           # 测试用例文档
│
├── src/                                   # 源代码目录（ES Modules，经 esbuild 打包）
│   ├── adapter/                           # 浏览器适配层（L5）
│   │   ├── browser-adapter.js             #   M-01 chrome.*/browser.* 命名空间统一封装
│   │   ├── storage-service.js             #   M-02 chrome.storage.local Promise化封装
│   │   ├── i18n-service.js                #   M-03 chrome.i18n.getMessage 封装 + 语言回退
│   │   ├── resource-loader.js             #   M-04 /res 资源URL解析 + 预加载缓存
│   │   └── __tests__/                     #   适配层单元测试
│   │
│   ├── content/                           # Content Script（悬浮层主逻辑）
│   │   ├── content-main.js                #   M-13入口：装配各模块 + 消息监听（esbuild 构建入口）
│   │   ├── overlay-container.js           #   M-13 Shadow DOM 悬浮容器注入
│   │   ├── pose-state-machine.js          #   M-07 8扇区姿态状态机
│   │   ├── canvas-stage.js                #   M-09 Canvas 2D 绘制 + rAF + visibility暂停
│   │   ├── transition-renderer.js         #   M-08 crossfade过渡渲染 + 节流抢占
│   │   ├── drag-controller.js             #   M-10 Pointer Events 拖拽 + 越界回收
│   │   ├── idle-detector.js               #   M-11 静止计时/休息态切换
│   │   ├── toggle-controller.js           #   M-12 显隐开关状态机
│   │   └── __tests__/                     #   Content层单元测试
│   │
│   ├── background/
│   │   ├── service-worker.js              #   M-15 MV3 Service Worker 消息中转
│   │   └── __tests__/
│   │
│   ├── popup/                             # Popup 工具栏弹窗
│   │   ├── popup.html                     #   Popup 页面结构
│   │   ├── popup.css                      #   Popup 样式
│   │   ├── popup.js                       #   M-14 PopupView i18n绑定 + 显隐/边界开关
│   │   └── __tests__/
│   │
│   └── shared/                            # 跨上下文共享纯逻辑
│       ├── constants.js                   #   M-06 全模块共享常量（扇区/帧映射/阈值/存储键）
│       ├── geometry.js                    #   M-05 atan2扇区归类纯函数
│       ├── types.js                       #   Result类型工具 (ok/err)
│       ├── logger.js                      #   分级日志 createLogger
│       └── __tests__/
│
├── res/                                   # 静态资源（chrome.runtime.getURL加载）
│   ├── move/                              # 8方向+中心姿态帧
│   │   ├── 0.png ~ 8.png                  # 0=center(hover), 1=NE, 2=E, 3=SE,
│   │   │                                  # 4=S, 5=SW, 6=W, 7=NW, 8=N
│   │   └── left/                          # 朝左序列帧素材（1_left.png ~ 10_left.png）
│   ├── rest/sit_back/sit_back.png         # 休息态素材
│   ├── spine/                             # 精灵图资源（move_sprite.png / move_sprite.css）
│   └── icons/
│       ├── icon16.png                     # 扩展图标 16x16
│       ├── icon48.png                     # 扩展图标 48x48
│       └── icon128.png                    # 扩展图标 128x128
│
├── dist/                                  # 构建产物（npm run build 生成，勿手工编辑）
│   └── content.js                         # Content Script 打包产物（manifest 引用）
│
└── src/test/                              # 测试占位目录
```

---

## 各模块关键配置点

### 1. Manifest V3 配置

[manifest.json](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/manifest.json) 关键配置：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `manifest_version` | `3` | Manifest V3 规范 |
| `name` / `description` | `__MSG_app_name__` / `__MSG_app_description__` | 通过 i18n 占位符引用语言包 |
| `default_locale` | `"en"` | i18n 默认回退语言 |
| `background.service_worker` | `"src/background/service-worker.js"` | Service Worker 入口（`"type": "module"`） |
| `content_scripts.js` | `["dist/content.js"]` | 匹配 `<all_urls>`，`document_idle` 注入；指向 esbuild 打包产物 |
| `permissions` | `["storage", "tabs"]` | 存储权限 + 标签页广播权限 |
| `web_accessible_resources` | `res/**` + `<all_urls>` | Content Script 可访问静态资源 |
| `action.default_popup` | `"src/popup/popup.html"` | Popup 页面 |

> 注意：`dist/content.js` 由 `npm run build` 生成（详见下方[本地开发验证流程](#本地开发验证流程)），加载扩展前必须先构建。

### 2. 核心常量配置

[constants.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/shared/constants.js) 定义所有模块共享参数：

| 常量 | 值 | 说明 |
|------|-----|------|
| `SectorId` | `0=CENTER, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW, 8=N` | 扇区枚举 |
| `IDLE_THRESHOLD_MS` | `10000` | 休息态触发阈值（10秒） |
| `WAKE_DEBOUNCE_MS` | `120` | 唤醒防抖时间 |
| `TRANSITION_THROTTLE_MS` | `60` | 过渡最小间隔（节流） |
| `TRANSITION_DURATION_MS` | `120` | 单次 crossfade 过渡时长 |
| `DPR_CAP` | `3` | devicePixelRatio 上限（高分屏保护） |
| `OVERLAY_Z_INDEX` | `2147483647` | 悬浮层 z-index（最高） |
| `OVERLAY_DEFAULT_EDGE_GAP_PX` | `8` | 默认贴边间距 |
| `DRAG_MOVE_THRESHOLD_PX` | `3` | 拖拽触发阈值（像素） |
| `KEY_POSITION` | `"cem.position"` | 位置存储键 |
| `KEY_SETTINGS` | `"cem.settings"` | 设置存储键 |
| `DEFAULT_SETTINGS` | `{hidden:false, clampToViewport:true, locale:"en"}` | 默认设置 |
| `RAF_SUSPEND_ON_HIDDEN` | `true` | 页面隐藏时暂停 rAF |

### 3. 姿态帧映射契约

[constants.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/shared/constants.js#L24-L34) 中 `MOVE_FRAMES` 严格映射：

| 文件 | SectorId | 姿态 | 角度区间（atan2，右开左闭） |
|------|----------|------|------------------------------|
| `0.png` | CENTER(0) | 中心(hover) | 鼠标在 hover 半径内 |
| `1.png` | NE(1) | 右上 | -67.5° ~ -22.5° |
| `2.png` | E(2) | 右 | -22.5° ~ 22.5° |
| `3.png` | SE(3) | 右下 | 22.5° ~ 67.5° |
| `4.png` | S(4) | 下 | 67.5° ~ 112.5° |
| `5.png` | SW(5) | 左下 | 112.5° ~ 157.5° |
| `6.png` | W(6) | 左 | 157.5° ~ 180° / -180° ~ -157.5° |
| `7.png` | NW(7) | 左上 | -157.5° ~ -112.5° |
| `8.png` | N(8) | 上 | -112.5° ~ -67.5° |

> 角度坐标系：屏幕坐标 X 向右为正、Y 向下为正；`Math.atan2(dy, dx)` 计算。详见 [geometry.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/shared/geometry.js)。

### 4. i18n 语言包配置

语言包位于 [_locales/](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/_locales)（扩展根目录，WebExtension 标准要求位置）：

| key | en | zh_CN |
|-----|-----|--------|
| `app_name` | Cat Eyeing Mouse | 猫咪盯鼠标 |
| `app_description` | A cute cat follows your cursor... | 一只可爱的小猫会追随你的鼠标... |
| `action_show` | Show | 显示 |
| `action_hide` | Hide | 隐藏 |
| `action_clamp_viewport` | Clamp to viewport | 边界约束 |
| `tip_drag_to_move` | Drag to move | 拖动移动 |
| `status_resting` | Resting | 休息中 |

**语言解析逻辑**（[i18n-service.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/adapter/i18n-service.js#L36-L43)）：
`chrome.i18n.getUILanguage()` → `LOCALE_MAP` 映射（`zh`/`zh-CN` → `zh_CN`，其余 → `en`）→ 缺失回退到 key 本身。

### 5. 模块接口与依赖关系

#### 适配层（L5 Adapter）

| 模块 | 文件 | 核心接口 | 说明 |
|------|------|----------|------|
| BrowserAdapter | [browser-adapter.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/adapter/browser-adapter.js) | 单例 `browserAdapter`：`runtime()` / `storage()` / `tabs()` / `i18n()` / `isEdge()` / `isChrome()` / `getEnvironment()` | 优先 `chrome.*`，回退 `browser.*`；回调式 API Promise 化 |
| StorageService | [storage-service.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/adapter/storage-service.js) | `getPosition()` / `setPosition(pos)` / `getSettings()` / `setSettings(s)` | 返回 `Result<T>`，永不抛异常；深度合并设置 |
| I18nService | [i18n-service.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/adapter/i18n-service.js) | `t(key)` / `getLocale()` / `bulk(keys)` | key 缺失返回 key 本身并记 WARN |
| ResourceLoader | [resource-loader.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/adapter/resource-loader.js) | `getUrl(relPath)` / `preload(frames)` / `get(sector)` / `getFallback()` | 通过 `runtime.getURL()` 解析路径；加载失败回退透明1x1 PNG |

**Result 类型模式**（[types.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/shared/types.js)）：
所有适配层方法返回 `Result` 对象：成功 `{ok:true, value:T}`，失败 `{ok:false, error:{code, message}}`。

#### 核心业务逻辑层（L2 Core）

| 模块 | 文件 | 核心接口 | 说明 |
|------|------|----------|------|
| PoseStateMachine | [pose-state-machine.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/content/pose-state-machine.js) | `update(pointer, catCenter)` / `setHover(bool)` / `onPoseChange(cb)` / `enterResting()` / `exitResting()` | 3态：Tracking/Hover/Resting；同扇区防抖 |
| CanvasTransitionRenderer | [transition-renderer.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/content/transition-renderer.js) | `playTo(target)` / `cancel()` / `isActive()` | crossfade 模式；60ms 节流 + 抢占/合并策略 |
| CanvasStage | [canvas-stage.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/content/canvas-stage.js) | `mount(host, size)` / `drawImage(img)` / `requestFrame(cb)` / `suspend()` / `resume()` | DPR 缩放适配；visibilitychange 自动暂停/恢复 |
| DragController | [drag-controller.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/content/drag-controller.js) | `bind(target)` / `onDragMove(cb)` / `onDrop(cb)` | Pointer Events；3px 阈值；越界 clamp 回收 |
| IdleDetector | [idle-detector.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/content/idle-detector.js) | `start()` / `stop()` / `onIdle(cb)` / `onWake(cb)` | 8s 静止计时；120ms 唤醒防抖 |
| ToggleController | [toggle-controller.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/content/toggle-controller.js) | `show()` / `hide()` / `toggle()` / `onVisibilityChange(cb)` | 显隐状态机；卸载时释放监听 |

#### 入口装配

[content-main.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/content/content-main.js) 装配流程：
1. `hasRuntime()` 探测扩展运行时（避免测试环境误装配）
2. `createApp()` 构建依赖图：OverlayContainer → CanvasStage + PoseStateMachine + DragController
3. `wireRenderer()` 连接 PoseStateMachine.onPoseChange → TransitionRenderer.playTo（crossfade 模式）
4. IdleDetector.onIdle → PoseStateMachine.enterResting；onWake → exitResting
5. `bootstrap()` 读取设置 → 若非 hidden 则 mount → 启动 IdleDetector
6. 监听 Service Worker 消息：`TOGGLE_VISIBLE` / `SET_CLAMP`

### 6. Popup UI 配置

[popup.html](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/popup/popup.html) 结构：
- 标题（`data-i18n-key="app_name"`）
- 显隐切换按钮（`#btn-toggle`）
- 边界约束复选框（`#btn-clamp`）
- 拖拽提示（`data-i18n-key="tip_drag_to_move"`）

[popup.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/popup/popup.js) 逻辑：
- `init()` 加载 i18n 文案 → 注入图标 → 同步开关状态 → 绑定事件
- 点击 toggle → `sendMessage({type:"TOGGLE_VISIBLE"})` 经 SW 中转
- 切换 clamp → `sendMessage({type:"SET_CLAMP", clamp})` 经 SW 中转

### 7. Service Worker 消息协议

[service-worker.js](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/src/background/service-worker.js) 消息类型（`MSG_TYPES`）：

| 消息类型 | 触发方 | 处理逻辑 |
|----------|--------|----------|
| `TOGGLE_VISIBLE` | Popup → SW | 翻转 `hidden` 设置 → 广播给所有 Content |
| `SET_CLAMP` | Popup → SW | 写入 `clampToViewport` → 广播给所有 Content |
| `ACK` | Content → SW | 确认消息接收 |
| `SETTINGS_UPDATED` | SW → Content | 设置变更通知（预留） |

---

## 本地开发验证流程

### 环境准备

- **Node.js ≥ 18 + npm：** 必需（用于构建打包产物与运行单元测试）
- **浏览器：** Google Chrome ≥ 88 或 Microsoft Edge ≥ 88（支持 Manifest V3）

### 步骤1：安装依赖并构建

> Manifest 中 Content Script 指向打包产物 `dist/content.js`，**加载扩展前必须先构建**，否则扩展加载后无法向页面注入悬浮层。

```powershell
# 安装依赖（esbuild / vitest / jsdom）
npm install

# 构建：src/content/content-main.js → dist/content.js（IIFE 单文件，约 68KB）
npm run build

# 开发期监听模式：改动 src 后自动重新打包
npm run build:watch
```

构建成功输出示例：`dist\content.js  68.2kb  Done`

### 步骤2：Chrome 加载已解压扩展

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择项目根目录 `cat_eyeing_mouse/`（包含 `manifest.json`）
5. 确认扩展卡片出现且无 **错误** 提示（若报文件加载失败，优先检查 `dist/content.js` 是否已构建）

### 步骤3：Edge 加载已解压扩展

1. 打开 Edge，地址栏输入 `edge://extensions/`
2. 开启左下角 **开发人员模式**
3. 点击 **加载解压缩的扩展**
4. 选择项目根目录 `cat_eyeing_mouse/`
5. 确认扩展加载成功

### 步骤4：功能验证清单

刷新任意网页（如 `https://example.com`）进行验证：

| 验证项 | 预期结果 | 涉及模块 |
|--------|----------|----------|
| 默认位置 | 猫咪悬浮在视口右下角，距边缘 8px | OverlayContainer |
| 背景透明 | 容器无可见边框/阴影，不触发页面 reflow | OverlayContainer (Shadow DOM) |
| 鼠标跟踪 | 鼠标移动时姿态实时切换，延迟 ≤ 50ms | PoseStateMachine + TransitionRenderer |
| 8方向切换 | 鼠标分别移动到8个扇区中心，对应帧正确显示 | geometry.classifySector |
| hover中心态 | 鼠标移到猫咪上时显示 0.png | PoseStateMachine.setHover |
| 拖拽功能 | 按住猫咪平滑拖动（3px阈值），松手位置保持 | DragController |
| 位置持久化 | 刷新页面后猫咪回到上次拖拽位置 | StorageService (`cem.position`) |
| 越界回收 | 窗口缩放时记忆坐标越界自动回收到边缘 | DragController.clampPosition |
| 休息态 | 鼠标静止10秒后进入休息态 | IdleDetector |
| 唤醒 | 移动鼠标时从休息态唤醒（120ms防抖） | IdleDetector |
| Popup开关 | 点击工具栏图标，Popup 显示显隐按钮和边界约束开关 | PopupView |
| 显隐切换 | 隐藏后悬浮层完全移除，再次显示恢复位置 | ToggleController |
| i18n中文 | 浏览器语言为中文时 Popup 文案显示中文 | I18nService + zh_CN |
| i18n英文 | 切换浏览器语言为英文，刷新后文案显示英文 | I18nService + en |
| 页面隔离 | 不影响页面样式、不选中文本、不触发滚动 | Shadow DOM 隔离 |
| 无网络请求 | DevTools Network 面板无外联请求 | 零网络约束 |
| 高分屏适配 | 在 2K/4K 屏幕上 Canvas 不模糊（DPR上限3） | CanvasStage.resolveDpr |
| 页面隐藏暂停 | 切换标签页后 rAF 暂停 | CanvasStage.visibilitychange |

### 步骤5：调试技巧

**Content Script 调试：**
- 目标页面按 F12 → Sources → Content scripts → 在 `dist/content.js`（esbuild 打包产物，单 IIFE 文件）中查找模块名并打断点

**Service Worker 调试：**
- `chrome://extensions/` → 点击扩展卡片的 "Service Worker" 链接

**Popup 调试：**
- 点击工具栏图标打开 Popup → 右键 → 检查

**存储检查：**
- DevTools → Application → Storage → Extension Storage → 查看 `cem.position` 和 `cem.settings`

**日志输出：**
- 所有模块通过 `createLogger('Module')` 输出分级日志，格式：`[LEVEL][Module][Event] context`
- 可通过 `logger.setLevel('debug')` 调整最低输出级别

### 步骤6：运行单元测试

```powershell
npm test              # 单次运行（vitest）
npm run test:watch    # 监听模式
```

项目在各模块下包含 `__tests__/` 目录，覆盖适配层、核心逻辑层、Popup、Service Worker。

### 步骤7：修改代码后的更新流程

1. 修改 `src/` 下源码
2. 重新构建：`npm run build`（或保持 `npm run build:watch` 常开自动重打包）
3. 打开 `chrome://extensions/` 或 `edge://extensions/`，点击扩展卡片上的 **刷新** 按钮（圆形箭头）
4. 刷新测试页面即可看到更新

---

## 部署上线流程

### 前置检查清单

- [ ] `manifest.json` 配置符合 MV3 规范，无语法错误
- [ ] 已执行 `npm run build`，`dist/content.js` 为最新构建产物
- [ ] `permissions` 仅声明 `storage` 与 `tabs`，无过度权限
- [ ] icons 三尺寸齐备（16/48/128）且清晰
- [ ] `_locales/en` 和 `_locales/zh_CN` 文案完整，无硬编码字符串
- [ ] 所有资源路径通过 `chrome.runtime.getURL()` 加载
- [ ] 无 `fetch` / `XHR` 等网络请求，零数据上报
- [ ] Shadow DOM 隔离正常，不污染宿主页面
- [ ] Chrome 和 Edge 本地验证均通过
- [ ] 包体积控制在 2MB 以内
- [ ] 扩展有清晰的描述、截图、隐私声明

### 打包ZIP

**前置：** 先执行 `npm install && npm run build` 确保生成 `dist/content.js`。

**打包文件（仅包含以下内容）：**
```
manifest.json
_locales/**/*（i18n 语言包，缺失会导致扩展名解析失败）
src/**/*（Popup / Service Worker 等源码文件）
res/**/*（所有资源文件）
dist/content.js（Content Script 打包产物）
```

**排除文件（不要打入ZIP）：**
- `.trae/`（IDE配置）
- `doc/`（设计文档）
- `node_modules/`
- `.gitignore` / `.git/`
- `readme.md`
- `package.json` / `package-lock.json`（构建脚本，运行时不需要）
- `LICENSE`（可选）

**PowerShell 打包命令：**
```powershell
Compress-Archive -Path manifest.json, _locales, src, res, dist -DestinationPath release/cat-eyeing-mouse-v1.0.0.zip -Force
```

**验证ZIP：**
- 解压后根目录直接可见 `manifest.json`，无嵌套目录
- `_locales/`、`src/`、`res/`、`dist/` 目录结构完整
- ZIP 大小 ≤ 2MB

### Chrome Web Store 发布

1. **开发者账号：** 注册 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)，支付一次性注册费（$5 USD）
2. **上传扩展：** 新建项目 → 上传 ZIP 包
3. **填写信息：**
   - 名称：Cat Eyeing Mouse（猫咪盯鼠标）
   - 简短描述 + 详细描述
   - 分类：娱乐 / 生产力
   - 语言：English + 中文（简体）
   - 图标：128x128
   - 截图：至少1张 1280x800 或 640x400
4. **隐私声明（必填）：**
   - 单用途：在网页上提供跟随鼠标的猫咪桌面宠物
   - 数据收集：**不收集、不传输任何用户数据**
   - 远程代码：**不执行远程代码**
   - 所有数据仅存储在用户本地 `chrome.storage.local`
5. **提交审核：** 审核通常 1-3 个工作日

### Microsoft Edge Add-ons 发布

Edge Add-ons 支持 Chrome 扩展无缝迁移，直接复用同一个 ZIP 包。

1. **开发者账号：** 注册 [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/)
2. **上传扩展：** 创建新扩展 → 上传**同一个 ZIP 包**
3. **填写信息：** 复用 Chrome 版本内容
4. **提交认证：** 审核通常 1-7 个工作日

### 版本更新流程

1. 更新 [manifest.json](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/manifest.json#L4) 中 `version` 字段
2. 本地重新验证
3. 重新打包 ZIP
4. 在 Chrome 和 Edge 开发者后台分别上传新版本
5. 提交审核

---

## 性能指标

| 指标 | 目标值 |
|------|--------|
| 姿态切换端到端延迟 | ≤ 50ms（P95） |
| 过渡节流间隔 | 60ms |
| crossfade 单次时长 | 120ms |
| 鼠标静止后 CPU 占用 | ≈ 0% |
| 扩展包体积 | ≤ 2MB |
| 支持浏览器版本 | Chrome ≥ 88 / Edge ≥ 88 |
| devicePixelRatio 上限 | 3（防高分屏过载） |
| 配置需求 | 零配置，安装即用 |

---

## 常见问题

**Q: 为什么在某些页面看不到猫咪？**
A: Chrome/Edge 出于安全限制，Content Script 无法注入 `chrome://`、`edge://`、Chrome Web Store、PDF 预览页等特殊页面。

**Q: 拖拽时猫咪被拖到视口外怎么办？**
A: 开启"边界约束"（默认开启）后，拖拽时自动限制在视口内；位置数据存储于 `cem.position` 键。

**Q: 如何重置猫咪位置？**
A: 在 DevTools → Application → Extension Storage 中清除 `cem.position` 键后刷新页面。

**Q: 支持Firefox吗？**
A: 当前优先支持 Chrome/Edge。BrowserAdapter 已预留 `browser.*` 命名空间回退，Firefox 适配可作为后续扩展。

---

## 许可证

详见 [LICENSE](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/LICENSE)。
