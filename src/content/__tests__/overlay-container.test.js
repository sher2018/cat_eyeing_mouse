// path: src/content/__tests__/overlay-container.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOverlayContainer, CONFIG, ERROR_CODES } from '../overlay-container.js';

/**
 * 最小化 DOM 桩（无需 jsdom 依赖）。
 * 提供 createElement / body / addEventListener / attachShadow 等必要能力。
 */
function createDomStub({ attachShadowThrows = false } = {}) {
  const listeners = {};
  const mouseEnterLeave = {};

  function makeElement(tag) {
    const el = {
      tagName: tag,
      style: {},
      className: '',
      id: '',
      textContent: '',
      parentNode: null,
      children: [],
      appendChild(child) {
        el.children.push(child);
        child.parentNode = el;
        return child;
      },
      removeChild(child) {
        el.children = el.children.filter((c) => c !== child);
        if (child.parentNode === el) child.parentNode = null;
        return child;
      },
      addEventListener(type, cb) {
        if (type === 'mouseenter' || type === 'mouseleave') {
          (mouseEnterLeave[type] = mouseEnterLeave[type] || []).push(cb);
        } else {
          (listeners[type] = listeners[type] || []).push(cb);
        }
      },
      removeEventListener(type, cb) {
        const arr = listeners[type];
        if (arr) listeners[type] = arr.filter((fn) => fn !== cb);
        const m = mouseEnterLeave[type];
        if (m) mouseEnterLeave[type] = m.filter((fn) => fn !== cb);
      },
      setAttribute() {},
      attachShadow() {
        if (attachShadowThrows) throw new Error('attachShadow disabled');
        const shadow = makeElement('#shadow-root');
        shadow.appendChild = (child) => {
          shadow.children.push(child);
          child.parentNode = shadow;
          return child;
        };
        return shadow;
      },
      fire(type, payload) {
        const arr = listeners[type] || [];
        for (const cb of arr) cb(payload);
      }
    };
    return el;
  }

  const body = makeElement('body');
  const documentStub = {
    createElement: (tag) => makeElement(tag),
    body,
    addEventListener(type, cb) { (listeners[type] = listeners[type] || []).push(cb); },
    removeEventListener(type, cb) {
      const arr = listeners[type];
      if (arr) listeners[type] = arr.filter((fn) => fn !== cb);
    },
    fire(type, payload) {
      const arr = listeners[type] || [];
      for (const cb of arr) cb(payload);
    },
    fireHover(type) {
      const arr = mouseEnterLeave[type] || [];
      for (const cb of arr) cb({});
    }
  };

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = documentStub;
  globalThis.window = Object.assign({}, globalThis.window, { innerWidth: 1000, innerHeight: 800 });

  return {
    documentStub,
    body,
    restore() {
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    }
  };
}

function createStorageStub(position) {
  return {
    getPosition: vi.fn(async () => position
      ? { ok: true, value: position }
      : { ok: true, value: null }),
    setPosition: vi.fn(async () => ({ ok: true })),
    getSettings: vi.fn(async () => ({ ok: true, value: { hidden: false, clampToViewport: true, locale: 'en' } })),
    setSettings: vi.fn(async () => ({ ok: true }))
  };
}

function createCanvasStageStub() {
  return {
    mount: vi.fn(),
    unmount: vi.fn(),
    drawImage: vi.fn(),
    requestFrame: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn()
  };
}

function createPoseMachineStub() {
  return {
    update: vi.fn(),
    setHover: vi.fn(),
    current: vi.fn(() => 0),
    onPoseChange: vi.fn(() => () => {}),
    onHoverChange: vi.fn(() => () => {}),
    enterResting: vi.fn(),
    exitResting: vi.fn()
  };
}

function createDragStub() {
  return {
    bind: vi.fn(),
    isDragging: vi.fn(() => false),
    onDragMove: vi.fn((cb) => () => cb),
    onDrop: vi.fn(() => () => {})
  };
}

/** 排空所有 pending 微任务（mount 内 applyInitialPosition 为异步链）。 */
function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('OverlayContainer', () => {
  let dom;
  beforeEach(() => {
    dom = createDomStub();
  });

  it('mount 后状态为 MOUNTED，宿主 div 挂入 body', () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null)
    });
    overlay.mount();
    expect(dom.body.children.length).toBeGreaterThan(0);
    overlay.unmount();
    dom.restore();
  });

  it('无记忆坐标 → 默认右下角贴边（≤ GAP + catSize）', async () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null),
      catSize: { w: 128, h: 128 }
    });
    overlay.mount();
    await flushMicrotasks();
    const pos = overlay.getPosition();
    // viewport 1000x800 → x=1000-128-8=864, y=800-128-8=664
    expect(pos.x).toBe(864);
    expect(pos.y).toBe(664);
    overlay.unmount();
    dom.restore();
  });

  it('有记忆坐标 → setPosition 应用记忆值', async () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub({ x: 100, y: 200 })
    });
    overlay.mount();
    await flushMicrotasks();
    expect(overlay.getPosition()).toEqual({ x: 100, y: 200 });
    overlay.unmount();
    dom.restore();
  });

  it('setPosition/getPosition/getCatCenter 正确换算', () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null),
      catSize: { w: 100, h: 100 }
    });
    overlay.mount();
    overlay.setPosition({ x: 50, y: 60 });
    expect(overlay.getPosition()).toEqual({ x: 50, y: 60 });
    expect(overlay.getCatCenter()).toEqual({ x: 100, y: 110 });
    overlay.unmount();
    dom.restore();
  });

  it('setPosition 忽略非法坐标', () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null)
    });
    overlay.mount();
    overlay.setPosition({ x: 10, y: 20 });
    overlay.setPosition({ x: NaN, y: 5 });
    expect(overlay.getPosition()).toEqual({ x: 10, y: 20 });
    overlay.unmount();
    dom.restore();
  });

  it('mount 装配 canvasStage 与 poseMachine，bind drag 到 catLayer', () => {
    const canvasStage = createCanvasStageStub();
    const poseMachine = createPoseMachineStub();
    const drag = createDragStub();
    const overlay = createOverlayContainer({
      canvasStageFactory: () => canvasStage,
      poseMachineFactory: () => poseMachine,
      dragFactory: () => drag,
      storageService: createStorageStub(null)
    });
    overlay.mount();
    expect(canvasStage.mount).toHaveBeenCalledTimes(1);
    expect(drag.bind).toHaveBeenCalledTimes(1);
    overlay.unmount();
    dom.restore();
  });

  it('document mousemove → poseMachine.update(pointer, catCenter)', () => {
    const poseMachine = createPoseMachineStub();
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => poseMachine,
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null)
    });
    overlay.mount();
    overlay.setPosition({ x: 0, y: 0 });
    dom.documentStub.fire('mousemove', { clientX: 300, clientY: 400 });
    expect(poseMachine.update).toHaveBeenCalledTimes(1);
    const args = poseMachine.update.mock.calls[0];
    expect(args[0]).toEqual({ x: 300, y: 400 });
    overlay.unmount();
    dom.restore();
  });

  it('mouseenter/leave → poseMachine.setHover', () => {
    const poseMachine = createPoseMachineStub();
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => poseMachine,
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null)
    });
    overlay.mount();
    dom.documentStub.fireHover('mouseenter');
    expect(poseMachine.setHover).toHaveBeenCalledWith(true);
    dom.documentStub.fireHover('mouseleave');
    expect(poseMachine.setHover).toHaveBeenCalledWith(false);
    overlay.unmount();
    dom.restore();
  });

  it('unmount 后 mousemove 不再触发 poseMachine.update', () => {
    const poseMachine = createPoseMachineStub();
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => poseMachine,
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null)
    });
    overlay.mount();
    overlay.unmount();
    poseMachine.update.mockClear();
    dom.documentStub.fire('mousemove', { clientX: 1, clientY: 2 });
    expect(poseMachine.update).not.toHaveBeenCalled();
    dom.restore();
  });

  it('mount 幂等：重复 mount 先卸载再挂载', () => {
    const canvasStage = createCanvasStageStub();
    const overlay = createOverlayContainer({
      canvasStageFactory: () => canvasStage,
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null)
    });
    overlay.mount();
    overlay.mount();
    // 至少挂载 2 次，unmount 至少 1 次（重入卸载）
    expect(canvasStage.mount.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(canvasStage.unmount.mock.calls.length).toBeGreaterThanOrEqual(1);
    overlay.unmount();
    dom.restore();
  });

  it('setPointerEvents 在 auto/none 间切换', () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null)
    });
    overlay.mount();
    overlay.setPointerEvents('none');
    // 通过再次设 auto 验证不抛错
    overlay.setPointerEvents('auto');
    overlay.unmount();
    dom.restore();
  });

  it('attachShadow 失败 → 降级 iframe（记 WARN）', () => {
    const localDom = createDomStub({ attachShadowThrows: true });
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null)
    });
    expect(() => overlay.mount()).not.toThrow();
    expect(localDom.body.children.length).toBeGreaterThan(0);
    overlay.unmount();
    localDom.restore();
  });

  it('工厂未注入时不抛错（防御）', () => {
    const overlay = createOverlayContainer({
      storageService: createStorageStub(null)
    });
    expect(() => overlay.mount()).not.toThrow();
    overlay.unmount();
    dom.restore();
  });

  it('drag onDragMove 回调驱动 setPosition', async () => {
    const drag = createDragStub();
    let moveCb = null;
    drag.onDragMove = vi.fn((cb) => { moveCb = cb; return () => {}; });
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => drag,
      storageService: createStorageStub(null)
    });
    overlay.mount();
    await flushMicrotasks();
    if (moveCb) moveCb({ x: 12, y: 34 });
    expect(overlay.getPosition()).toEqual({ x: 12, y: 34 });
    overlay.unmount();
    dom.restore();
  });

  it('ERROR_CODES 与 CONFIG 常量导出', () => {
    expect(ERROR_CODES.SHADOW_UNAVAILABLE).toBe('SHADOW_UNAVAILABLE');
    expect(ERROR_CODES.HOST_NOT_FOUND).toBe('HOST_NOT_FOUND');
    expect(CONFIG.Z_INDEX).toBe(2147483647);
    expect(CONFIG.DEFAULT_EDGE_GAP_PX).toBe(8);
    expect(CONFIG.CAT_SIZE).toEqual({ w: 128, h: 128 });
  });
});
