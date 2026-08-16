// path: src/background/__tests__/service-worker.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setupServiceWorker, ERROR_CODES } from '../service-worker.js';
import { createToggleController } from '../../content/toggle-controller.js';

function createAdapterStub({ sendMessageImpl } = {}) {
  let registeredHandler = null;
  const sendMessage = sendMessageImpl || vi.fn(async () => ({ ok: true }));
  return {
    _capturedHandler: () => registeredHandler,
    runtime: vi.fn(() => ({
      onMessage: vi.fn((cb) => { registeredHandler = cb; return () => { registeredHandler = null; }; }),
      sendMessage
    })),
    _sendMessage: sendMessage
  };
}

/** 带 tabs 通道的 adapter 桩：模拟真实 Chrome/Edge 广播路径（优先 tabs.sendMessage）。 */
function createTabsAdapterStub({ tabs = [], tabSendImpl } = {}) {
  const base = createAdapterStub();
  const tabSend = tabSendImpl || vi.fn(async () => ({ ok: true }));
  return Object.assign(base, {
    tabs: vi.fn(() => ({
      query: vi.fn(async () => tabs),
      sendMessage: tabSend
    })),
    _tabSend: tabSend
  });
}

function createStorageStub(settings) {
  let current = Object.assign({}, settings);
  return {
    getSettings: vi.fn(async () => ({ ok: true, value: current })),
    setSettings: vi.fn(async (patch) => {
      current = Object.assign({}, current, patch);
      return { ok: true };
    }),
    _current: () => current
  };
}

describe('ServiceWorker', () => {
  let adapter;
  let storage;
  beforeEach(() => {
    adapter = createAdapterStub();
    storage = createStorageStub({ hidden: false, clampToViewport: true, locale: 'en' });
  });

  it('setupServiceWorker 注册 onMessage 并返回 handler/broadcast', () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    expect(typeof sw.handler).toBe('function');
    expect(typeof sw.broadcast).toBe('function');
    expect(typeof sw.dispose).toBe('function');
    expect(adapter._capturedHandler()).toBe(sw.handler);
  });

  it('TOGGLE_VISIBLE → 翻转 hidden 写回 + 广播 TOGGLE_VISIBLE', async () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.handler({ type: 'TOGGLE_VISIBLE' });
    expect(storage.setSettings).toHaveBeenCalled();
    expect(storage._current().hidden).toBe(true);
    expect(adapter._sendMessage).toHaveBeenCalledWith({ type: 'TOGGLE_VISIBLE' });
  });

  it('连续两次 TOGGLE_VISIBLE 回到初始 hidden', async () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.handler({ type: 'TOGGLE_VISIBLE' });
    await sw.handler({ type: 'TOGGLE_VISIBLE' });
    expect(storage._current().hidden).toBe(false);
  });

  it('未知 type → 忽略且不广播、不写设置', async () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.handler({ type: 'NOT_A_REAL_TYPE' });
    expect(storage.setSettings).not.toHaveBeenCalled();
    expect(adapter._sendMessage).not.toHaveBeenCalled();
  });

  it('null/非对象消息 → 忽略（MSG_TYPE_INVALID）', async () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.handler(null);
    await sw.handler('string');
    expect(adapter._sendMessage).not.toHaveBeenCalled();
  });

  it('ACK → 仅记 INFO，不写设置不广播', async () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.handler({ type: 'ACK', ok: true });
    expect(storage.setSettings).not.toHaveBeenCalled();
    expect(adapter._sendMessage).not.toHaveBeenCalled();
  });

  it('SETTINGS_UPDATED 合法 → 广播转发', async () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.handler({ type: 'SETTINGS_UPDATED', settings: { hidden: true } });
    expect(adapter._sendMessage).toHaveBeenCalledWith({ type: 'SETTINGS_UPDATED' });
  });

  it('storage 失败 → 仍广播内存态设置', async () => {
    const failingStorage = createStorageStub({ hidden: false, clampToViewport: true });
    failingStorage.getSettings.mockRejectedValue(new Error('storage down'));
    const sw = setupServiceWorker({ adapter, storageService: failingStorage });
    await sw.handler({ type: 'TOGGLE_VISIBLE' });
    expect(adapter._sendMessage).toHaveBeenCalledWith({ type: 'TOGGLE_VISIBLE' });
  });

  it('broadcast 直接调用经 runtime.sendMessage', async () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.broadcast({ type: 'SETTINGS_UPDATED' });
    expect(adapter._sendMessage).toHaveBeenCalledWith({ type: 'SETTINGS_UPDATED' });
  });

  it('broadcast runtime.sendMessage 抛错 → 记 CONTENT_NO_ACK 不上抛', async () => {
    const failAdapter = createAdapterStub({ sendMessageImpl: async () => { throw new Error('no receiver'); } });
    const sw = setupServiceWorker({ adapter: failAdapter, storageService: storage });
    await expect(sw.broadcast({ type: 'SETTINGS_UPDATED' })).resolves.toBeUndefined();
  });

  it('adapter 缺失时 setup 不抛错', () => {
    expect(() => setupServiceWorker({ storageService: storage })).not.toThrow();
  });

  it('dispose 调用不抛错', () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    expect(() => sw.dispose()).not.toThrow();
  });

  it('ERROR_CODES 导出 CONTENT_NO_ACK / MSG_TYPE_INVALID', () => {
    expect(ERROR_CODES.CONTENT_NO_ACK).toBe('CONTENT_NO_ACK');
    expect(ERROR_CODES.MSG_TYPE_INVALID).toBe('MSG_TYPE_INVALID');
  });

  it('SW 源码不含动态 import()（SW 全局禁用，曾致 handler 永不执行的回归保护）', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../service-worker.js'), 'utf8');
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
      .replace(/\/\/[^\n]*/g, ''); // 行注释
    expect(stripped).not.toMatch(/\bimport\s*\(/);
  });
});

describe('ServiceWorker 广播（tabs 通路）', () => {
  it('TOGGLE_VISIBLE → 经 tabs.sendMessage 广播到每个 tab', async () => {
    const adapter = createTabsAdapterStub({ tabs: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const storage = createStorageStub({ hidden: false });
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.handler({ type: 'TOGGLE_VISIBLE' });
    expect(adapter._tabSend).toHaveBeenCalledTimes(3);
    expect(adapter._tabSend).toHaveBeenCalledWith(1, { type: 'TOGGLE_VISIBLE' });
    expect(adapter._tabSend).toHaveBeenCalledWith(3, { type: 'TOGGLE_VISIBLE' });
    // 优先 tabs 时不再走 runtime.sendMessage，避免 popup 重复收到
    expect(adapter._sendMessage).not.toHaveBeenCalled();
  });

  it('单个 tab 无接收者（chrome:// 页）→ 跳过该 tab，其余仍收到', async () => {
    const adapter = createTabsAdapterStub({
      tabs: [{ id: 1 }, { id: 2 }],
      tabSendImpl: vi.fn(async (tabId) => {
        if (tabId === 1) throw new Error('Could not establish connection');
        return { ok: true };
      })
    });
    const storage = createStorageStub({ hidden: false });
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await expect(sw.handler({ type: 'TOGGLE_VISIBLE' })).resolves.toBeUndefined();
    expect(adapter._tabSend).toHaveBeenCalledTimes(2);
  });

  it('tabs.query 抛错 → 容错不上抛（broadcast 捕获记 WARN）', async () => {
    const base = createAdapterStub();
    const adapter = Object.assign(base, {
      tabs: vi.fn(() => ({
        query: vi.fn(async () => { throw new Error('query boom'); }),
        sendMessage: vi.fn(async () => ({ ok: true }))
      }))
    });
    const storage = createStorageStub({ hidden: false });
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await expect(sw.handler({ type: 'TOGGLE_VISIBLE' })).resolves.toBeUndefined();
  });
});

describe('显隐链路集成（popup → SW → content toggle）', () => {
  function createOverlayStub() {
    return { mount: vi.fn(), unmount: vi.fn(), getHost: vi.fn(() => null) };
  }

  it('点击隐藏：SW 翻转 storage 并广播，content toggle 卸载 overlay', async () => {
    const overlay = createOverlayStub();
    const toggle = createToggleController({ overlayContainer: overlay });
    const adapter = createTabsAdapterStub({ tabs: [{ id: 7 }] });
    const storage = createStorageStub({ hidden: false });
    const sw = setupServiceWorker({ adapter, storageService: storage });

    await sw.handler({ type: 'TOGGLE_VISIBLE' }); // popup 点击"隐藏"
    expect(storage._current().hidden).toBe(true);
    const [, broadcastMsg] = adapter._tabSend.mock.calls[0]; // content 收到广播
    expect(broadcastMsg).toEqual({ type: 'TOGGLE_VISIBLE' });
    toggle.toggle(); // content-main.onMessage 执行
    expect(toggle.isVisible()).toBe(false);
    expect(overlay.unmount).toHaveBeenCalledTimes(1);
    expect(storage._current().hidden).toBe(true); // 终态一致，无回写污染
  });

  it('点击显示：再次翻转广播，content toggle 重新挂载', async () => {
    const overlay = createOverlayStub();
    const toggle = createToggleController({ overlayContainer: overlay });
    const adapter = createTabsAdapterStub({ tabs: [{ id: 7 }] });
    const storage = createStorageStub({ hidden: false });
    const sw = setupServiceWorker({ adapter, storageService: storage });

    await sw.handler({ type: 'TOGGLE_VISIBLE' });
    toggle.toggle(); // 隐藏
    await sw.handler({ type: 'TOGGLE_VISIBLE' }); // popup 点击"显示"
    expect(storage._current().hidden).toBe(false);
    toggle.toggle(); // 显示
    expect(toggle.isVisible()).toBe(true);
    expect(overlay.mount).toHaveBeenCalledTimes(1);
    expect(storage._current().hidden).toBe(false);
  });

  it('快速双击：storage 终态与 content 状态一致（消除双写竞态回归）', async () => {
    const overlay = createOverlayStub();
    const toggle = createToggleController({ overlayContainer: overlay });
    const adapter = createTabsAdapterStub({ tabs: [{ id: 7 }] });
    const storage = createStorageStub({ hidden: false });
    const sw = setupServiceWorker({ adapter, storageService: storage });

    await sw.handler({ type: 'TOGGLE_VISIBLE' });
    toggle.toggle();
    await sw.handler({ type: 'TOGGLE_VISIBLE' });
    toggle.toggle();

    expect(toggle.isVisible()).toBe(true);
    expect(overlay.mount).toHaveBeenCalledTimes(1);
    expect(storage._current().hidden).toBe(false); // 旧值不再覆盖新值
  });
});
