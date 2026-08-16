// path: src/background/service-worker.js
// M-15 ServiceWorker —— MV3 后台消息中转（DDS §16 / FR-007/009）。
// 上游：M-14 PopupView（消息）、Content（消息）；下游：M-01 BrowserAdapter、M-02 StorageService。

import { createLogger } from '../shared/logger.js';
import { MSG_TYPES, DEFAULT_SETTINGS } from '../shared/constants.js';
import { browserAdapter } from '../adapter/browser-adapter.js';
import { createStorageService } from '../adapter/storage-service.js';

const log = createLogger('ServiceWorker');

const CONFIG = Object.freeze({
  MSG_WHITELIST: Object.freeze(new Set(Object.values(MSG_TYPES)))
});

const ERROR_CODES = Object.freeze({
  CONTENT_NO_ACK: 'CONTENT_NO_ACK',
  MSG_TYPE_INVALID: 'MSG_TYPE_INVALID'
});

/** 判定消息类型是否在白名单内。 */
function isKnownType(type, whitelist) {
  return typeof type === 'string' && whitelist.has(type);
}

/** 读取完整设置，失败回退默认设置（保证后续合并安全）。 */
async function readSettings(storageService) {
  if (!storageService || typeof storageService.getSettings !== 'function') return Object.assign({}, DEFAULT_SETTINGS);
  try {
    const result = await storageService.getSettings();
    if (result && result.ok && result.value) return Object.assign({}, DEFAULT_SETTINGS, result.value);
  } catch (e) {
    log.warn('read_settings_failed', { msg: e && e.message ? e.message : String(e) });
  }
  return Object.assign({}, DEFAULT_SETTINGS);
}

/** 写回设置，失败记 WARN（仍继续广播内存态设置）。 */
async function writeSettings(storageService, settings) {
  if (!storageService || typeof storageService.setSettings !== 'function') return;
  try {
    await storageService.setSettings(settings);
  } catch (e) {
    log.warn('write_settings_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

/** 翻转 hidden 并写回。 */
async function flipHidden(storageService) {
  const settings = await readSettings(storageService);
  await writeSettings(storageService, Object.assign({}, settings, { hidden: !settings.hidden }));
}

/** 广播给所有 Content：优先遍历 tabs，回退 runtime.sendMessage。 */
async function broadcast(adapter, message) {
  if (!adapter) return;
  try {
    if (typeof adapter.tabs === 'function') {
      await broadcastViaTabs(adapter, message);
    } else if (typeof adapter.runtime === 'function') {
      await adapter.runtime().sendMessage(message);
    }
    log.info('broadcast', { type: message && message.type });
  } catch (e) {
    log.warn(ERROR_CODES.CONTENT_NO_ACK, { msg: e && e.message ? e.message : String(e) });
  }
}

async function broadcastViaTabs(adapter, message) {
  const tabsApi = adapter.tabs();
  const query = typeof tabsApi.query === 'function' ? await tabsApi.query({}) : [];
  for (const tab of query) {
    if (!tab.id) continue;
    try {
      if (tabsApi.sendMessage) await tabsApi.sendMessage(tab.id, message);
    } catch (_) {
      /* chrome:// 等受限页面忽略 */
    }
  }
}

/**
 * 装配 Service Worker：注册 onMessage 监听并返回可测试的 handler/broadcast。
 * @param {{adapter?:object, storageService?:object, autoRegister?:boolean}} [deps]
 * @returns {object} 冻结的 { handler, broadcast, dispose }
 */
function setupServiceWorker({ adapter, storageService, autoRegister = true } = {}) {
  async function handler(message) {
    const type = message && typeof message === 'object' ? message.type : null;
    if (!isKnownType(type, CONFIG.MSG_WHITELIST)) {
      log.warn(ERROR_CODES.MSG_TYPE_INVALID, { type });
      return;
    }
    log.info('message_received', { type });
    if (type === MSG_TYPES.ACK) {
      log.info('ack', { ok: !!message.ok });
      return;
    }
    if (type === MSG_TYPES.TOGGLE_VISIBLE) {
      await flipHidden(storageService);
      await broadcast(adapter, { type: MSG_TYPES.TOGGLE_VISIBLE });
      return;
    }
    await broadcast(adapter, { type });
  }

  let dispose = () => {};
  // autoRegister=false 时跳过注册：浏览器入口已有顶层转发监听器，重复注册会导致同一条消息被处理两次
  if (autoRegister && adapter && typeof adapter.runtime === 'function') {
    try {
      dispose = adapter.runtime().onMessage(handler) || dispose;
    } catch (e) {
      log.warn('onMessage_register_failed', { msg: e && e.message ? e.message : String(e) });
    }
  }

  return Object.freeze({
    handler,
    broadcast: (message) => broadcast(adapter, message),
    dispose
  });
}

/** 探测是否运行于真实扩展运行时（避免测试环境误注册）。 */
function hasExtensionRuntime() {
  if (typeof globalThis === 'undefined') return false;
  const ns = globalThis.chrome || globalThis.browser;
  return !!(ns && ns.runtime && typeof ns.runtime.onMessage === 'object');
}

// 浏览器入口：顶层同步注册 onMessage（MV3 要求）。
// 依赖经顶层静态导入装配——SW 全局作用域禁止动态 import()（HTML 规范，Chrome/Edge 抛
// "import() is disallowed on ServiceWorkerGlobalScope"），此前惰性 import() 导致 handler 从未执行。
if (hasExtensionRuntime()) {
  const ns = globalThis.chrome || globalThis.browser;
  let dispatch = null;
  try {
    const storageService = createStorageService(browserAdapter);
    const sw = setupServiceWorker({ adapter: browserAdapter, storageService, autoRegister: false });
    dispatch = (message) => sw.handler(message);
    log.info('installed', { reason: 'runtime_detected' });
  } catch (e) {
    log.warn('boot_failed', { msg: e && e.message ? e.message : String(e) });
  }
  ns.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 立即 ACK 并关闭通道：分发为异步即发即忘，不回传结果；
    // 若 return true 却永不响应，发送方（popup）的 Promise 将永不 settle 或报 port closed
    try { sendResponse({ ok: true }); } catch (_) { /* 发送方已销毁时通道关闭，忽略 */ }
    if (!dispatch) return;
    void Promise.resolve()
      .then(() => dispatch(message))
      .catch((e) => {
        log.warn('handler_error', { msg: e && e.message ? e.message : String(e) });
      });
  });
  log.info('listener_registered', {});
}

export { setupServiceWorker, CONFIG, ERROR_CODES };
