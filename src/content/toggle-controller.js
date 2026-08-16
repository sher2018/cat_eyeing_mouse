// path: src/content/toggle-controller.js
// M-12 ToggleController —— 显隐开关状态机（DDS §13 / FR-009）。
// 上游：M-14 PopupView、M-15 ServiceWorker 消息驱动；下游：M-02 StorageService、M-13 OverlayContainer。

import { createLogger } from '../shared/logger.js';
import { OVERLAY_FADE_MS } from '../shared/constants.js';

const log = createLogger('ToggleController');

const CONFIG = Object.freeze({
  DEFAULT_VISIBLE: true
});

const ERROR_CODES = Object.freeze({
  UNMOUNT_FAIL: 'UNMOUNT_FAIL'
});

const STATE = Object.freeze({
  VISIBLE: 'VISIBLE',
  HIDDEN: 'HIDDEN'
});

/** 通知所有可见性订阅者，单个订阅者抛错不影响其它。 */
function emitVisibility(listeners, visible) {
  for (const cb of listeners) {
    try {
      cb(visible);
    } catch (e) {
      log.warn('listener_error', { msg: e && e.message ? e.message : String(e) });
    }
  }
}

/** 卸载注入层；抛错时记 UNMOUNT_FAIL 并尽力强制移除节点。 */
function safeUnmount(overlayContainer) {
  if (!overlayContainer || typeof overlayContainer.unmount !== 'function') return;
  try {
    overlayContainer.unmount();
  } catch (e) {
    log.warn(ERROR_CODES.UNMOUNT_FAIL, { msg: e && e.message ? e.message : String(e) });
    forceRemoveHost(overlayContainer);
  }
}

/** 卸载失败兜底：若 OverlayContainer 暴露根节点则直接移除。 */
function forceRemoveHost(overlayContainer) {
  const root = typeof overlayContainer.getHost === 'function' ? overlayContainer.getHost() : null;
  if (root && root.parentNode) {
    try {
      root.parentNode.removeChild(root);
    } catch (_) {
      /* 节点已被移除或不可访问，忽略 */
    }
  }
}

/**
 * 创建 ToggleController 实例（纯内存状态机：hidden 的持久化由 ServiceWorker 唯一负责，
 * 本控制器仅镜像广播态，避免读-改-写竞态导致的新旧值互覆）。
 * @param {{overlayContainer?:object, initialVisible?:boolean}} [deps]
 * @returns {object} 冻结的控制器接口
 */
function createToggleController({ overlayContainer, initialVisible = CONFIG.DEFAULT_VISIBLE } = {}) {
  const stateRef = { current: initialVisible ? STATE.VISIBLE : STATE.HIDDEN };
  const listeners = new Set();

  function hide() {
    if (stateRef.current === STATE.HIDDEN) return;
    stateRef.current = STATE.HIDDEN;
    log.info('visibility_change', { visible: false });
    scheduleHideUnmount();
    emitVisibility(listeners, false);
  }

  /** 隐藏编排：容器支持淡出时先播过渡再延迟卸载；否则立即卸载。 */
  function scheduleHideUnmount() {
    if (overlayContainer && typeof overlayContainer.fadeOut === 'function') {
      try {
        overlayContainer.fadeOut();
        // 淡出期间若已 show 恢复可见，则放弃挂起的卸载（避免误卸新挂载的容器）
        setTimeout(() => {
          if (stateRef.current === STATE.HIDDEN) safeUnmount(overlayContainer);
        }, OVERLAY_FADE_MS);
        return;
      } catch (e) {
        log.warn(ERROR_CODES.UNMOUNT_FAIL, { msg: e && e.message ? e.message : String(e) });
      }
    }
    safeUnmount(overlayContainer);
  }

  function show() {
    if (stateRef.current === STATE.VISIBLE) return;
    if (overlayContainer && typeof overlayContainer.mount === 'function') {
      try {
        overlayContainer.mount();
      } catch (e) {
        log.warn('mount_fail', { msg: e && e.message ? e.message : String(e) });
      }
    }
    stateRef.current = STATE.VISIBLE;
    log.info('visibility_change', { visible: true });
    emitVisibility(listeners, true);
  }

  function toggle() {
    if (stateRef.current === STATE.VISIBLE) {
      hide();
    } else {
      show();
    }
  }

  function isVisible() {
    return stateRef.current === STATE.VISIBLE;
  }

  function onVisibilityChange(cb) {
    if (typeof cb !== 'function') return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  return Object.freeze({
    show,
    hide,
    toggle,
    isVisible,
    onVisibilityChange
  });
}

export { createToggleController, CONFIG, ERROR_CODES };
