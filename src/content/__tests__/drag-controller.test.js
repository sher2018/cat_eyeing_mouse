// path: src/content/__tests__/drag-controller.test.js
// M-10 DragController 单元测试（DDS §11.10）。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDragController } from '../drag-controller.js';

function makeTarget(rect) {
  const listeners = {};
  const el = {
    width: rect.width,
    height: rect.height,
    addEventListener: vi.fn((type, cb) => { listeners[type] = cb; }),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => rect
  };
  return { el, listeners };
}

function fire(listeners, type, x, y) {
  const handler = listeners[type];
  if (typeof handler === 'function') handler({ clientX: x, clientY: y });
}

describe('DragController', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
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
    fire(listeners, 'pointermove', 140, 130); // dx=30,dy=20 > 阈值
    expect(drag.isDragging()).toBe(true);
    expect(moves.length).toBe(1);
    expect(moves[0]).toEqual({ x: 130, y: 120 });

    fire(listeners, 'pointerup', 150, 150);
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
    fire(listeners, 'pointermove', 5, 5);
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
    fire(listeners, 'pointermove', 1100, 900);
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
    fire(listeners, 'pointermove', 50, 50);
    fire(listeners, 'pointerup', 50, 50);
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
    fire(listeners, 'pointermove', 100, 100);
    expect(moves).not.toHaveBeenCalled();
  });
});
