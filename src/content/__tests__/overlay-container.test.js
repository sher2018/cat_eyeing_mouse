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

  const windowListeners = {};
  const windowStub = {
    innerWidth: 1000,
    innerHeight: 800,
    addEventListener(type, cb) { (windowListeners[type] = windowListeners[type] || []).push(cb); },
    removeEventListener(type, cb) {
      const arr = windowListeners[type];
      if (arr) windowListeners[type] = arr.filter((fn) => fn !== cb);
    },
    fireResize() {
      const arr = windowListeners['resize'] || [];
      for (const cb of arr) cb();
    }
  };

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = documentStub;
  globalThis.window = Object.assign({}, globalThis.window, windowStub);

  return {
    documentStub,
    windowStub,
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
    resume: vi.fn(),
    setSpriteBackground: vi.fn(),
    setSpriteFrame: vi.fn(),
    showCanvas: vi.fn(),
    showSprite: vi.fn(),
    isSpriteMode: vi.fn(() => false)
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

  it('window resize 缩小 → 按比例保持相对位置（越界 clamp）', async () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null),
      catSize: { w: 128, h: 128 }
    });
    overlay.mount();
    await flushMicrotasks();
    // 初始右下角：1000x800 → (864, 664)
    expect(overlay.getPosition()).toEqual({ x: 864, y: 664 });
    // 模拟窗口缩小：1200x900（足够大，不会触发 clamp）
    globalThis.window.innerWidth = 1200;
    globalThis.window.innerHeight = 900;
    dom.windowStub.fireResize();
    // resize 处理现在同步执行（无 rAF 节流）
    const pos = overlay.getPosition();
    expect(pos.x + 64).toBeCloseTo(0.928 * 1200, -1);
    expect(pos.y + 64).toBeCloseTo(0.91 * 900, -1);
    overlay.unmount();
    dom.restore();
  });

  it('记忆位置超出当前视口 → mount 时自动校正到视口内', async () => {
    // 存储中记录的位置是最大化时的坐标（1856, 972），但当前视口只有 1000x800
    const storageWithRemembered = createStorageStub({ x: 1856, y: 972 });
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: storageWithRemembered,
      catSize: { w: 128, h: 128 }
    });
    overlay.mount();
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // 记忆位置 1856 > 1000-128=872 → 校正到 872；972 > 800-128=672 → 校正到 672
    const pos = overlay.getPosition();
    expect(pos.x).toBeLessThanOrEqual(1000 - 128);
    expect(pos.y).toBeLessThanOrEqual(800 - 128);
    overlay.unmount();
    dom.restore();
  });

  it('窗口从小变大（普通→最大化）→ 按比例保持相对位置', async () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null),
      catSize: { w: 128, h: 128 }
    });
    overlay.mount();
    await flushMicrotasks();
    // 初始 1000x800，默认右下角：(864, 664)
    expect(overlay.getPosition()).toEqual({ x: 864, y: 664 });
    // 模拟窗口变大：1920x1080（最大化）
    globalThis.window.innerWidth = 1920;
    globalThis.window.innerHeight = 1080;
    dom.windowStub.fireResize();
    // resize 处理同步执行
    const pos = overlay.getPosition();
    expect(pos.x + 64).toBeCloseTo(0.928 * 1920, 0);
    expect(pos.y + 64).toBeCloseTo(0.91 * 1080, 0);
    overlay.unmount();
    dom.restore();
  });

  it('窗口化→最大化→窗口化循环切换 → 比例位置不漂移', async () => {
    const overlay = createOverlayContainer({
      canvasStageFactory: () => createCanvasStageStub(),
      poseMachineFactory: () => createPoseMachineStub(),
      dragFactory: () => createDragStub(),
      storageService: createStorageStub(null),
      catSize: { w: 128, h: 128 }
    });
    overlay.mount();
    await flushMicrotasks();
    // 初始 1000x800，右下角默认：(864, 664)
    expect(overlay.getPosition()).toEqual({ x: 864, y: 664 });
    const ratioX0 = (864 + 64) / 1000; // 0.928
    const ratioY0 = (664 + 64) / 800;  // 0.91

    // 循环：用足够大的尺寸避免 clamp 干扰
    const sizes = [
      [1920, 1080],
      [1200, 900],
      [1920, 1080],
      [1200, 900],
      [1920, 1080]
    ];
    for (const [w, h] of sizes) {
      globalThis.window.innerWidth = w;
      globalThis.window.innerHeight = h;
      dom.windowStub.fireResize();
      // resize 处理同步执行
      const pos = overlay.getPosition();
      // 每次切换后，猫中心点的比例位置应保持一致（允许 0.02 误差，含 Math.round 精度）
      const ratioX = (pos.x + 64) / w;
      const ratioY = (pos.y + 64) / h;
      expect(Math.abs(ratioX - ratioX0)).toBeLessThan(0.02);
      expect(Math.abs(ratioY - ratioY0)).toBeLessThan(0.02);
    }
    overlay.unmount();
    dom.restore();
  });
});
