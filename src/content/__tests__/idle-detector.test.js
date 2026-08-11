// @vitest-environment jsdom
// path: src/content/__tests__/idle-detector.test.js
// M-11 IdleDetector 单元测试（DDS §12.10）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createIdleDetector } from '../idle-detector.js';

describe('IdleDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('静止达到阈值 → onIdle', () => {
    const detector = createIdleDetector({ threshold: 8000, wakeDebounce: 120 });
    const idle = vi.fn();
    detector.onIdle(idle);
    detector.start();
    vi.advanceTimersByTime(8000);
    expect(idle).toHaveBeenCalledTimes(1);
    expect(detector.isIdle()).toBe(true);
    detector.stop();
  });

  it('移动 → onWake', () => {
    const detector = createIdleDetector({ threshold: 8000, wakeDebounce: 120 });
    const idle = vi.fn();
    const wake = vi.fn();
    detector.onIdle(idle);
    detector.onWake(wake);
    detector.start();
    vi.advanceTimersByTime(8000);
    expect(detector.isIdle()).toBe(true);
    document.dispatchEvent(new MouseEvent('mousemove'));
    vi.advanceTimersByTime(120);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(detector.isIdle()).toBe(false);
    detector.stop();
  });

  it('移动重置计时（未达阈值前移动不触发 onIdle）', () => {
    const detector = createIdleDetector({ threshold: 8000, wakeDebounce: 120 });
    const idle = vi.fn();
    detector.onIdle(idle);
    detector.start();
    vi.advanceTimersByTime(5000);
    document.dispatchEvent(new MouseEvent('mousemove'));
    vi.advanceTimersByTime(5000);
    expect(idle).not.toHaveBeenCalled();
    detector.stop();
  });

  it('Idle 态再次静止不重复 onIdle', () => {
    const detector = createIdleDetector({ threshold: 8000, wakeDebounce: 120 });
    const idle = vi.fn();
    detector.onIdle(idle);
    detector.start();
    vi.advanceTimersByTime(8000);
    vi.advanceTimersByTime(8000);
    expect(idle).toHaveBeenCalledTimes(1);
    detector.stop();
  });

  it('stop 后不再触发 onIdle', () => {
    const detector = createIdleDetector({ threshold: 1000, wakeDebounce: 120 });
    const idle = vi.fn();
    detector.onIdle(idle);
    detector.start();
    detector.stop();
    vi.advanceTimersByTime(5000);
    expect(idle).not.toHaveBeenCalled();
  });

  it('start(thresholdMs) 可覆盖阈值', () => {
    const detector = createIdleDetector({ threshold: 8000, wakeDebounce: 120 });
    const idle = vi.fn();
    detector.onIdle(idle);
    detector.start(2000);
    vi.advanceTimersByTime(2000);
    expect(idle).toHaveBeenCalledTimes(1);
    detector.stop();
  });
});
