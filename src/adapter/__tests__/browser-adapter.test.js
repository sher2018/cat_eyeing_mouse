// path: src/adapter/__tests__/browser-adapter.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 用动态导入 + 注入 globalThis 桩来测试
function createChromeStub() {
  return {
    runtime: {
      getManifest: () => ({ manifest_version: 3 }),
      getURL: (p) => 'chrome-extension://abc/' + p,
      sendMessage: (m, cb) => cb && cb({ ok: true, echo: m }),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      lastError: null
    },
    storage: { local: { get: (k, cb) => cb && cb({}), set: (_i, cb) => cb && cb() } },
    i18n: {
      getMessage: (k) => ({ app_name: 'Cat' }[k] || ''),
      getUILanguage: () => 'zh-CN'
    }
  };
}

let originalChrome;
let originalBrowser;

describe('BrowserAdapter', () => {
  beforeEach(() => {
    originalChrome = globalThis.chrome;
    originalBrowser = globalThis.browser;
    delete globalThis.chrome;
    delete globalThis.browser;
  });
  afterEach(() => {
    if (originalChrome !== undefined) globalThis.chrome = originalChrome;
    else delete globalThis.chrome;
    if (originalBrowser !== undefined) globalThis.browser = originalBrowser;
    else delete globalThis.browser;
  });

  it('chrome 存在时 isChrome 为真', async () => {
    globalThis.chrome = createChromeStub();
    const mod = await import('../browser-adapter.js');
    const adapter = mod.browserAdapter;
    expect(adapter.isChrome()).toBe(true);
    expect(adapter.getEnvironment().browser).toBe('chrome');
    expect(adapter.getEnvironment().manifestVersion).toBe('3');
  });

  it('仅 browser 存在时回退成功', async () => {
    globalThis.browser = createChromeStub();
    const mod = await import('../browser-adapter.js');
    const adapter = mod.browserAdapter;
    expect(adapter.isChrome()).toBe(false);
    expect(adapter.runtime()).toBeDefined();
  });

  it('两者皆空时 ensureSupported 抛 UNSUPPORTED_ENV', async () => {
    const mod = await import('../browser-adapter.js');
    expect(() => mod.browserAdapter.ensureSupported()).toThrow();
  });

  it('storage.localGet 返回 Promise', async () => {
    globalThis.chrome = createChromeStub();
    globalThis.chrome.storage.local.get = (k, cb) => cb({ foo: 1 });
    const mod = await import('../browser-adapter.js');
    const result = await mod.browserAdapter.storage().localGet('foo');
    expect(result.foo).toBe(1);
  });

  it('runtime.getURL 拼接正确', async () => {
    globalThis.chrome = createChromeStub();
    const mod = await import('../browser-adapter.js');
    expect(mod.browserAdapter.runtime().getURL('res/move/1.png')).toContain('res/move/1.png');
  });

  it('runtime.sendMessage 以消息为首参调用（载荷不丢）', async () => {
    globalThis.chrome = createChromeStub();
    const sent = [];
    globalThis.chrome.runtime.sendMessage = (m, cb) => { sent.push(m); if (cb) cb({ ok: true }); };
    const mod = await import('../browser-adapter.js');
    const payload = { type: 'TOGGLE_VISIBLE' };
    await mod.browserAdapter.runtime().sendMessage(payload);
    expect(sent).toEqual([payload]);
  });

  it('i18n.getUILanguage 回退安全', async () => {
    globalThis.chrome = createChromeStub();
    const mod = await import('../browser-adapter.js');
    expect(mod.browserAdapter.i18n().getUILanguage()).toBe('zh-CN');
  });
});
