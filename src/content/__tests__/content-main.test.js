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
  getState: vi.fn(() => 'Idle')
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
  setClamp: vi.fn(),
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
    getUrl: vi.fn(() => ''),
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

import { createApp } from '../content-main.js';

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

  it('onMessage(SET_CLAMP) → overlay.setClamp 被调用', async () => {
    const app = createApp();
    await app.bootstrap();
    app.onMessage({ type: 'SET_CLAMP', clamp: true });
    expect(mockOverlay.setClamp).toHaveBeenCalledWith(true);
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
});
