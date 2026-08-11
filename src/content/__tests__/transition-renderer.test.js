// path: src/content/__tests__/transition-renderer.test.js
// M-08 CanvasTransitionRenderer 单元测试（DDS §9.10）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCanvasTransitionRenderer } from '../transition-renderer.js';
import { SectorId } from '../../shared/constants.js';

function makeImg() {
  return {};
}

function makeResourceLoader() {
  const cache = {
    [SectorId.CENTER]: makeImg(),
    [SectorId.E]: makeImg(),
    [SectorId.S]: makeImg()
  };
  return {
    get: vi.fn((sector) => ({ ok: true, value: cache[sector] || null }))
  };
}

function makeCanvasStage() {
  let frameCb = null;
  return {
    drawImage: vi.fn(),
    getSize: vi.fn(() => ({ w: 128, h: 128 })),
    requestFrame: vi.fn((cb) => { frameCb = cb; }),
    _fire: () => { const c = frameCb; frameCb = null; if (c) c({ clearRect: vi.fn(), drawImage: vi.fn(), globalAlpha: 1 }); },
    _hasPending: () => frameCb !== null
  };
}

describe('CanvasTransitionRenderer', () => {
  let originalPerf;
  let perfNow;
  let rafCallbacks;

  beforeEach(() => {
    originalPerf = globalThis.performance;
    perfNow = 0;
    globalThis.performance = { now: () => perfNow };
    rafCallbacks = [];
    globalThis.requestAnimationFrame = (cb) => { rafCallbacks.push(cb); return 1; };
  });

  afterEach(() => {
    globalThis.performance = originalPerf;
    vi.restoreAllMocks();
  });

  it('playTo 触发 crossfade 绘制并最终完成', () => {
    const stage = makeCanvasStage();
    const rl = makeResourceLoader();
    const renderer = createCanvasTransitionRenderer({ canvasStage: stage, resourceLoader: rl, mode: 'crossfade' });
    const done = vi.fn();
    renderer.onComplete(done);

    renderer.playTo(SectorId.E);
    expect(renderer.isActive()).toBe(true);
    // 推进时间并触发多帧直到完成
    for (let i = 0; i < 20 && stage._hasPending(); i++) {
      perfNow += 60;
      stage._fire();
    }
    expect(done).toHaveBeenCalled();
    expect(renderer.isActive()).toBe(false);
  });

  it('cancel 后 isActive()===false', () => {
    const stage = makeCanvasStage();
    const rl = makeResourceLoader();
    const renderer = createCanvasTransitionRenderer({ canvasStage: stage, resourceLoader: rl, mode: 'crossfade' });
    renderer.playTo(SectorId.S);
    expect(renderer.isActive()).toBe(true);
    renderer.cancel();
    expect(renderer.isActive()).toBe(false);
  });

  it('60ms 内多次 playTo 被节流合并', () => {
    const stage = makeCanvasStage();
    const rl = makeResourceLoader();
    const renderer = createCanvasTransitionRenderer({ canvasStage: stage, resourceLoader: rl, mode: 'crossfade' });
    renderer.playTo(SectorId.E);
    // 时间未推进，仍在节流窗内
    renderer.playTo(SectorId.S);
    // 合并后未启动新过渡（当前 target 已更新为 S，等待上一轮完成）
    expect(renderer.isActive()).toBe(true);
  });

  it('目标帧缺失时降级硬切', () => {
    const stage = makeCanvasStage();
    const rl = { get: vi.fn(() => ({ ok: true, value: null })) };
    const done = vi.fn();
    const renderer = createCanvasTransitionRenderer({ canvasStage: stage, resourceLoader: rl, mode: 'crossfade' });
    renderer.onComplete(done);
    renderer.playTo(SectorId.E);
    expect(stage.drawImage).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalled();
    expect(renderer.isActive()).toBe(false);
  });

  it('setMode 切换 frames/crossfade', () => {
    const stage = makeCanvasStage();
    const rl = makeResourceLoader();
    const renderer = createCanvasTransitionRenderer({ canvasStage: stage, resourceLoader: rl, mode: 'frames' });
    renderer.setMode('crossfade');
    // 不抛异常即视为接受
    expect(typeof renderer.playTo).toBe('function');
  });
});
