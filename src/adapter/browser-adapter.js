// path: src/adapter/browser-adapter.js
// M-01 BrowserAdapter —— 屏蔽 chrome.* 与 browser.* 差异。
// 对齐 DDS §2 接口契约：runtime()/storage()/i18n()/isEdge()/isChrome()/getEnvironment()。

import { createLogger } from '../shared/logger.js';

const log = createLogger('BrowserAdapter');

const ERROR_CODES = Object.freeze({
  UNSUPPORTED_ENV: 'UNSUPPORTED_ENV',
  API_MISSING: 'API_MISSING'
});

/** 命名空间优先级：chrome 优先、browser 回退 */
const NAMESPACE_PREFERENCE = Object.freeze(['chrome', 'browser']);
const SUPPORTED_ENVS = Object.freeze(['chrome', 'edge']);

/**
 * 探测浏览器扩展命名空间。
 * @returns {{ns:object, source:string|null}}
 */
function detectNamespace() {
  for (const name of NAMESPACE_PREFERENCE) {
    const ns = globalThis[name];
    if (ns && typeof ns === 'object') return { ns, source: name };
  }
  return { ns: null, source: null };
}

/** 是否 Chrome 环境 */
function isChrome() {
  return detectNamespace().source === 'chrome';
}

/** 是否 Edge 环境（Chromium 内核，同样暴露 chrome.*） */
function isEdge() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Edg\//i.test(ua);
}

/**
 * 获取运行环境信息。
 * @returns {{browser:string, manifestVersion:string}}
 */
function getEnvironment() {
  const { ns } = detectNamespace();
  const browser = isEdge() ? 'edge' : isChrome() ? 'chrome' : 'unknown';
  const manifestVersion = ns && ns.runtime && ns.runtime.getManifest
    ? String(ns.runtime.getManifest().manifest_version || 0)
    : '0';
  return Object.freeze({ browser, manifestVersion });
}

/** Promise 化 chrome API 回调 */
function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      try {
        fn(...args, (result) => {
          const lastError = getLastError();
          if (lastError) reject(toAppError(ERROR_CODES.API_MISSING, lastError.message || 'runtime error'));
          else resolve(result);
        });
      } catch (e) {
        reject(toAppError(ERROR_CODES.API_MISSING, e && e.message ? e.message : 'api call failed', e));
      }
    });
}

function getLastError() {
  const { ns } = detectNamespace();
  if (!ns || !ns.runtime) return null;
  return ns.runtime.lastError || null;
}

function toAppError(code, message, cause) {
  return Object.freeze({ code, message, cause });
}

/** 统一运行时 API 包装 */
function runtime() {
  const { ns, source } = detectNamespace();
  if (!ns || !ns.runtime) {
    throw makeAdapterError(ERROR_CODES.API_MISSING, 'runtime.* unavailable');
  }
  const rt = ns.runtime;
  return Object.freeze({
    getURL: (relPath) => rt.getURL(relPath),
    // Chrome/Edge 对非字符串首参做可选参数位移：显式传 undefined 会被绑定为 message，导致载荷丢失。
    sendMessage: (msg) => promisify((m, cb) => rt.sendMessage(m, cb))(msg),
    onMessage: (cb) => {
      const listener = (message, sender, sendResponse) => cb(message, sender, sendResponse);
      rt.onMessage.addListener(listener);
      return () => rt.onMessage.removeListener(listener);
    },
    source
  });
}

/** 统一存储 API 包装 */
function storage() {
  const { ns } = detectNamespace();
  if (!ns || !ns.storage || !ns.storage.local) {
    throw makeAdapterError(ERROR_CODES.API_MISSING, 'storage.local unavailable');
  }
  const local = ns.storage.local;
  return Object.freeze({
    localGet: (keys) => promisify((k, cb) => local.get(k, cb))(keys),
    localSet: (items) => promisify((it, cb) => local.set(it, cb))(items)
  });
}

/** 统一 tabs API 包装 */
function tabs() {
  const { ns } = detectNamespace();
  if (!ns || !ns.tabs) {
    throw makeAdapterError(ERROR_CODES.API_MISSING, 'tabs.* unavailable');
  }
  const t = ns.tabs;
  return Object.freeze({
    query: (info) => promisify((i, cb) => t.query(i, cb))(info),
    sendMessage: (tabId, msg) => promisify((id, m, cb) => t.sendMessage(id, m, cb))(tabId, msg)
  });
}

/** 统一 i18n API 包装 */
function i18n() {
  const { ns } = detectNamespace();
  if (!ns || !ns.i18n) {
    throw makeAdapterError(ERROR_CODES.API_MISSING, 'i18n.* unavailable');
  }
  const ii = ns.i18n;
  return Object.freeze({
    getMessage: (key, substitutions) => ii.getMessage(key, substitutions) || '',
    getUILanguage: () => {
      try {
        return typeof ii.getUILanguage === 'function' ? ii.getUILanguage() : '';
      } catch (e) {
        log.warn('getUILanguage_unavailable', { msg: e.message });
        return '';
      }
    }
  });
}

function makeAdapterError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** 健康检查：无任何命名空间时抛 UNSUPPORTED_ENV */
function ensureSupported() {
  const { source } = detectNamespace();
  if (!source) {
    log.error('unsupported_env', { code: ERROR_CODES.UNSUPPORTED_ENV });
    throw makeAdapterError(ERROR_CODES.UNSUPPORTED_ENV, 'no chrome/browser namespace');
  }
}

// 启动即探测并记录
(() => {
  try {
    ensureSupported();
    log.info('env_detected', getEnvironment());
  } catch (e) {
    log.error('init_failed', { code: e.code });
  }
})();

export const browserAdapter = Object.freeze({
  runtime,
  storage,
  tabs,
  i18n,
  isEdge,
  isChrome,
  getEnvironment,
  ensureSupported,
  ERROR_CODES
});

export default browserAdapter;
