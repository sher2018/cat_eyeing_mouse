// path: src/background/__tests__/service-worker.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupServiceWorker, ERROR_CODES } from '../service-worker.js';

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

  it('SET_CLAMP → 写回 clampToViewport + 广播带 clamp', async () => {
    const sw = setupServiceWorker({ adapter, storageService: storage });
    await sw.handler({ type: 'SET_CLAMP', clamp: false });
    expect(storage._current().clampToViewport).toBe(false);
    expect(adapter._sendMessage).toHaveBeenCalledWith({ type: 'SET_CLAMP', clamp: false });
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
});
