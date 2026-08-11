// @vitest-environment jsdom
// path: src/content/__tests__/canvas-stage.test.js
// M-09 CanvasStage 单元测试（DDS §10.10）—— Vitest AAA 模式 + Mock 依赖。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCanvasStage, ERROR_CODES } from '../canvas-stage.js';

function makeCtx() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn()
  };
}

function makeCanvas(ctx) {
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: vi.fn(() => ctx),
    appendChild: vi.fn(),
    parentNode: { removeChild: vi.fn() }
  };
}

describe('CanvasStage', () => {
  let originalRAF;
  let originalDPR;

  beforeEach(() => {
    originalRAF = globalThis.requestAnimationFrame;
    originalDPR = window.devicePixelRatio;
    globalThis.requestAnimationFrame = (cb) => {
      cb();
      return 1;
    };
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    document.hidden = false;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    Object.defineProperty(window, 'devicePixelRatio', { value: originalDPR, configurable: true });
    vi.restoreAllMocks();
  });

  it('mount 后 canvas backing store 等于 size*dpr', () => {
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    const host = { appendChild: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const stage = createCanvasStage();
    stage.mount(host, { w: 100, h: 80 });
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(160);
    expect(canvas.style.width).toBe('100px');
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('drawImage 清空后绘制图像', () => {
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    const host = { appendChild: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const stage = createCanvasStage();
    stage.mount(host, { w: 64, h: 64 });
    const img = {};
    stage.drawImage(img);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(img, 0, 0, 64, 64);
  });

  it('DPR 超限被截断到 DPR_CAP=3', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 5, configurable: true });
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const stage = createCanvasStage();
    stage.mount({ appendChild: vi.fn() }, { w: 10, h: 10 });
    expect(canvas.width).toBe(30);
    expect(ctx.setTransform).toHaveBeenCalledWith(3, 0, 0, 3, 0, 0);
  });

  it('suspend/resume 切换状态', () => {
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const stage = createCanvasStage();
    stage.mount({ appendChild: vi.fn() }, { w: 10, h: 10 });
    stage.suspend();
    expect(stage.getState()).toBe('SUSPENDED');
    stage.resume();
    expect(stage.getState()).toBe('RUNNING');
  });

  it('无 2D context 时不抛异常且不进入 RUNNING', () => {
    const canvas = makeCanvas(null);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const stage = createCanvasStage();
    stage.mount({ appendChild: vi.fn() }, { w: 10, h: 10 });
    expect(stage.getState()).toBe('UNMOUNTED');
  });

  it('unmount 后状态为 UNMOUNTED', () => {
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const stage = createCanvasStage();
    stage.mount({ appendChild: vi.fn() }, { w: 10, h: 10 });
    stage.unmount();
    expect(stage.getState()).toBe('UNMOUNTED');
  });

  it('visibilitychange hidden 时自动 suspend', () => {
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const stage = createCanvasStage();
    stage.mount({ appendChild: vi.fn() }, { w: 10, h: 10 });
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stage.getState()).toBe('SUSPENDED');
  });
});
