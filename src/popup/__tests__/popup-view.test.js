// path: src/popup/__tests__/popup-view.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPopupView, ERROR_CODES } from '../popup.js';

/** 最小化 DOM 桩：支持 getElementById / querySelectorAll / addEventListener。 */
function createDomStub() {
  const elements = {};

  function makeEl(id, attrs = {}) {
    const el = {
      id,
      tagName: attrs.tagName || 'div',
      style: {},
      textContent: attrs.textContent || '',
      disabled: false,
      checked: attrs.checked || false,
      _attrs: {},
      _listeners: {},
      getAttribute(name) { return this._attrs[name] || null; },
      setAttribute(name, val) { this._attrs[name] = val; },
      addEventListener(type, cb) { (this._listeners[type] = this._listeners[type] || []).push(cb); },
      removeEventListener() {},
      fire(type, payload) { for (const cb of (this._listeners[type] || [])) cb(payload); }
    };
    return el;
  }

  const toggleBtn = makeEl('btn-toggle', { tagName: 'button', textContent: 'Show' });
  toggleBtn.setAttribute('data-i18n-key', 'action_show');
  const clampInput = makeEl('btn-clamp', { tagName: 'input', checked: true });
  const titleEl = makeEl('popup-title', { textContent: 'Cat Eyeing Mouse' });
  titleEl.setAttribute('data-i18n-key', 'app_name');
  const tipEl = makeEl('tip', { textContent: 'Drag to move' });
  tipEl.setAttribute('data-i18n-key', 'tip_drag_to_move');
  const clampLabel = makeEl('clamp-label', { textContent: 'Clamp' });
  clampLabel.setAttribute('data-i18n-key', 'action_clamp_viewport');
  const iconEl = makeEl('icon');
  iconEl.className = 'cem-popup__icon';

  const registry = {
    'btn-toggle': toggleBtn,
    'btn-clamp': clampInput,
    'popup-title': titleEl
  };

  const documentStub = {
    getElementById: (id) => registry[id] || null,
    querySelector: (sel) => {
      if (sel === '.cem-popup__icon') return iconEl;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '[data-i18n-key]') {
        return [toggleBtn, titleEl, tipEl, clampLabel];
      }
      return [];
    },
    readyState: 'complete',
    addEventListener() {},
    removeEventListener() {}
  };

  return { documentStub, toggleBtn, clampInput, titleEl, tipEl, clampLabel, iconEl };
}

function createI18nStub(copy, locale = 'en') {
  return {
    t: vi.fn((key) => copy[key] || key),
    getLocale: vi.fn(() => locale),
    bulk: vi.fn((keys) => {
      const out = {};
      for (const k of keys) out[k] = copy[k] || k;
      return out;
    })
  };
}

function createAdapterStub({ settings = null, sendMessageImpl } = {}) {
  return {
    runtime: vi.fn(() => ({
      getURL: (p) => 'chrome-extension://abc/' + p,
      sendMessage: sendMessageImpl || vi.fn(async () => ({ ok: true }))
    })),
    storage: vi.fn(() => ({
      localGet: vi.fn(async (key) => (settings ? { [key]: settings } : {}))
    }))
  };
}

describe('PopupView', () => {
  let originalDocument;
  let originalWindow;
  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
  });
  afterEach(() => {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  });

  it('init 后填充当前语言文案到 data-i18n-key 元素', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const copy = { app_name: 'Cat', action_show: 'Show', action_hide: 'Hide', action_clamp_viewport: 'Clamp', tip_drag_to_move: 'Drag' };
    const view = createPopupView({ i18nService: createI18nStub(copy), adapter: createAdapterStub() });
    await view.init();
    expect(dom.titleEl.textContent).toBe('Cat');
    expect(dom.tipEl.textContent).toBe('Drag');
  });

  it('init 后图标背景注入 runtime.getURL', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const adapter = createAdapterStub();
    const view = createPopupView({ i18nService: createI18nStub({}), adapter });
    await view.init();
    expect(dom.iconEl.style.backgroundImage).toContain('chrome-extension://abc/');
  });

  it('读取 storage 同步 clamp 开关状态', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const adapter = createAdapterStub({ settings: { hidden: false, clampToViewport: false, locale: 'en' } });
    const view = createPopupView({ i18nService: createI18nStub({}), adapter });
    await view.init();
    expect(dom.clampInput.checked).toBe(false);
  });

  it('hidden=true 时 toggle 按钮文案为 action_show', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const copy = { action_show: 'Show', action_hide: 'Hide' };
    const adapter = createAdapterStub({ settings: { hidden: true, clampToViewport: true } });
    const view = createPopupView({ i18nService: createI18nStub(copy), adapter });
    await view.init();
    expect(dom.toggleBtn.textContent).toBe('Show');
    expect(dom.toggleBtn.getAttribute('data-i18n-key')).toBe('action_show');
  });

  it('hidden=false 时 toggle 按钮文案为 action_hide', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const copy = { action_show: 'Show', action_hide: 'Hide' };
    const adapter = createAdapterStub({ settings: { hidden: false, clampToViewport: true } });
    const view = createPopupView({ i18nService: createI18nStub(copy), adapter });
    await view.init();
    expect(dom.toggleBtn.textContent).toBe('Hide');
    expect(dom.toggleBtn.getAttribute('data-i18n-key')).toBe('action_hide');
  });

  it('点击 toggle 触发 onToggleVisible 回调并发送 TOGGLE_VISIBLE', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const send = vi.fn(async () => ({ ok: true }));
    const adapter = createAdapterStub({ sendMessageImpl: send });
    const onToggleVisible = vi.fn();
    const view = createPopupView({ i18nService: createI18nStub({}), adapter, onToggleVisible });
    await view.init();
    dom.toggleBtn.fire('click');
    expect(onToggleVisible).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: 'TOGGLE_VISIBLE' });
  });

  it('切换 clamp 触发 onClampChange(checked) 并发送 SET_CLAMP', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const send = vi.fn(async () => ({ ok: true }));
    const adapter = createAdapterStub({ sendMessageImpl: send });
    const onClampChange = vi.fn();
    const view = createPopupView({ i18nService: createI18nStub({}), adapter, onClampChange });
    await view.init();
    dom.clampInput.checked = false;
    dom.clampInput.fire('change');
    expect(onClampChange).toHaveBeenCalledWith(false);
    expect(send).toHaveBeenCalledWith({ type: 'SET_CLAMP', clamp: false });
  });

  it('i18n key 缺失 → 显示 key 本身', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const i18nNoKey = { t: () => '', getLocale: () => 'en', bulk: () => ({}) };
    const view = createPopupView({ i18nService: i18nNoKey, adapter: createAdapterStub() });
    await view.init();
    expect(dom.tipEl.textContent).toBe('tip_drag_to_move');
  });

  it('SW 通信失败 → 按钮保持可用且本地状态乐观翻转', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const copy = { action_show: 'Show', action_hide: 'Hide' };
    const send = vi.fn(async () => { throw new Error('sw down'); });
    const adapter = createAdapterStub({ sendMessageImpl: send, settings: { hidden: false, clampToViewport: true } });
    const view = createPopupView({ i18nService: createI18nStub(copy), adapter });
    await view.init();
    expect(dom.toggleBtn.textContent).toBe('Hide');
    dom.toggleBtn.fire('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(dom.toggleBtn.disabled).toBe(false);
    expect(dom.toggleBtn.textContent).toBe('Show');
    expect(dom.toggleBtn.getAttribute('data-i18n-key')).toBe('action_show');
  });

  it('render 重新填充文案', async () => {
    const dom = createDomStub();
    globalThis.document = dom.documentStub;
    const copy = { app_name: 'Cat', action_show: 'Show', action_hide: 'Hide', action_clamp_viewport: 'Clamp', tip_drag_to_move: 'Drag' };
    const view = createPopupView({ i18nService: createI18nStub(copy), adapter: createAdapterStub() });
    dom.titleEl.textContent = 'TEMP';
    view.render();
    expect(dom.titleEl.textContent).toBe('Cat');
  });

  it('ERROR_CODES 导出 SW_COMM_FAIL', () => {
    expect(ERROR_CODES.SW_COMM_FAIL).toBe('SW_COMM_FAIL');
  });
});
