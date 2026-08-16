// @vitest-environment jsdom
// path: src/content/__tests__/blink-controller.test.js
// M-16 BlinkController 单元测试 —— 随机间隔调度 / 抑制联动 / 生命周期。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBlinkController, CONFIG } from '../blink-controller.js';

function makeStage() {
  return {
    playBlink: vi.fn((onEnd) => {
      if (typeof onEnd === 'function') onEnd();
    })
  };
}

describe('BlinkController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('start 后间隔到达才触发 playBlink（3s 最小间隔内不眨眼）', () => {
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS - 1);
    expect(stage.playBlink).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(stage.playBlink).toHaveBeenCalledTimes(1);
    blink.stop();
  });

  it('随机间隔不超过 5s 上限', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    vi.advanceTimersByTime(CONFIG.INTERVAL_MAX_MS);
    expect(stage.playBlink).toHaveBeenCalledTimes(1);
    blink.stop();
  });

  it('一次眨眼结束后重新调度（循环眨眼）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS);
    expect(stage.playBlink).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS);
    expect(stage.playBlink).toHaveBeenCalledTimes(2);
    blink.stop();
  });

  it('suppress 后取消调度，到点不播放', () => {
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    blink.suppress('hover');
    expect(blink.isSuppressed()).toBe(true);
    vi.advanceTimersByTime(CONFIG.INTERVAL_MAX_MS + 1000);
    expect(stage.playBlink).not.toHaveBeenCalled();
  });

  it('resume 后恢复调度', () => {
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    blink.suppress('hover');
    blink.resume('hover');
    expect(blink.isSuppressed()).toBe(false);
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS);
    expect(stage.playBlink).toHaveBeenCalledTimes(1);
    blink.stop();
  });

  it('多原因抑制需全部解除才恢复', () => {
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    blink.suppress('hover');
    blink.suppress('drag');
    blink.resume('hover');
    vi.advanceTimersByTime(CONFIG.INTERVAL_MAX_MS + 1000);
    expect(stage.playBlink).not.toHaveBeenCalled();
    blink.resume('drag');
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS);
    expect(stage.playBlink).toHaveBeenCalledTimes(1);
    blink.stop();
  });

  it('抑制期间到点：不播放，待解除后重新调度', () => {
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    blink.suppress('rest');
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS);
    expect(stage.playBlink).not.toHaveBeenCalled();
    blink.resume('rest');
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS);
    expect(stage.playBlink).toHaveBeenCalledTimes(1);
    blink.stop();
  });

  it('stop 后不再触发 playBlink', () => {
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    blink.stop();
    vi.advanceTimersByTime(CONFIG.INTERVAL_MAX_MS + 1000);
    expect(stage.playBlink).not.toHaveBeenCalled();
  });

  it('playBlink 抛异常时不中断调度链', () => {
    const stage = {
      playBlink: vi.fn(() => { throw new Error('boom'); })
    };
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    expect(() => vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS)).not.toThrow();
    expect(stage.playBlink).toHaveBeenCalledTimes(1);
    // 失败后仍重新调度
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS);
    expect(stage.playBlink).toHaveBeenCalledTimes(2);
    blink.stop();
  });

  it('状态机：调度中 Idle，播放中 Blinking，结束回 Idle', () => {
    let endCb = null;
    const stage = {
      playBlink: vi.fn((onEnd) => { endCb = onEnd; })
    };
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    expect(blink.getState()).toBe('Idle');
    vi.advanceTimersByTime(CONFIG.INTERVAL_MIN_MS);
    expect(blink.getState()).toBe('Blinking');
    if (endCb) endCb();
    expect(blink.getState()).toBe('Idle');
    blink.stop();
  });

  it('重复 start 不产生双份调度', () => {
    const stage = makeStage();
    const blink = createBlinkController({ canvasStage: stage });
    blink.start();
    blink.start();
    vi.advanceTimersByTime(CONFIG.INTERVAL_MAX_MS);
    // Math.random=0 → 间隔恰为 3000ms，5s 内仅触发一次
    expect(stage.playBlink).toHaveBeenCalledTimes(1);
    blink.stop();
  });
});
