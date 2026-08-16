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
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
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

  it('无 2D context 时不抛异常且进入 RUNNING（CSS sprite 主模式不依赖 canvas）', () => {
    const canvas = makeCanvas(null);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const stage = createCanvasStage();
    stage.mount({ appendChild: vi.fn() }, { w: 10, h: 10 });
    expect(stage.getState()).toBe('RUNNING');
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
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stage.getState()).toBe('SUSPENDED');
  });
});

describe('CanvasStage 眨眼图层（真实 DOM）', () => {
  let stage;
  let host;
  let blinkEl;

  beforeEach(() => {
    vi.useFakeTimers();
    stage = createCanvasStage();
    host = document.createElement('div');
    document.body.appendChild(host);
    stage.mount(host, { w: 128, h: 128 });
    blinkEl = host.querySelectorAll('div')[1];
  });

  afterEach(() => {
    stage.unmount();
    document.body.removeChild(host);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sprite 模式：playBlink 添加播放类并在兜底超时后移除', () => {
    stage.setSpriteBackground('sprite.png');
    stage.setBlinkBackground('blink.png');
    let ended = false;
    stage.playBlink(() => { ended = true; });
    expect(blinkEl.classList.contains('cem-blinking')).toBe(true);
    vi.advanceTimersByTime(900);
    expect(ended).toBe(true);
    expect(blinkEl.classList.contains('cem-blinking')).toBe(false);
  });

  it('rest 模式：showCanvas 切换为 rest 闭眼整图（无帧类、偏移归零）', () => {
    stage.setSpriteBackground('sprite.png');
    stage.setSpriteFrame(4);
    stage.setBlinkBackground('blink.png');
    stage.setBlinkRestBackground('blink_rest.png');
    stage.showCanvas();
    expect(blinkEl.style.display).toBe('block');
    expect(blinkEl.style.backgroundImage).toContain('blink_rest.png');
    expect(blinkEl.style.backgroundPosition).toBe('0px 0px');
    expect(blinkEl.className).not.toContain('move-sprite-4');
  });

  it('rest 模式：playBlink 可播放并正常结束', () => {
    stage.setSpriteBackground('sprite.png');
    stage.setBlinkBackground('blink.png');
    stage.setBlinkRestBackground('blink_rest.png');
    stage.showCanvas();
    let ended = false;
    stage.playBlink(() => { ended = true; });
    expect(blinkEl.classList.contains('cem-blinking')).toBe(true);
    vi.advanceTimersByTime(900);
    expect(ended).toBe(true);
    expect(blinkEl.classList.contains('cem-blinking')).toBe(false);
  });

  it('唤醒：showSprite 恢复雪碧图背景、帧类与偏移', () => {
    stage.setSpriteBackground('sprite.png');
    stage.setSpriteFrame(4);
    stage.setBlinkBackground('blink.png');
    stage.setBlinkRestBackground('blink_rest.png');
    stage.showCanvas();
    stage.showSprite();
    expect(blinkEl.style.backgroundImage).toContain('blink.png');
    expect(blinkEl.style.backgroundPosition).toBe('');
    expect(blinkEl.className).toContain('move-sprite-4');
    expect(blinkEl.style.display).toBe('block');
  });

  it('无 rest 背景时进入 Canvas 模式：眨眼层隐藏且 playBlink 直接回调', () => {
    stage.setSpriteBackground('sprite.png');
    stage.setBlinkBackground('blink.png');
    stage.showCanvas();
    expect(blinkEl.style.display).toBe('none');
    let ended = false;
    stage.playBlink(() => { ended = true; });
    expect(ended).toBe(true);
    expect(blinkEl.classList.contains('cem-blinking')).toBe(false);
  });

  it('未设置任何眨眼背景时 playBlink 直接回调（不播放）', () => {
    let ended = false;
    stage.playBlink(() => { ended = true; });
    expect(ended).toBe(true);
    expect(blinkEl.classList.contains('cem-blinking')).toBe(false);
  });
});
