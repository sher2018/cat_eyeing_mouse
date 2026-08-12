# 项目长期记忆 (Project Memory)

> 本文件是 AI Agent 跨会话的持久化知识库，由 `doc/` 下三份核心文档提炼而成。
> 详细内容请查阅对应源文档，本文件仅作索引与关键契约速查。

---

## 1. 项目概述

- **项目名称：** Cat Eyeing Mouse（猫咪盯鼠标）—— Chrome/Edge 浏览器扩展 (Manifest V3)
- **核心功能：** 在任意网页右下角注入一只猫咪悬浮层，猫头实时跟踪鼠标方向（8 方向 + 中心态），支持拖拽、休息态、显隐开关、中英双语。
- **目标浏览器：** Chrome >= 88 / Edge >= 88（MV3 标准）
- **技术栈：** 原生 JS + DOM + CSS Sprite + Canvas 2D（备选），无重型运行时框架；构建工具 esbuild（开发期）+ sharp（雪碧图生成）

---

## 2. 文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| 需求文档 (PRD) | `doc/0.requirements_document.md` | 9 个 FR + 10 个 NFR + 边界情况 |
| 架构设计 | `doc/1.software_architecture_document.md` | 4+1 视图、18 模块划分、技术决策 |
| 详细设计 | `doc/2.detailed_design_specification.md` | 模块级接口契约、状态机、测试集 |
| 测试用例 | `doc/3.detailed_test_cases.md` | 系统级/单元级测试场景 |

---

## 3. 核心架构决策（不可违反）

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 扩展规范 | Manifest V3 | Chrome/Edge 强制；Service Worker |
| 运行时框架 | 原生 JS + DOM + CSS Sprite | 包体积 <= 2MB，零配置 |
| 隔离方案 | Shadow DOM（首选）/ iframe（备选） | 不污染宿主页面 |
| 渲染技术 | CSS Sprite `background-position` + Canvas 备选 | 雪碧图减少 HTTP 请求 |
| 过渡策略 | CSS transition + opacity（主）/ Canvas crossfade（备） | 平滑帧间过渡 |
| 存储 | `chrome.storage.local` | MV3 原生支持 |
| i18n | WebExtension `_locales`（根目录，非 src/） | 双端原生规范 |
| 构建期工具 | Node.js + sharp + esbuild | 仅开发期，不进运行时 |

---

## 4. 模块清单速查（18 模块）

| 编号 | 模块 | 文件路径 | 所属层 |
|------|------|----------|--------|
| M-01 | BrowserAdapter | `src/adapter/browser-adapter.js` | L5 适配 |
| M-02 | StorageService | `src/adapter/storage-service.js` | L4 持久化 |
| M-03 | I18nService | `src/adapter/i18n-service.js` | L3 服务 |
| M-04 | ResourceLoader | `src/adapter/resource-loader.js` | L3 服务 |
| M-05 | shared/geometry | `src/shared/geometry.js` | 共享纯逻辑 |
| M-06 | shared/constants | `src/shared/constants.js` | 共享纯逻辑 |
| M-07 | PoseStateMachine | `src/content/pose-state-machine.js` | L2 核心 |
| M-08 | CanvasTransitionRenderer | `src/content/transition-renderer.js` | L2 核心 |
| M-09 | CanvasStage | `src/content/canvas-stage.js` | L1 展示 |
| M-10 | DragController | `src/content/drag-controller.js` | L2 核心 |
| M-11 | IdleDetector | `src/content/idle-detector.js` | L2 核心 |
| M-12 | ToggleController | `src/content/toggle-controller.js` | L2 核心 |
| M-13 | OverlayContainer | `src/content/overlay-container.js` | L1 展示 |
| M-14 | PopupView | `src/popup/popup.js` + `popup.html` + `popup.css` | L1 展示 |
| M-15 | ServiceWorker | `src/background/service-worker.js` | Background |
| M-16 | shared/types | `src/shared/types.js` | 共享纯逻辑 |
| M-17 | shared/logger | `src/shared/logger.js` | 共享基础设施 |
| M-18 | content-main | `src/content/content-main.js` -> 构建产物 `dist/content.js` | 入口装配 |

### 依赖方向约束
- L1 -> L2 -> L3 -> L4 -> L5（单向）
- shared (M-05/M-06/M-16/M-17) 可被任意层依赖，自身不依赖任何层
- M-07 <-> M-08 循环依赖由 M-18 content-main 通过回调桥接打破

---

## 5. 关键接口契约（高频引用）

### M-07 PoseStateMachine
- `update(pointer, catCenter)` / `setHover(bool)` / `current()` / `getState()`
- `enterResting()` / `exitResting()` -- 由 M-11 IdleDetector 驱动
- `notifyMouseLeave(lastPoint, catCenter)` / `notifyMouseReenter()` -- 鼠标越界跟踪
- `onPoseChange(cb)` / `onHoverChange(cb)` -- 订阅

### M-04 ResourceLoader
- `getUrl(rel)` / `preloadSprite()` / `preload(frames)` / `get(sector)` / `getSpriteUrl()` / `getFallback()` / `invalidate()`

### M-13 OverlayContainer
- `mount(host)` / `unmount()` / `setPosition(p)` / `getPosition()` / `getCatCenter()`
- `getCanvasStage()` / `getPoseMachine()` / `setClamp(bool)` / `getHost()`

### M-08 CanvasTransitionRenderer
- `playTo(sector)` / `cancel()` / `isActive()` / `setMode("css"|"crossfade")` / `onComplete(cb)`

### M-09 CanvasStage
- `mount(host, size)` / `unmount()` / `drawImage(img)` / `setSpriteFrame(idx)` / `suspend()` / `resume()`

---

## 6. 资源规范

### 雪碧图 (res/spine/)
- **路径：** `res/spine/move_sprite.png`（3x3 网格，384x384px，单帧 128x128px）
- **CSS：** `res/spine/move_sprite.css`（`.move-sprite-0` ~ `.move-sprite-8` 类定义 `background-position`）
- **帧映射：** 0=中心, 1=右上(NE), 2=右(E), 3=右下(SE), 4=下(S), 5=左下(SW), 6=左(W), 7=左上(NW), 8=上(N)
- **源帧：** `res/move/0~8.png`（仅用于重新生成雪碧图，运行时不直接引用）

### i18n (`_locales/`)
- **路径：** 扩展根目录 `/_locales/{lang}/messages.json`（WebExtension 规范，非 `src/_locales`）
- **默认回退：** `en`（与 manifest.json `default_locale` 一致）
- **支持语言：** `en`（英文）、`zh_CN`（中文）

### 其他资源
- `res/rest/sit_back/sit_back.png` -- 休息态
- `res/icons/icon{16,48,128}.png` -- 扩展图标

---

## 7. 关键行为契约

### 鼠标越界跟踪 (FR-003 AC5)
- 浏览器窗口未最大化时，鼠标移出视口 -> 猫保持最后方向扇区朝向（不重置为中心态）
- 鼠标重新进入视口 -> 恢复实时跟踪
- 实现：M-18 content-main 绑定 `document.mouseleave/mouseenter` -> 调用 M-07 `notifyMouseLeave/notifyMouseReenter`

### 休息态 (FR-008)
- 默认阈值：8000ms（`IDLE_THRESHOLD_MS`，可配置）
- 进入休息态时 M-07 忽略 `update`
- 唤醒防抖：120ms（`WAKE_DEBOUNCE_MS`）

### 过渡节流 (FR-004)
- 最小过渡间隔：60ms（`TRANSITION_THROTTLE_MS`）
- 过渡时长：120ms（`TRANSITION_DURATION_MS`，范围 80~160ms）
- 抢占策略：新 `playTo` 取消旧过渡

---

## 8. 项目约束（NFR 关键项）

| NFR | 内容 | 实现要点 |
|-----|------|---------|
| NFR-002 | CPU 友好 | 页面隐藏暂停 rAF；休息态降级轮询 |
| NFR-003 | 包体积 <= 2MB | 无重型框架；雪碧图合并帧 |
| NFR-007 | 高分屏不糊 | Canvas DPR 缩放（上限 3） |
| NFR-009 | 不污染宿主 | Shadow DOM 隔离 |
| NFR-010 | 可观测性 | 统一 logger 分级日志 |

---

## 9. 构建与测试

### 构建
- `npm run build` -- esbuild 打包 `src/content/content-main.js` -> `dist/content.js` (IIFE)
- Background Service Worker 直接以 ES Module 加载，无需打包

### 测试
- `npm test` -- Vitest（jsdom 环境）
- 测试集路径：`src/{module}/__tests__/*.test.js`
- 已知测试环境问题：jsdom `document.hidden` 只读、`window` 未定义（与代码逻辑无关）

---

## 10. 修改范围约束（项目规则 §3.1）

- 代码修改仅限 `src/` 目录
- 文档修改仅限 `doc/` 根目录
- 禁止修改 `$workspace` 之外的任何文件
- 修改架构/详细设计文档后必须立即验证（规则 §9）
