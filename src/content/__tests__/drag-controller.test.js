// @vitest-environment jsdom
// path: src/content/__tests__/drag-controller.test.js
// M-10 DragController 单元测试（DDS §11.10）。
// 覆盖跨浏览器健壮性：多指针隔离、blur/hidden 取消、原生行为拦截、光标反馈。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDragController } from '../drag-controller.js';

const MOUSE_POINTER_ID = 1;
const TOUCH_POINTER_ID = 2;

function makeTarget(rect) {
  const listeners = {};
  const el = {
    width: rect.width,
    height: rect.height,
    addEventListener: vi.fn((type, cb) => { listeners[type] = cb; }),
    removeEventListener: vi.fn((type) => { delete listeners[type]; }),
    getBoundingClientRect: () => rect
  };
  return { el, listeners };
}

/** fire 事件默认模拟鼠标主键按下状态（pointerId=1），可用 extra 覆盖。 */
function fire(listeners, type, x, y, extra = {}) {
  const handler = listeners[type];
  if (typeof handler === 'function') {
    handler({ clientX: x, clientY: y, button: 0, buttons: 1, pointerId: MOUSE_POINTER_ID, ...extra });
  }
}

describe('DragController', () => {
  let winListeners = {};
  let docListeners = {};

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    winListeners = {};
    docListeners = {};
    vi.spyOn(window, 'addEventListener').mockImplementation((type, cb) => { winListeners[type] = cb; });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type) => { delete winListeners[type]; });
    vi.spyOn(document, 'addEventListener').mockImplementation((type, cb) => { docListeners[type] = cb; });
    vi.spyOn(document, 'removeEventListener').mockImplementation((type) => { delete docListeners[type]; });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // jsdom 的 document 在同文件用例间共享：清理可能泄漏的拖拽反馈样式
    document.documentElement.style.cursor = '';
    document.documentElement.style.userSelect = '';
  });

  it('模拟 pointer 序列 → onDragMove/onDrop 触发', () => {
    const { el, listeners } = makeTarget({ left: 100, top: 100, width: 64, height: 64 });
    const moves = [];
    const drops = [];
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDragMove((p) => moves.push(p));
    drag.onDrop((p) => drops.push(p));
    drag.bind(el);

    fire(listeners, 'pointerdown', 110, 110);
    fire(winListeners, 'pointermove', 140, 130); // dx=30,dy=20 > 阈值
    expect(drag.isDragging()).toBe(true);
    expect(moves.length).toBe(1);
    expect(moves[0]).toEqual({ x: 130, y: 120 });

    fire(winListeners, 'pointerup', 150, 150);
    expect(drops.length).toBe(1);
    expect(drops[0]).toEqual({ x: 140, y: 140 });
  });

  it('移动小于阈值不进入 Dragging', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const moves = vi.fn();
    const drag = createDragController({ storageService: null, moveThreshold: 10, clampToViewport: false });
    drag.onDragMove(moves);
    drag.bind(el);
    fire(listeners, 'pointerdown', 0, 0);
    fire(winListeners, 'pointermove', 5, 5);
    expect(drag.isDragging()).toBe(false);
    expect(moves).not.toHaveBeenCalled();
  });

  it('CLAMP 开启时坐标被收回视口', () => {
    const { el, listeners } = makeTarget({ left: 900, top: 700, width: 128, height: 128 });
    const moves = [];
    const drag = createDragController({ storageService: null, clampToViewport: true, edgeMargin: 0 });
    drag.onDragMove((p) => moves.push(p));
    drag.bind(el);
    fire(listeners, 'pointerdown', 900, 700);
    // 向右下拖到越界：dx=200,dy=200 → raw={1100,900}，应被钳制
    fire(winListeners, 'pointermove', 1100, 900);
    const last = moves[moves.length - 1];
    expect(last.x).toBeLessThanOrEqual(1000 - 128);
    expect(last.y).toBeLessThanOrEqual(800 - 128);
  });

  it('storage 失败不崩（onDrop 仍触发）', async () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const failingStorage = {
      setPosition: vi.fn().mockResolvedValue({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } })
    };
    const drops = vi.fn();
    const drag = createDragController({ storageService: failingStorage, clampToViewport: false });
    drag.onDrop(drops);
    drag.bind(el);
    fire(listeners, 'pointerdown', 0, 0);
    fire(winListeners, 'pointermove', 50, 50);
    fire(winListeners, 'pointerup', 50, 50);
    expect(drops).toHaveBeenCalledTimes(1);
    expect(failingStorage.setPosition).toHaveBeenCalled();
  });

  it('unbind 后不再响应', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const moves = vi.fn();
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDragMove(moves);
    drag.bind(el);
    drag.unbind();
    fire(listeners, 'pointerdown', 0, 0);
    fire(winListeners, 'pointermove', 100, 100);
    expect(moves).not.toHaveBeenCalled();
  });

  it('悬停移动（未按住左键）不触发跟随且清理残留起点', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const moves = vi.fn();
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDragMove(moves);
    drag.bind(el);
    fire(listeners, 'pointerdown', 0, 0);
    // 悬停：左键未按住 → 不移动，且复位待拖状态
    fire(winListeners, 'pointermove', 100, 100, { buttons: 0 });
    expect(moves).not.toHaveBeenCalled();
    expect(drag.isDragging()).toBe(false);
    // 复位后即使按住移动，也不会从残留起点恢复拖拽
    fire(winListeners, 'pointermove', 200, 200, { buttons: 1 });
    expect(moves).not.toHaveBeenCalled();
  });

  it('指针在猫外释放（window pointerup）后悬停不再跟随', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const moves = vi.fn();
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDragMove(moves);
    drag.bind(el);
    fire(listeners, 'pointerdown', 10, 10);
    fire(winListeners, 'pointermove', 200, 200); // 拖拽中指针移出猫图层
    expect(drag.isDragging()).toBe(true);
    expect(moves).toHaveBeenCalledTimes(1);
    fire(winListeners, 'pointerup', 220, 220); // 在猫图层外释放，仅 window 收到
    expect(drag.isDragging()).toBe(false);
    // 释放后悬停经过猫 → 不再跟随
    fire(winListeners, 'pointermove', 400, 400, { buttons: 0 });
    expect(moves).toHaveBeenCalledTimes(1);
  });

  it('非主键 pointerdown 不进入拖拽', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const moves = vi.fn();
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDragMove(moves);
    drag.bind(el);
    fire(listeners, 'pointerdown', 0, 0, { button: 2, buttons: 2 }); // 右键
    fire(winListeners, 'pointermove', 100, 100);
    expect(drag.isDragging()).toBe(false);
    expect(moves).not.toHaveBeenCalled();
  });

  it('第二触点（不同 pointerId）不劫持鼠标拖拽', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const moves = [];
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDragMove((p) => moves.push(p));
    drag.bind(el);
    fire(listeners, 'pointerdown', 10, 10); // 鼠标 pointerId=1
    fire(winListeners, 'pointermove', 100, 100); // 鼠标拖拽
    expect(moves.length).toBe(1);
    // 触屏第二触点在别处移动（pointerId=2，buttons=1）→ 必须被忽略
    fire(winListeners, 'pointermove', 500, 400, { pointerId: TOUCH_POINTER_ID });
    expect(moves.length).toBe(1);
    // 触屏第二触点抬起也不得终止鼠标拖拽
    fire(winListeners, 'pointerup', 500, 400, { pointerId: TOUCH_POINTER_ID });
    expect(drag.isDragging()).toBe(true);
    // 鼠标继续拖拽仍正常
    fire(winListeners, 'pointermove', 150, 150);
    expect(moves.length).toBe(2);
    expect(moves[1]).toEqual({ x: 140, y: 140 });
    // 释放鼠标指针结束拖拽（避免 grabbing 光标泄漏到共享 document）
    fire(winListeners, 'pointerup', 150, 150);
    expect(drag.isDragging()).toBe(false);
  });

  it('拖拽中新触点 pointerdown 命中猫图层也不抢夺当前拖拽', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const moves = [];
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDragMove((p) => moves.push(p));
    drag.bind(el);
    fire(listeners, 'pointerdown', 10, 10); // 鼠标开始拖拽
    fire(winListeners, 'pointermove', 100, 100);
    expect(moves.length).toBe(1);
    // 触屏第二触点直接按到猫图层上（pointerdown 重新命中 target）
    fire(listeners, 'pointerdown', 30, 30, { pointerId: TOUCH_POINTER_ID });
    fire(winListeners, 'pointermove', 300, 300, { pointerId: TOUCH_POINTER_ID });
    expect(moves.length).toBe(1); // 不得以触点为起点重置拖拽
    // 触点抬起（pointerup 非 activePointer）→ 不终止拖拽
    fire(winListeners, 'pointerup', 300, 300, { pointerId: TOUCH_POINTER_ID });
    expect(drag.isDragging()).toBe(true);
    // 鼠标继续拖拽仍按鼠标起点计算
    fire(winListeners, 'pointermove', 150, 150);
    expect(moves.length).toBe(2);
    expect(moves[1]).toEqual({ x: 140, y: 140 });
    fire(winListeners, 'pointerup', 150, 150);
    expect(drag.isDragging()).toBe(false);
  });

  it('窗口失焦（blur）取消拖拽并复位，后续手势不被劫持', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const moves = vi.fn();
    const drops = vi.fn();
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDragMove(moves);
    drag.onDrop(drops);
    drag.bind(el);
    fire(listeners, 'pointerdown', 10, 10);
    fire(winListeners, 'pointermove', 100, 100); // 进入拖拽
    expect(drag.isDragging()).toBe(true);
    winListeners.blur(); // Alt+Tab 等导致失焦
    expect(drag.isDragging()).toBe(false);
    expect(drops).toHaveBeenCalledTimes(1); // 以最后位置收尾
    // 失焦后残留手势（按住移动）不得再移动
    fire(winListeners, 'pointermove', 400, 400, { buttons: 1 });
    expect(moves).toHaveBeenCalledTimes(1);
  });

  it('页面隐藏（visibilitychange→hidden）取消拖拽', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const drops = vi.fn();
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.onDrop(drops);
    drag.bind(el);
    fire(listeners, 'pointerdown', 10, 10);
    fire(winListeners, 'pointermove', 100, 100);
    expect(drag.isDragging()).toBe(true);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    try {
      docListeners.visibilitychange();
      expect(drag.isDragging()).toBe(false);
      expect(drops).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    }
  });

  it('拖拽期间拦截 contextmenu/dragstart/selectstart，结束后不拦截', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.bind(el);
    const ctx1 = { preventDefault: vi.fn() };
    winListeners.contextmenu(ctx1);
    expect(ctx1.preventDefault).not.toHaveBeenCalled(); // 非拖拽中不拦截
    fire(listeners, 'pointerdown', 10, 10);
    fire(winListeners, 'pointermove', 100, 100); // 进入拖拽
    const ctx2 = { preventDefault: vi.fn() };
    const ds = { preventDefault: vi.fn() };
    const ss = { preventDefault: vi.fn() };
    winListeners.contextmenu(ctx2);
    winListeners.dragstart(ds);
    docListeners.selectstart(ss);
    expect(ctx2.preventDefault).toHaveBeenCalled();
    expect(ds.preventDefault).toHaveBeenCalled();
    expect(ss.preventDefault).toHaveBeenCalled();
    fire(winListeners, 'pointerup', 100, 100);
    const ctx3 = { preventDefault: vi.fn() };
    winListeners.contextmenu(ctx3);
    expect(ctx3.preventDefault).not.toHaveBeenCalled();
  });

  it('拖拽期间全局光标为 grabbing，结束后还原', () => {
    const { el, listeners } = makeTarget({ left: 0, top: 0, width: 64, height: 64 });
    const drag = createDragController({ storageService: null, clampToViewport: false });
    drag.bind(el);
    fire(listeners, 'pointerdown', 10, 10);
    fire(winListeners, 'pointermove', 100, 100);
    expect(document.documentElement.style.cursor).toBe('grabbing');
    expect(document.documentElement.style.userSelect).toBe('none');
    fire(winListeners, 'pointerup', 100, 100);
    expect(document.documentElement.style.cursor).toBe('');
    expect(document.documentElement.style.userSelect).toBe('');
  });
});
