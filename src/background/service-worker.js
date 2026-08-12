// path: src/background/service-worker.js
// M-15 ServiceWorker —— MV3 后台消息中转（DDS §16 / FR-007/009）。
// 上游：M-14 PopupView（消息）、Content（消息）；下游：M-01 BrowserAdapter、M-02 StorageService。

import { createLogger } from '../shared/logger.js';
import { MSG_TYPES, DEFAULT_SETTINGS } from '../shared/constants.js';

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

/** 写入 clampToViewport 并写回。 */
async function applyClamp(storageService, clamp) {
  const settings = await readSettings(storageService);
  await writeSettings(storageService, Object.assign({}, settings, { clampToViewport: !!clamp }));
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
    if (tabsApi.sendMessage) await tabsApi.sendMessage(tab.id, message);
  }
}

/**
 * 装配 Service Worker：注册 onMessage 监听并返回可测试的 handler/broadcast。
 * @param {{adapter?:object, storageService?:object}} [deps]
 * @returns {object} 冻结的 { handler, broadcast, dispose }
 */
function setupServiceWorker({ adapter, storageService } = {}) {
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
    if (type === MSG_TYPES.SET_CLAMP) {
      await applyClamp(storageService, message.clamp);
      await broadcast(adapter, { type: MSG_TYPES.SET_CLAMP, clamp: !!message.clamp });
      return;
    }
    await broadcast(adapter, { type });
  }

  let dispose = () => {};
  if (adapter && typeof adapter.runtime === 'function') {
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

let bootPromise = null;

/** 惰性装配依赖（首次消息到达时触发，避免阻塞顶层监听器同步注册）。 */
function ensureBooted() {
  if (!bootPromise) {
    bootPromise = (async () => {
      const [{ browserAdapter }, storageMod] = await Promise.all([
        import('../adapter/browser-adapter.js'),
        import('../adapter/storage-service.js').catch(() => ({}))
      ]);
      const storageService = storageMod && typeof storageMod.createStorageService === 'function'
        ? storageMod.createStorageService(browserAdapter)
        : undefined;
      const sw = setupServiceWorker({ adapter: browserAdapter, storageService, autoRegister: false });
      log.info('installed', { reason: 'runtime_detected' });
      return sw;
    })();
  }
  return bootPromise;
}

// 浏览器入口：顶层同步注册 onMessage（MV3 要求），消息到达后惰性装配依赖并分发。
if (hasExtensionRuntime()) {
  const ns = globalThis.chrome || globalThis.browser;
  ns.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void ensureBooted()
      .then((sw) => {
        try { void sw.handler(message); } catch (e) {
          log.warn('handler_error', { msg: e && e.message ? e.message : String(e) });
        }
      })
      .catch((e) => {
        log.warn('bootstrap_failed', { msg: e && e.message ? e.message : String(e) });
      });
    return true;
  });
  log.info('listener_registered', {});
}

export { setupServiceWorker, CONFIG, ERROR_CODES };
