// path: src/popup/popup.js
// M-14 PopupView —— Popup UI（DDS §15 / FR-005/006/009）。
// 上游：用户操作；下游：M-03 I18nService、M-04 ResourceLoader、M-01 BrowserAdapter（经 SW 消息）。

import { createLogger } from '../shared/logger.js';
import { KEY_SETTINGS, DEFAULT_SETTINGS, DEFAULT_LOCALE, MSG_TYPES } from '../shared/constants.js';

const log = createLogger('PopupView');

const CONFIG = Object.freeze({
  POPUP_ICON: 'res/icons/icon48.png',
  I18N_ATTR: 'data-i18n-key',
  TOGGLE_BTN_ID: 'btn-toggle',
  CLAMP_INPUT_ID: 'btn-clamp',
  I18N_KEYS: Object.freeze([
    'app_name',
    'action_show',
    'action_hide',
    'action_clamp_viewport',
    'tip_drag_to_move'
  ]),
  SHOW_KEY: 'action_show',
  HIDE_KEY: 'action_hide'
});

const ERROR_CODES = Object.freeze({
  SW_COMM_FAIL: 'SW_COMM_FAIL'
});

/** 探测当前 UI 语言，失败回退默认语言。 */
function detectLocale(i18nService) {
  if (!i18nService || typeof i18nService.getLocale !== 'function') return DEFAULT_LOCALE;
  try {
    const locale = i18nService.getLocale();
    return locale || DEFAULT_LOCALE;
  } catch (_) {
    return DEFAULT_LOCALE;
  }
}

/** 加载文案映射，优先 bulk，否则逐 key 用 t()。 */
function loadCopy(i18nService) {
  const fallback = {};
  if (!i18nService) return fallback;
  if (typeof i18nService.bulk === 'function') {
    try {
      const bulked = i18nService.bulk(CONFIG.I18N_KEYS);
      if (bulked && typeof bulked === 'object') return bulked;
    } catch (_) {
      /* 回退到逐条 */
    }
  }
  if (typeof i18nService.t === 'function') {
    for (const key of CONFIG.I18N_KEYS) {
      try { fallback[key] = i18nService.t(key); } catch (_) { /* 保留缺失 */ }
    }
  }
  return fallback;
}

/** 将文案写入所有 [data-i18n-key] 元素，缺失则显示 key 本身。 */
function applyI18n(documentRef, copy) {
  if (!documentRef || typeof documentRef.querySelectorAll !== 'function') return;
  const nodes = documentRef.querySelectorAll(`[${CONFIG.I18N_ATTR}]`);
  if (!nodes) return;
  nodes.forEach((node) => {
    const key = node.getAttribute(CONFIG.I18N_ATTR);
    node.textContent = copy && copy[key] ? copy[key] : key;
  });
}

/** 注入图标背景（通过 runtime.getURL 解析，避免相对路径歧义）。 */
function applyIcon(documentRef, adapter) {
  if (!documentRef || !adapter || typeof documentRef.querySelector !== 'function') return;
  const icon = documentRef.querySelector('.cem-popup__icon');
  if (!icon) return;
  try {
    const url = adapter.runtime().getURL(CONFIG.POPUP_ICON);
    icon.style.backgroundImage = `url("${url}")`;
  } catch (e) {
    log.warn('icon_resolve_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

/** 读取 storage 同步开关状态与显隐按钮文案。 */
async function syncToggleState(adapter, documentRef, copy) {
  const settings = await readSettings(adapter);
  applyClampState(documentRef, settings);
  applyToggleLabel(documentRef, settings, copy);
  return settings;
}

async function readSettings(adapter) {
  if (!adapter || typeof adapter.storage !== 'function') return DEFAULT_SETTINGS;
  try {
    const bag = await adapter.storage().localGet(KEY_SETTINGS);
    const stored = bag && bag[KEY_SETTINGS];
    return Object.assign({}, DEFAULT_SETTINGS, stored || {});
  } catch (e) {
    log.warn('read_settings_failed', { msg: e && e.message ? e.message : String(e) });
    return DEFAULT_SETTINGS;
  }
}

function applyClampState(documentRef, settings) {
  const clampInput = documentRef && documentRef.getElementById
    ? documentRef.getElementById(CONFIG.CLAMP_INPUT_ID)
    : null;
  if (clampInput) clampInput.checked = !!settings.clampToViewport;
}

function applyToggleLabel(documentRef, settings, copy) {
  const btn = documentRef && documentRef.getElementById
    ? documentRef.getElementById(CONFIG.TOGGLE_BTN_ID)
    : null;
  if (!btn) return;
  const key = settings.hidden ? CONFIG.SHOW_KEY : CONFIG.HIDE_KEY;
  btn.setAttribute(CONFIG.I18N_ATTR, key);
  btn.textContent = copy && copy[key] ? copy[key] : key;
}

/** 向 background 发送消息，失败记 ERROR 并禁用按钮。 */
async function sendToBackground(adapter, documentRef, message) {
  if (!adapter || typeof adapter.runtime !== 'function') return false;
  try {
    await adapter.runtime().sendMessage(message);
    log.info('message_sent', { type: message && message.type });
    return true;
  } catch (e) {
    log.warn(ERROR_CODES.SW_COMM_FAIL, { msg: e && e.message ? e.message : String(e) });
    return false;
  }
}

/** 绑定按钮事件：toggle→sendMessage + 外部回调；clamp 同理。 */
function bindEvents(documentRef, deps) {
  const { adapter, onToggleVisible, onClampChange, flipLocalHidden } = deps;
  const toggleBtn = documentRef.getElementById(CONFIG.TOGGLE_BTN_ID);
  const clampInput = documentRef.getElementById(CONFIG.CLAMP_INPUT_ID);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (typeof flipLocalHidden === 'function') flipLocalHidden();
      fireCallback(onToggleVisible);
      void sendToBackground(adapter, documentRef, { type: MSG_TYPES.TOGGLE_VISIBLE });
    });
  }
  if (clampInput) {
    clampInput.addEventListener('change', () => {
      const checked = !!clampInput.checked;
      fireCallback(onClampChange, checked);
      void sendToBackground(adapter, documentRef, { type: MSG_TYPES.SET_CLAMP, clamp: checked });
    });
  }
}

function fireCallback(cb, payload) {
  if (typeof cb !== 'function') return;
  try { cb(payload); } catch (e) {
    log.warn('callback_error', { msg: e && e.message ? e.message : String(e) });
  }
}

/**
 * 创建 PopupView 实例。
 * @param {{i18nService?:object, adapter?:object, onToggleVisible?:Function, onClampChange?:Function}} [deps]
 * @returns {object} 冻结的 PopupView 接口
 */
function createPopupView({ i18nService, adapter, onToggleVisible, onClampChange } = {}) {
  let initialized = false;
  let localHidden = DEFAULT_SETTINGS.hidden;
  let lastCopy = {};

  function flipLocalHidden() {
    localHidden = !localHidden;
    applyToggleLabel(document, { hidden: localHidden }, lastCopy);
    log.info('local_toggle', { hidden: localHidden });
  }

  async function init() {
    const locale = detectLocale(i18nService);
    log.info('popup_init', { locale });
    lastCopy = loadCopy(i18nService);
    applyI18n(document, lastCopy);
    applyIcon(document, adapter);
    const settings = await syncToggleState(adapter, document, lastCopy);
    localHidden = !!settings.hidden;
    bindEvents(document, { adapter, onToggleVisible, onClampChange, flipLocalHidden });
    initialized = true;
  }

  function render() {
    const copy = loadCopy(i18nService);
    applyI18n(document, copy);
  }

  return Object.freeze({ init, render });
}

/** 浏览器入口：装配真实依赖并启动（测试环境跳过）。 */
async function bootstrap() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const [{ browserAdapter }, i18nMod, storageMod] = await Promise.all([
    import('../adapter/browser-adapter.js'),
    import('../adapter/i18n-service.js').catch(() => ({})),
    import('../adapter/storage-service.js').catch(() => ({}))
  ]);
  const i18nService = i18nMod && typeof i18nMod.createI18nService === 'function'
    ? i18nMod.createI18nService(browserAdapter)
    : undefined;
  const view = createPopupView({ i18nService, adapter: browserAdapter });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => view.init());
  } else {
    void view.init();
  }
}

void bootstrap().catch((e) => log.warn('bootstrap_failed', { msg: e && e.message ? e.message : String(e) }));

export { createPopupView, CONFIG, ERROR_CODES };
