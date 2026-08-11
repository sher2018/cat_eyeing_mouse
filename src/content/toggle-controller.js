// path: src/content/toggle-controller.js
// M-12 ToggleController —— 显隐开关状态机（DDS §13 / FR-009）。
// 上游：M-14 PopupView、M-15 ServiceWorker 消息驱动；下游：M-02 StorageService、M-13 OverlayContainer。

import { createLogger } from '../shared/logger.js';

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

/** 异步持久化 hidden 标记，失败仅记 WARN（不阻塞状态切换）。 */
async function persistHidden(storageService, hidden) {
  if (!storageService || typeof storageService.setSettings !== 'function') return;
  try {
    await storageService.setSettings({ hidden });
  } catch (e) {
    log.warn('persist_failed', { msg: e && e.message ? e.message : String(e) });
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

/** 异步同步初始可见性：以 storage 记忆为准。 */
async function syncFromStorage(storageService, stateRef) {
  if (!storageService || typeof storageService.getSettings !== 'function') return;
  try {
    const result = await storageService.getSettings();
    if (result && result.ok && result.value && typeof result.value.hidden === 'boolean') {
      stateRef.current = result.value.hidden ? STATE.HIDDEN : STATE.VISIBLE;
      log.info('synced_from_storage', { visible: !result.value.hidden });
    }
  } catch (e) {
    log.warn('sync_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

/**
 * 创建 ToggleController 实例。
 * @param {{overlayContainer?:object, storageService?:object, initialVisible?:boolean}} [deps]
 * @returns {object} 冻结的控制器接口
 */
function createToggleController({ overlayContainer, storageService, initialVisible = CONFIG.DEFAULT_VISIBLE } = {}) {
  const stateRef = { current: initialVisible ? STATE.VISIBLE : STATE.HIDDEN };
  const listeners = new Set();

  function hide() {
    if (stateRef.current === STATE.HIDDEN) return;
    safeUnmount(overlayContainer);
    void persistHidden(storageService, true);
    stateRef.current = STATE.HIDDEN;
    log.info('visibility_change', { visible: false });
    emitVisibility(listeners, false);
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
    void persistHidden(storageService, false);
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

  // 启动即尝试从 storage 同步初始可见性（异步、不阻塞构造）
  void syncFromStorage(storageService, stateRef);

  return Object.freeze({
    show,
    hide,
    toggle,
    isVisible,
    onVisibilityChange
  });
}

export { createToggleController, CONFIG, ERROR_CODES };
