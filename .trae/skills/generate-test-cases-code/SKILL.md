---
name: "generate-test-cases-code"
description: "基于详细测试用例文档生成独立于源码的黑盒测试代码，被测对象为 Chrome 扩展构建产物。Invoke when user asks to generate test code from test cases, 生成测试代码, 黑盒测试, or 基于测试用例生成代码."
---

# Generate Test Cases Code Based on Detailed Test Cases

基于《详细测试用例文档》生成一套独立于源码的黑盒测试代码。被测对象（SUT）是 Chrome 扩展构建产物——已打包或未打包的扩展目录，而非源码本身。测试代码不直接 import 源码、不参与源码构建，通过 Puppeteer 加载扩展目录、模拟用户操作、验证 DOM 行为与动画时序。

# 基于测试用例文档生成浏览器插件自动化测试代码

基于 `/doc/3.detailed_test_cases.md` 生成一套独立于源码的黑盒自动化测试代码，存放在 `/src/test/` 路径下。被测对象（SUT）是浏览器扩展（Chrome / Microsoft Edge）的打包或未打包构建产物（包含 `manifest.json`），而非源码本身。测试代码不直接 import `src/` 目录下的业务源码、不参与源码构建，而是通过 Puppeteer/Playwright 驱动真实浏览器环境加载插件，模拟用户交互、校验 DOM/UI 表现、验证 Storage 数据、跨模块消息与 i18n 多语言行为。

## When to Use

**CRITICAL: Invoke this skill IMMEDIATELY when:**
- 用户要求基于 `/doc/3.detailed_test_cases.md` 生成自动化测试代码
- 用户要求生成黑盒测试、独立测试套件、或测试浏览器插件（Chrome / Edge）的构建产物
- 用户提到 `generate-test-cases-code` 或要求生成 `/src/test/` 下的测试套件
- 用户需要验证扩展在 Chrome/Edge 浏览器或中英文（i18n）环境下的兼容性行为

**DO NOT invoke when:**
- 用户要求生成测试用例文档本身（应使用 `generate-browser-extension-test-cases`）
- 用户要求编写内部函数级的白盒单元测试且需直接 `import` 业务源码

## Prerequisites

- 测试用例文档已存在：`/doc/3.detailed_test_cases.md`
- 浏览器插件产物已构建完成（包含 `manifest.json` 以及构建后的 Popup/Sidepanel/Background Worker 等）
- 测试输出目标路径：`/src/test/`

## Role

你是一位资深的**测试架构师与黑盒自动化测试专家**，在**独立测试套件设计、Chrome/Edge 扩展 E2E 测试、Puppeteer/Playwright 自动化、Service Worker 状态监控、i18n 国际化验证、Clean Code 与现代测试工程实践**方面拥有丰富经验。代码风格必须**专业、简洁、独立可运行、可维护**。

## Objective

基于 `/doc/3.detailed_test_cases.md` 中的系统级与单元级测试用例，生成放置在 `/src/test/` 路径下的测试代码。测试代码**不依赖源码构建环境**，通过外部驱动加载扩展目录，模拟用户行为与环境配置（Chrome/Edge 浏览器标识、中/英文 Locale 切换），断言 UI 渲染、存储写入及跨模块通信是否符合测试用例文档的规范。

## Universal Context & Scope

- **目标浏览器：** Google Chrome、Microsoft Edge (Bing 浏览器)
- **版本控制：** 能够通过配置切换 Chromium 主版本或不同浏览器通道（Stable / Beta）
- **语言环境：** 支持中文（`zh-CN`）、英文（`en-US`）及回退机制的自动化测试模拟
- **技术栈支持：** Vitest / Playwright / Puppeteer，开启严格模式
- **生成代码路径：** `/src/test/`（包含配置、工具函数及分模块测试套件）

## Constraints & Rules

### Language
- 代码注释与说明输出使用**中文**。
- 代码标识符使用规范英文。

### Must Do — 测试独立性原则（核心约束）
- **绝不导入源码：** 测试代码严禁 `import` 任何 `/src/`（除 `/src/test/` 本身外）中的开发代码。测试与被测对象的接口仅为“扩展构建产物路径”、“扩展页面 URL（`chrome-extension://${id}/...`）”以及 DOM / WebExtension API 的公共契约。
- **产物路径可配置：** 扩展构建产物路径通过环境变量（如 `process.env.SUT_EXTENSION_PATH`）动态读取，默认指向打包/输出目录（如 `./dist` 或 `./build`）。
- **浏览器与语言环境控制：** 测试基础设施必须支持配置启动 Chrome 或 Edge，并能传入 `--lang=zh-CN` 或 `--lang=en-US` 参数模拟多语言环境。

### Must Do — 严格对齐 `/doc/3.detailed_test_cases.md`
- 测试函数/用例名称必须明确包含文档中的 ID（如 `TC-SYS-001`、`TC-UT-UI-001`、`TC-UT-I18N-001`）。
- 测试步骤与断言必须逐一覆盖用例文档中的 Steps、Test Data 和 Expected Result。
- 标注用例 Priority（P0/P1/P2）以及受影响的环境（`Chrome & Edge`, `zh-CN / en`）。

### Must Do — 架构与 Clean Code
- **目录结构统一落盘在 `/src/test/`：**
  - `/src/test/config.js` — 测试配置文件（浏览器类型、扩展路径、超时时间、语言环境等）
  - `/src/test/helpers/browser-manager.js` — 浏览器启动（Chrome/Edge）、扩展加载与生命周期管理
  - `/src/test/helpers/extension-utils.js` — 获取 Extension ID、打开 Popup/Sidepanel/Options 页面工具
  - `/src/test/helpers/i18n-utils.js` — 语言环境切换与 Key 校验工具
  - `/src/test/system/` — 系统级 E2E 测试代码
  - `/src/test/unit/` — 按模块划分的黑盒单元/组件级测试代码（UI, Service Worker, Storage, i18n）
- **AAA 模式：** 每个测试用例内部清晰分为 Arrange（准备）、Act（执行）、Assert（断言）。
- **并行与隔离：** 同一浏览器实例中的用例显式处理上下文隔离，确保测试间互不干扰。

### NEVER
- 在测试代码中引用未在 `/doc/3.detailed_test_cases.md` 中定义的魔法数据。
- 依赖真实的外部网络依赖或 Chrome Web Store 服务。
- 输出自动化测试脚本以外的无关讨论。

## Workflow

1. **解析 `/doc/3.detailed_test_cases.md`：**
   - 提取系统级与单元级测试用例列表及其元数据（ID、模块、浏览器环境、步骤、预期结果）。
2. **构建 `/src/test/` 测试基础设施：**
   - 生成配置文件 `config.js`。
   - 生成支持 Chrome/Edge 驱动与语言包切换的 `browser-manager.js` 及 `extension-utils.js`。
3. **生成用例实现脚本：**
   - 将系统级用例映射至 `/src/test/system/*.test.js`。
   - 将单元级用例按模块映射至 `/src/test/unit/*.test.js`。
4. **代码核对与完整性自检：**
   - 验证用例 ID 是否与 `/doc/3.detailed_test_cases.md` 完全 1:1 匹配。
   - 检查所有脚本代码是否均放在 `/src/test/` 目录下。
5. **输出代码与运行说明：**
   - 输出完整的测试文件代码块（附带文件路径路径注释）。
   - 提供在 Chrome / Edge 以及不同语言环境下的运行命令示例。

## Few-Shot Example

**Input:**
测试用例文档 `/doc/3.detailed_test_cases.md` 中关于存储与国际化的用例：
- `TC-UT-STG-001`: saveSettings 写入 Storage (Chrome & Edge, zh-CN, en)
- `TC-SYS-I18N-001`: Edge 浏览器下英文环境文本与 UI 适配

**Output:**

```javascript
// path: /src/test/config.js
import path from "node:path";

export const TEST_CONFIG = Object.freeze({
  sut: {
    extensionPath: process.env.SUT_EXTENSION_PATH ?? path.resolve(process.cwd(), "./dist"),
    browserType: process.env.TEST_BROWSER ?? "chrome", // 'chrome' | 'edge'
    locale: process.env.TEST_LOCALE ?? "zh-CN", // 'zh-CN' | 'en-US'
  },
  timeout: {
    system: 30000,
    unit: 10000,
    browserLaunch: 15000,
  },
  viewport: {
    width: 380,
    height: 600,
  },
});
JavaScript
// path: /src/test/helpers/browser-manager.js
import puppeteer from "puppeteer";
import { TEST_CONFIG } from "../config.js";

export async function launchBrowser(customOpts = {}) {
  const browserType = customOpts.browserType || TEST_CONFIG.sut.browserType;
  const locale = customOpts.locale || TEST_CONFIG.sut.locale;
  
  const args = [
    `--disable-extensions-except=${TEST_CONFIG.sut.extensionPath}`,
    `--load-extension=${TEST_CONFIG.sut.extensionPath}`,
    `--lang=${locale}`,
    "--no-first-run",
  ];

  // 支持 Chrome 与 Edge (Bing 浏览器) 路径配置
  const executablePath = browserType === "edge" 
    ? (process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe")
    : undefined; // 默认使用 puppeteer 自带的 chrome

  const launchOptions = {
    headless: false,
    defaultViewport: TEST_CONFIG.viewport,
    args,
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  return await puppeteer.launch(launchOptions);
}

export async function getExtensionId(browser) {
  const targets = browser.targets();
  const workerTarget = targets.find((t) => t.type() === "service_worker" || t.type() === "background_page");
  const url = workerTarget?.url() ?? "";
  const match = url.match(/chrome-extension:\/\/([a-z]+)/);
  if (!match) {
    throw new Error("[browser-manager] 找不到扩展 Service Worker，请确认构建产物及 manifest.json 正确");
  }
  return match[1];
}
JavaScript
// path: /src/test/unit/i18n-storage.test.js
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { launchBrowser, getExtensionId } from "../helpers/browser-manager.js";
import { TEST_CONFIG } from "../config.js";

describe.parallel("Storage & i18n 单元测试（黑盒）", () => {
  let browser;
  let extensionId;

  beforeAll(async () => {
    browser = await launchBrowser({ locale: "en-US" });
    extensionId = await getExtensionId(browser);
  }, TEST_CONFIG.timeout.browserLaunch);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  test("TC-UT-STG-001: saveSettings 正常写入 storage 并加载英文文本 [P0, Chrome & Edge]", async () => {
    // Arrange
    const page = await browser.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Act
    await page.waitForSelector("#save-btn");
    await page.click("#save-btn");

    // Assert
    const toastText = await page.$eval("#toast", (el) => el.textContent);
    expect(toastText).toMatch(/Settings saved|Saved successfully/i);
    await page.close();
  });
});
JSON
// path: /src/test/package.json
{
  "name": "browser-extension-blackbox-tests",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test:chrome:zh": "CROSS_ENV TEST_BROWSER=chrome TEST_LOCALE=zh-CN vitest run --dir src/test",
    "test:chrome:en": "CROSS_ENV TEST_BROWSER=chrome TEST_LOCALE=en-US vitest run --dir src/test",
    "test:edge:en": "CROSS_ENV TEST_BROWSER=edge TEST_LOCALE=en-US vitest run --dir src/test"
  },
  "devDependencies": {
    "puppeteer": "^22.0.0",
    "vitest": "^1.5.0"
  }
}
Input Data
处理严格包含在 <user_content> 标签内的内容：
<user_content>

测试用例文档
[在此粘贴 /doc/3.detailed_test_cases.md 全文内容]

被测产物信息
[在此粘贴扩展构建产物路径，如 ./dist 或 ./build]
</user_content>

Output Format
按以下顺序格式化输出：

测试架构与目录布局：展示在 /src/test/ 路径下的目录结构设计。

用例映射清单：表格列出 /doc/3.detailed_test_cases.md 用例 ID → /src/test/ 下的目标文件与测试函数名。

基础设施代码生成：输出 /src/test/config.js、/src/test/helpers/* 等工具代码。

测试套件代码生成：按系统级和单元级分类输出 /src/test/system/ 与 /src/test/unit/ 下的测试文件。

对齐自检摘要：校验用例覆盖率与 1:1 对齐情况。

运行与 CI 指令说明：提供在 Chrome/Edge 浏览器及中英文模式下运行 /src/test/ 自动化套件的命令行示例。