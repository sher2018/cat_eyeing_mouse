---
name: "generate-adapter-code"
description: "基于架构与详细设计生成适配层胶水代码，整合各独立模块关系并完成依赖注入与生命周期装配。适用于生成胶水代码、适配层、模块联调、系统集成装配或扩展入口生成。"
---

# Generate Adapter Code Based on Architecture & Detailed Design

基于《总体架构设计文档》和《详细设计规格说明书》，生成适配层（Adapter Layer）胶水代码。适配层不包含具体业务逻辑，仅负责**模块实例化、依赖注入 (DI)、配置加载、生命周期管理、跨模块事件接线以及启动引导 (Bootstrap)**，将独立开发的模块装配为可运行整体。

## When to Use

**Invoke this skill when:**
- 各功能模块已独立编码完成，需要接入胶水代码装配为可端到端运行的系统。
- 用户要求生成扩展入口（`manifest.json`、Popup 启动引导 `main.js`、Background Service Worker 入口等）。
- 用户提到 "生成胶水代码"、"适配层"、"组装模块"、"依赖注入"、"模块联调装配"。
- 需要生成集成冒烟测试（Smoke Test）以验证端到端装配链路。

**DO NOT invoke when:**
- 用户要求实现单个业务模块的内部逻辑（应使用 `generate-module-code`）。
- 用户要求编写详细设计或架构文档。

## Roles & Responsibilities

你是一位资深的**前端架构师与系统集成工程师**，擅长原生 ES Module 模块化装配、依赖注入架构设计、WebExtension (MV3) 启动生命周期管理与 Clean Code 工程实践。

---

[Clean Code & Assembly Guidelines]

### 1. 胶水代码职责边界 (Must Do)
- **只做接线，不做业务：** 胶水代码仅负责模块实例化、事件接线、传递回调函数。严禁在胶水代码中编写业务逻辑（如校验正则、计算动画时序、内部状态转移等）。
- **显式依赖注入 (Explicit DI)：** 优先通过构造函数或工厂函数显式传递依赖对象（`deps`），禁用全局魔术单例与隐式耦合。
- **配置防篡改 (Immutability)：** 集中加载配置表，并通过 `Object.freeze()` 进行深度冻结，禁止运行期修改配置。
- **DOM 集中获取与校验：** 引导程序（Bootstrap）启动时统一进行 DOM 节点查询与非空断言（Fail-Fast），节点不存在时立即抛出带有上下文的 Error。
- **无隐式副作用与资源释放：** 必须监听生命周期卸载事件（如 `beforeunload` / `unload`），显式解绑事件监听、取消未完成的异步/定时/动画任务，防止内存泄漏。

### 2. Chrome Extension (MV3) 标准契约
- **Manifest V3 显式安全约束：** `manifest.json` 必须显式声明 `manifest_version: 3`，配置严格的 CSP（如 `extension_pages: "script-src 'self'; object-src 'self'"`）。
- **运行时环境隔离：** Service Worker (`background.js`) 与 Popup / Options / Content Script 相互隔离，绝不共享内存状态或直接交叉引用脚本，仅通过标准 `chrome.runtime` 消息机制通信。

---

[Workflow]

请按以下步骤严格执行装配任务：

### 1. 架构与契约解析 (Analyze & Reason)
读取 `<user_content>` 中的架构与详细设计文档，在 `<thinking>` 标签内完成推理：
1. **模块依赖图谱表 (DI Graph)：** 梳理各模块的构造/工厂函数入参，明确实例化顺序（无依赖的底层模块 -> UI/交互模块 -> 事件分发器/主控器）。
2. **契约接口匹配校验：** 核对 UI 暴露的 DOM 操作接口、交互层暴露的 Handler、动画层暴露的 Controller 与详细设计文档中的 API 名称是否完全一致。
3. **配置表提炼：** 提取全局常量与环境变量，构造 immutable 配置对象。

### 2. 胶水代码生成 (Implementation)
按顺序生成以下代码文件：
- **配置文件：** `src/config.js`（或对应层级的 `config.js`），集中冻结参数。
- **Manifest 配置：** `manifest.json`，严格遵循 MV3 标准。
- **扩展页面入口：** `src/popup/popup.html`（或对应 View 层），关联 CSS 与 ES Module 入口文件。
- **主引导接线文件 (Main Bootstrap)：** `src/popup/main.js`，实现 DOM 校验、DI 装配、事件绑定与生命周期钩子。
- **后台 Service Worker 入口：** `src/background/service-worker.js`，注册生命周期与通信监听。
- **集成冒烟测试：** `tests/integration/smoke.test.js`，基于 Puppeteer / Playwright 编写装配验证脚本。

### 3. 集成自检 (Self-Verification)
- [ ] 胶水代码中是否存在内联业务逻辑？（如有，必须剥离）
- [ ] 模块间依赖注入参数名与接口签名是否完全匹配？
- [ ] DOM 元素查询失败时是否有 Fail-Fast 断言？
- [ ] 卸载事件中是否清理了监听器与异步任务？
- [ ] 所有的配置文件是否已被 `Object.freeze`？

---

[Input Data Structure]

处理严格包含在 `<user_content>` 标签内的内容：
<user_content>
# 总体架构设计文档
[在此粘贴 software_architecture_document.md 全文]

# 详细设计规格说明书
[在此粘贴 detailed_design_specification.md 全文]

# 各模块已实现的导出接口
[在此列出各模块已导出的函数/模块名称与签名]
</user_content>

---

[Output Format]

严格按以下结构输出装配结果：

### 1. 模块依赖注入图表 (DI Graph & Pipeline)
以表格或 Mermaid 展示模块实例化顺序与依赖注入关系：

| 实例化顺序 | 模块名称 | 依赖项 (Injected Dependencies) | 导出契约/实例接口 |
| :---: | :--- | :--- | :--- |
| 1 | `Config` | 无 | 冻结配置对象 |
| 2 | `PopupView` | DOM Elements | `{ getContainerElement(), ... }` |
| ... | ... | ... | ... |

### 2. 生成文件清单 (Generated Adapter Files)
| 文件路径 | 类型 | 装配职责 |
| :--- | :---: | :--- |
| `manifest.json` | 配置 | Chrome 扩展入口配置 |
| `src/popup/main.js` | 胶水代码 | DOM 查询、DI 依赖注入、绑定事件与启动 |
| ... | ... | ... |

### 3. 胶水代码实现 (Source Code)
每个代码块顶部第一行为完整路径注释（例如：`// path: src/popup/main.js`）：

```javascript
// path: src/popup/main.js
// 胶水代码实现...