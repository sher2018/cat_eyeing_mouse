// path: src/adapter/i18n-service.js
// M-03 I18nService —— WebExtension i18n 封装（DDS §4，绑定根目录 /_locales）。
// 语言包加载由原生 getMessage 接管，本模块只做封装 + 缺失回退 + 语言映射。
// 所有方法永不抛异常；key 缺失返回 key 本身并记 WARN。

import browserAdapter from './browser-adapter.js';
import { createLogger } from '../shared/logger.js';
import { DEFAULT_LOCALE, LOCALE_MAP } from '../shared/constants.js';

const log = createLogger('I18nService');

const CONFIG = Object.freeze({
  DEFAULT_LOCALE,
  LOCALE_MAP
});

const ERROR_CODES = Object.freeze({
  I18N_KEY_MISSING: 'I18N_KEY_MISSING',
  I18N_UNAVAILABLE: 'I18N_UNAVAILABLE'
});

/** 安全获取 i18n 句柄，不可用时返回 null */
function getI18n(adapter) {
  try {
    return adapter.i18n();
  } catch (e) {
    log.error('i18n_unavailable', { code: ERROR_CODES.I18N_UNAVAILABLE });
    return null;
  }
}

function createI18nService(adapter = browserAdapter) {
  let cachedLocale = null;

  /** 解析当前生效语言：getUILanguage → LOCALE_MAP → DEFAULT_LOCALE */
  function resolveLocale() {
    if (cachedLocale) return cachedLocale;
    const ii = getI18n(adapter);
    const uiLang = ii ? ii.getUILanguage() : '';
    cachedLocale = CONFIG.LOCALE_MAP[uiLang] || CONFIG.DEFAULT_LOCALE;
    log.info('locale_resolved', { uiLang, resolved: cachedLocale });
    return cachedLocale;
  }

  function t(key, substitutions) {
    const ii = getI18n(adapter);
    if (!ii) {
      log.error('i18n_unavailable', { code: ERROR_CODES.I18N_UNAVAILABLE, key });
      return key;
    }
    const text = ii.getMessage(key, substitutions);
    if (!text) {
      log.warn('key_missing', { key, locale: resolveLocale(), code: ERROR_CODES.I18N_KEY_MISSING });
      return key;
    }
    return text;
  }

  function getLocale() {
    return resolveLocale();
  }

  function hasKey(key) {
    const ii = getI18n(adapter);
    if (!ii) return false;
    return Boolean(ii.getMessage(key));
  }

  function bulk(keys) {
    const list = Array.isArray(keys) ? keys : [];
    const out = {};
    for (const key of list) {
      out[key] = t(key);
    }
    return out;
  }

  return Object.freeze({ t, getLocale, hasKey, bulk });
}

const i18nService = createI18nService();

export { createI18nService, i18nService, CONFIG, ERROR_CODES };
export default i18nService;
