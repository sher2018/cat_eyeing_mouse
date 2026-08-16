// @vitest-environment jsdom
// path: src/content/__tests__/content-main.test.js
// M-18 content-main 装配层单元测试（DDS §19.10）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockPoseMachine = {
  update: vi.fn(),
  setHover: vi.fn(),
  current: vi.fn(() => 0),
  onPoseChange: vi.fn(() => () => {}),
  onHoverChange: vi.fn(() => () => {}),
  enterResting: vi.fn(),
  exitResting: vi.fn(),
  notifyMouseLeave: vi.fn(),
  notifyMouseReenter: vi.fn(),
  getState: vi.fn(() => 'Tracking')
};

const mockCanvasStage = {
  mount: vi.fn(),
  unmount: vi.fn(),
  drawImage: vi.fn(),
  requestFrame: vi.fn(),
  setSize: vi.fn(),
  getSize: vi.fn(() => ({ w: 0, h: 0 })),
  suspend: vi.fn(),
  resume: vi.fn(),
  getState: vi.fn(() => 'Idle'),
  setSpriteBackground: vi.fn(),
  setSpriteFrame: vi.fn(),
  showCanvas: vi.fn(),
  showSprite: vi.fn(),
  isSpriteMode: vi.fn(() => false)
};

const mockOverlay = {
  mount: vi.fn(),
  unmount: vi.fn(),
  setPosition: vi.fn(),
  getPosition: vi.fn(() => ({ x: 0, y: 0 })),
  getCatCenter: vi.fn(() => ({ x: 0, y: 0 })),
  setPointerEvents: vi.fn(),
  getCanvasStage: vi.fn(() => mockCanvasStage),
  getPoseMachine: vi.fn(() => mockPoseMachine),
  getHost: vi.fn(() => null)
};

const mockToggle = {
  show: vi.fn(),
  hide: vi.fn(),
  toggle: vi.fn(),
  isVisible: vi.fn(() => true),
  onVisibilityChange: vi.fn(() => () => {})
};

const mockIdle = {
  start: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  onIdle: vi.fn(() => () => {}),
  onWake: vi.fn(() => () => {}),
  isIdle: vi.fn(() => false)
};

vi.mock('../../adapter/storage-service.js', () => ({
  default: {
    getSettings: vi.fn(async () => ({ ok: true, value: { hidden: false } })),
    getPosition: vi.fn(async () => null),
    setPosition: vi.fn(async () => {}),
    setSettings: vi.fn(async () => {})
  }
}));

vi.mock('../../adapter/resource-loader.js', () => ({
  default: {
    getUrl: vi.fn(() => 'chrome-extension://test/res/spine/move_sprite.png'),
    getSpriteUrl: vi.fn(() => 'chrome-extension://test/res/spine/move_sprite.png'),
    preload: vi.fn(async () => {}),
    preloadSprite: vi.fn(async () => true),
    preloadRest: vi.fn(async () => {}),
    get: vi.fn(() => ({ ok: true, value: {} })),
    getRest: vi.fn(() => ({ ok: true, value: {} })),
    getFallback: vi.fn(() => ''),
    invalidate: vi.fn()
  }
}));

vi.mock('../overlay-container.js', () => ({
  createOverlayContainer: vi.fn(() => mockOverlay)
}));

vi.mock('../toggle-controller.js', () => ({
  createToggleController: vi.fn(() => mockToggle)
}));

vi.mock('../transition-renderer.js', () => ({
  createCanvasTransitionRenderer: vi.fn(() => ({
    playTo: vi.fn(),
    cancel: vi.fn(),
    isActive: vi.fn(() => false),
    onComplete: vi.fn(() => () => {}),
    setMode: vi.fn()
  }))
}));

vi.mock('../idle-detector.js', () => ({
  createIdleDetector: vi.fn(() => mockIdle)
}));

vi.mock('../canvas-stage.js', () => ({
  createCanvasStage: vi.fn(() => mockCanvasStage)
}));

vi.mock('../pose-state-machine.js', () => ({
  createPoseStateMachine: vi.fn(() => mockPoseMachine)
}));

vi.mock('../drag-controller.js', () => ({
  createDragController: vi.fn(() => ({
    bind: vi.fn(),
    unbind: vi.fn(),
    isDragging: vi.fn(() => false),
    onDragMove: vi.fn(() => () => {}),
    onDrop: vi.fn(() => () => {})
  }))
}));

import { createApp, createLifetimeWatchdog } from '../content-main.js';

describe('ContentMain (M-18)', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  afterEach(() => {
    if (app && typeof app.dispose === 'function') app.dispose();
  });

  it('createApp 返回冻结对象 {overlay, toggle, idle, bootstrap, onMessage, dispose}', () => {
    expect(app).toBeDefined();
    expect(Object.isFrozen(app)).toBe(true);
    expect(app.overlay).toBeDefined();
    expect(app.idle).toBeDefined();
    expect(typeof app.bootstrap).toBe('function');
    expect(typeof app.onMessage).toBe('function');
    expect(typeof app.dispose).toBe('function');
  });

  it('bootstrap 后 overlay.mount + idle.start 被调用', async () => {
    await app.bootstrap();
    expect(mockOverlay.mount).toHaveBeenCalledTimes(1);
    expect(mockIdle.start).toHaveBeenCalledTimes(1);
  });

  it('bootstrap hidden=true 时不 mount', async () => {
    const { default: storage } = await import('../../adapter/storage-service.js');
    storage.getSettings.mockResolvedValueOnce({ ok: true, value: { hidden: true } });
    await app.bootstrap();
    expect(mockOverlay.mount).not.toHaveBeenCalled();
  });

  it('onMessage(TOGGLE_VISIBLE) → toggle.toggle 被调用', async () => {
    const app = createApp();
    await app.bootstrap();
    app.onMessage({ type: 'TOGGLE_VISIBLE' });
    expect(mockToggle.toggle).toHaveBeenCalledTimes(1);
  });

  it('越界绑定：bootstrap 后注册 document mouseleave/mouseenter', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    await app.bootstrap();
    expect(addSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mouseenter', expect.any(Function));
    addSpy.mockRestore();
  });

  it('越界回调：mouseleave 触发 psm.notifyMouseLeave', async () => {
    let leaveHandler = null;
    const addSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, fn) => {
      if (type === 'mouseleave') leaveHandler = fn;
    });
    await app.bootstrap();
    addSpy.mockRestore();
    leaveHandler();
    expect(mockPoseMachine.notifyMouseLeave).toHaveBeenCalledTimes(1);
  });

  it('越界恢复：mouseenter 触发 psm.notifyMouseReenter', async () => {
    let reenterHandler = null;
    const addSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, fn) => {
      if (type === 'mouseenter') reenterHandler = fn;
    });
    await app.bootstrap();
    addSpy.mockRestore();
    reenterHandler();
    expect(mockPoseMachine.notifyMouseReenter).toHaveBeenCalledTimes(1);
  });

  it('dispose 后 mouseleave/mouseenter 解绑', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    await app.bootstrap();
    app.dispose();
    expect(removeSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseenter', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('mount 抛错时 bootstrap 不中断，toggle 仍创建且按钮链路可用', async () => {
    mockOverlay.mount.mockImplementation(() => { throw new Error('mount boom'); });
    const app = createApp();
    await expect(app.bootstrap()).resolves.toBeUndefined();
    expect(mockToggle.toggle).not.toHaveBeenCalled();
    app.onMessage({ type: 'TOGGLE_VISIBLE' });
    expect(mockToggle.toggle).toHaveBeenCalledTimes(1);
    mockOverlay.mount.mockReset();
  });

  it('mount 抛错时 onVisibilityChange(true) 回调不丢失（show 路径仍走 afterMount）', async () => {
    let visCb = null;
    mockToggle.onVisibilityChange.mockImplementation((cb) => { visCb = cb; return () => {}; });
    const app = createApp();
    await app.bootstrap();
    expect(typeof visCb).toBe('function');
    visCb(true); // 模拟 show
    expect(mockIdle.start).toHaveBeenCalled();
    mockToggle.onVisibilityChange.mockReset();
  });

  it('重复 afterMount 不叠加 mouseleave 监听（先解绑再绑定）', async () => {
    let visCb = null;
    mockToggle.onVisibilityChange.mockImplementation((cb) => { visCb = cb; return () => {}; });
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const app = createApp();
    await app.bootstrap();
    const addsAfterBootstrap = addSpy.mock.calls.filter((c) => c[0] === 'mouseleave').length;
    visCb(true); // 模拟再次 show → afterMount 重绑
    expect(removeSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    const addsAfterShow = addSpy.mock.calls.filter((c) => c[0] === 'mouseleave').length;
    expect(addsAfterShow - addsAfterBootstrap).toBe(1); // 仅新增一组，无叠加
    addSpy.mockRestore();
    removeSpy.mockRestore();
    mockToggle.onVisibilityChange.mockReset();
  });
});

describe('LifetimeWatchdog（卸载残留清理）', () => {
  /** 手动挡定时器：可显式触发 tick，避免真实等待。 */
  function createFakeTimers() {
    let tickFn = null;
    let cleared = 0;
    return {
      set: vi.fn((fn) => { tickFn = fn; return 1; }),
      clear: vi.fn(() => { cleared += 1; tickFn = null; }),
      fire: () => { if (tickFn) tickFn(); },
      clearedCount: () => cleared
    };
  }

  function createNs(id = 'ext-uuid-1') {
    return { runtime: { id } };
  }

  it('扩展有效时不触发 onInvalid，且已挂载定时器持续轮询', () => {
    const timers = createFakeTimers();
    const onInvalid = vi.fn();
    createLifetimeWatchdog({ ns: createNs(), onInvalid, timerApi: timers });
    expect(timers.set).toHaveBeenCalledWith(expect.any(Function), 2000);
    timers.fire();
    timers.fire();
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it('runtime.id 变 undefined（卸载/禁用）→ 触发一次 onInvalid 并停止轮询', () => {
    const timers = createFakeTimers();
    const onInvalid = vi.fn();
    const ns = createNs();
    createLifetimeWatchdog({ ns, onInvalid, timerApi: timers });
    ns.runtime.id = undefined; // 模拟扩展被移除
    timers.fire();
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(timers.clear).toHaveBeenCalled();
    timers.fire = () => { throw new Error('tick 不应再被调度'); };
    expect(onInvalid).toHaveBeenCalledTimes(1); // 无重复触发
  });

  it('访问 runtime.id 抛错（上下文失效）→ 视为失效并触发清理', () => {
    const timers = createFakeTimers();
    const onInvalid = vi.fn();
    const ns = { runtime: {} };
    Object.defineProperty(ns.runtime, 'id', {
      get() { throw new Error('Extension context invalidated'); }
    });
    createLifetimeWatchdog({ ns, onInvalid, timerApi: timers });
    timers.fire();
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it('ns.runtime 整体缺失 → 启动即失效，不挂定时器', () => {
    const timers = createFakeTimers();
    const onInvalid = vi.fn();
    createLifetimeWatchdog({ ns: {}, onInvalid, timerApi: timers });
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(timers.set).not.toHaveBeenCalled();
  });

  it('onInvalid 抛错不上抛且定时器已清理', () => {
    const timers = createFakeTimers();
    const ns = createNs();
    const wd = createLifetimeWatchdog({
      ns,
      onInvalid: () => { throw new Error('cleanup boom'); },
      timerApi: timers
    });
    ns.runtime.id = undefined;
    expect(wd.isInvalidated()).toBe(true);
    expect(() => timers.fire()).not.toThrow();
    expect(timers.clear).toHaveBeenCalled();
  });

  it('stop() 后扩展失效也不触发 onInvalid', () => {
    const timers = createFakeTimers();
    const onInvalid = vi.fn();
    const ns = createNs();
    const wd = createLifetimeWatchdog({ ns, onInvalid, timerApi: timers });
    wd.stop();
    ns.runtime.id = undefined;
    timers.fire();
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it('失效时 onInvalid 内调用 app.dispose：overlay.unmount 被执行（端到端）', async () => {
    const timers = createFakeTimers();
    const app = createApp();
    await app.bootstrap();
    const ns = createNs();
    createLifetimeWatchdog({ ns, onInvalid: () => app.dispose(), timerApi: timers });
    ns.runtime.id = undefined;
    timers.fire();
    expect(mockOverlay.unmount).toHaveBeenCalled();
  });
});
