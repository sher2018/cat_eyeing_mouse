// path: src/content/__tests__/toggle-controller.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createToggleController, ERROR_CODES } from '../toggle-controller.js';

function createOverlayStub() {
  return {
    mount: vi.fn(),
    unmount: vi.fn(),
    getHost: vi.fn(() => null)
  };
}

function createStorageStub(hidden) {
  return {
    getSettings: vi.fn(async () => ({ ok: true, value: { hidden, clampToViewport: true, locale: 'en' } })),
    setSettings: vi.fn(async () => ({ ok: true }))
  };
}

describe('ToggleController', () => {
  it('默认初始可见 isVisible=true', () => {
    const ctrl = createToggleController({ overlayContainer: createOverlayStub() });
    expect(ctrl.isVisible()).toBe(true);
  });

  it('initialVisible=false 时初始隐藏', () => {
    const ctrl = createToggleController({ overlayContainer: createOverlayStub(), initialVisible: false });
    expect(ctrl.isVisible()).toBe(false);
  });

  it('hide 后 isVisible=false 且触发 overlayContainer.unmount', () => {
    const overlay = createOverlayStub();
    const ctrl = createToggleController({ overlayContainer: overlay });
    ctrl.hide();
    expect(ctrl.isVisible()).toBe(false);
    expect(overlay.unmount).toHaveBeenCalledTimes(1);
  });

  it('容器支持 fadeOut 时先淡出、延迟卸载', () => {
    vi.useFakeTimers();
    const overlay = createOverlayStub();
    overlay.fadeOut = vi.fn();
    const ctrl = createToggleController({ overlayContainer: overlay });
    ctrl.hide();
    expect(overlay.fadeOut).toHaveBeenCalledTimes(1);
    expect(overlay.unmount).not.toHaveBeenCalled();
    vi.advanceTimersByTime(180);
    expect(overlay.unmount).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('淡出等待期间 show 恢复可见 → 放弃挂起的卸载', () => {
    vi.useFakeTimers();
    const overlay = createOverlayStub();
    overlay.fadeOut = vi.fn();
    const ctrl = createToggleController({ overlayContainer: overlay });
    ctrl.hide();
    ctrl.show();
    vi.advanceTimersByTime(180);
    expect(overlay.unmount).not.toHaveBeenCalled();
    expect(overlay.mount).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('fadeOut 抛错时跳过过渡直接卸载', () => {
    const overlay = createOverlayStub();
    overlay.fadeOut = vi.fn(() => { throw new Error('fade boom'); });
    const ctrl = createToggleController({ overlayContainer: overlay });
    expect(() => ctrl.hide()).not.toThrow();
    expect(ctrl.isVisible()).toBe(false);
    expect(overlay.unmount).toHaveBeenCalledTimes(1);
  });

  it('show 后 isVisible=true 且触发 overlayContainer.mount', () => {
    const overlay = createOverlayStub();
    const ctrl = createToggleController({ overlayContainer: overlay, initialVisible: false });
    ctrl.show();
    expect(ctrl.isVisible()).toBe(true);
    expect(overlay.mount).toHaveBeenCalledTimes(1);
  });

  it('hide/show 不写 storage（SW 为 hidden 唯一写者，消除双写竞态）', () => {
    const storage = createStorageStub(false);
    const ctrl = createToggleController({ overlayContainer: createOverlayStub() });
    ctrl.hide();
    ctrl.show();
    expect(storage.setSettings).not.toHaveBeenCalled();
  });

  it('不依赖 storageService：不传也可正常切换', () => {
    const overlay = createOverlayStub();
    const ctrl = createToggleController({ overlayContainer: overlay, initialVisible: false });
    ctrl.show();
    ctrl.hide();
    expect(overlay.mount).toHaveBeenCalledTimes(1);
    expect(overlay.unmount).toHaveBeenCalledTimes(1);
  });

  it('toggle 在可见/隐藏间翻转', () => {
    const ctrl = createToggleController({ overlayContainer: createOverlayStub() });
    expect(ctrl.isVisible()).toBe(true);
    ctrl.toggle();
    expect(ctrl.isVisible()).toBe(false);
    ctrl.toggle();
    expect(ctrl.isVisible()).toBe(true);
  });

  it('重复 hide/show 幂等', () => {
    const overlay = createOverlayStub();
    const ctrl = createToggleController({ overlayContainer: overlay });
    ctrl.hide();
    ctrl.hide();
    expect(overlay.unmount).toHaveBeenCalledTimes(1);
    ctrl.show();
    ctrl.show();
    expect(overlay.mount).toHaveBeenCalledTimes(1);
  });

  it('onVisibilityChange 在 hide/show 时以正确布尔值回调', () => {
    const ctrl = createToggleController({ overlayContainer: createOverlayStub() });
    const seen = [];
    const off = ctrl.onVisibilityChange((v) => seen.push(v));
    ctrl.hide();
    ctrl.show();
    expect(seen).toEqual([false, true]);
    off();
    ctrl.hide();
    expect(seen).toEqual([false, true]);
  });

  it('onVisibilityChange 传入非函数返回无操作取消订阅', () => {
    const ctrl = createToggleController({ overlayContainer: createOverlayStub() });
    const off = ctrl.onVisibilityChange(null);
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });

  it('overlayContainer.unmount 抛错时记 UNMOUNT_FAIL 但状态仍切换', () => {
    const overlay = createOverlayStub();
    overlay.unmount.mockImplementation(() => {
      throw new Error('boom');
    });
    const ctrl = createToggleController({ overlayContainer: overlay });
    expect(() => ctrl.hide()).not.toThrow();
    expect(ctrl.isVisible()).toBe(false);
  });

  it('overlayContainer.unmount 抛错且有 getHost 节点时强制移除', () => {
    const child = {};
    const parent = { removeChild: vi.fn() };
    const host = { parentNode: parent };
    const overlay = createOverlayStub();
    overlay.unmount.mockImplementation(() => {
      throw new Error('boom');
    });
    overlay.getHost = vi.fn(() => host);
    const ctrl = createToggleController({ overlayContainer: overlay });
    ctrl.hide();
    expect(parent.removeChild).toHaveBeenCalledWith(host);
  });

  it('ERROR_CODES 导出 UNMOUNT_FAIL', () => {
    expect(ERROR_CODES.UNMOUNT_FAIL).toBe('UNMOUNT_FAIL');
  });
});
