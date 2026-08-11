// path: src/adapter/storage-service.js
// M-02 StorageService —— chrome.storage.local 的 Promise 化封装（DDS §3）。
// 所有方法返回 Promise<Result>，永不抛异常；storage 不可用时降级为 STORAGE_UNAVAILABLE。

import browserAdapter from './browser-adapter.js';
import { ok, err } from '../shared/types.js';
import { createLogger } from '../shared/logger.js';
import { KEY_POSITION, KEY_SETTINGS, DEFAULT_SETTINGS } from '../shared/constants.js';

const log = createLogger('StorageService');

const CONFIG = Object.freeze({
  KEY_POSITION,
  KEY_SETTINGS,
  DEFAULT_SETTINGS
});

const ERROR_CODES = Object.freeze({
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  STORAGE_QUOTA: 'STORAGE_QUOTA'
});

const QUOTA_HINT = 'quota';

/** 判断值是否为普通对象（非数组、非 null） */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 深度合并两个普通对象（纯函数，source 覆盖 target 的同名键） */
function deepMerge(target, source) {
  const base = isPlainObject(target) ? target : {};
  const out = { ...base };
  if (!isPlainObject(source)) return out;
  for (const key of Object.keys(source)) {
    const tv = base[key];
    const sv = source[key];
    out[key] = isPlainObject(tv) && isPlainObject(sv) ? deepMerge(tv, sv) : sv;
  }
  return out;
}

/** 将底层存储错误分类为业务错误码（写操作且命中 quota 提示 → STORAGE_QUOTA） */
function classifyStorageError(error, isWrite) {
  const msg = String((error && (error.message || error.code)) || '').toLowerCase();
  if (isWrite && msg.includes(QUOTA_HINT)) return ERROR_CODES.STORAGE_QUOTA;
  return ERROR_CODES.STORAGE_UNAVAILABLE;
}

/** 安全获取 storage 句柄，不可用时返回 null */
function getStorage(adapter) {
  try {
    return adapter.storage();
  } catch (e) {
    log.error('storage_unavailable', { code: ERROR_CODES.STORAGE_UNAVAILABLE });
    return null;
  }
}

function createStorageService(adapter = browserAdapter) {
  async function getPosition() {
    const store = getStorage(adapter);
    if (!store) return err(ERROR_CODES.STORAGE_UNAVAILABLE, 'storage API unavailable');
    try {
      const data = await store.localGet(CONFIG.KEY_POSITION);
      const pos = data ? data[CONFIG.KEY_POSITION] : undefined;
      return ok(pos === undefined ? null : pos);
    } catch (e) {
      return err(classifyStorageError(e, false), 'getPosition failed', { cause: e });
    }
  }

  async function setPosition(pos) {
    const store = getStorage(adapter);
    if (!store) return err(ERROR_CODES.STORAGE_UNAVAILABLE, 'storage API unavailable');
    try {
      await store.localSet({ [CONFIG.KEY_POSITION]: pos });
      log.info('position_saved', { x: pos.x, y: pos.y });
      return ok(undefined);
    } catch (e) {
      return err(classifyStorageError(e, true), 'setPosition failed', { cause: e });
    }
  }

  async function getSettings() {
    const store = getStorage(adapter);
    if (!store) return err(ERROR_CODES.STORAGE_UNAVAILABLE, 'storage API unavailable');
    try {
      const data = await store.localGet(CONFIG.KEY_SETTINGS);
      const raw = data ? data[CONFIG.KEY_SETTINGS] : undefined;
      if (!isPlainObject(raw)) {
        if (raw !== undefined) log.warn('settings_corrupt_merged', { rawType: typeof raw });
        return ok({ ...CONFIG.DEFAULT_SETTINGS });
      }
      return ok(deepMerge(CONFIG.DEFAULT_SETTINGS, raw));
    } catch (e) {
      return err(classifyStorageError(e, false), 'getSettings failed', { cause: e });
    }
  }

  async function setSettings(settings) {
    const store = getStorage(adapter);
    if (!store) return err(ERROR_CODES.STORAGE_UNAVAILABLE, 'storage API unavailable');
    try {
      const data = await store.localGet(CONFIG.KEY_SETTINGS);
      const current = isPlainObject(data && data[CONFIG.KEY_SETTINGS])
        ? data[CONFIG.KEY_SETTINGS]
        : CONFIG.DEFAULT_SETTINGS;
      const merged = deepMerge(current, settings);
      await store.localSet({ [CONFIG.KEY_SETTINGS]: merged });
      log.info('settings_saved', { keys: Object.keys(settings) });
      return ok(undefined);
    } catch (e) {
      return err(classifyStorageError(e, true), 'setSettings failed', { cause: e });
    }
  }

  async function clear(key) {
    const store = getStorage(adapter);
    if (!store) return err(ERROR_CODES.STORAGE_UNAVAILABLE, 'storage API unavailable');
    try {
      await store.localSet({ [key]: undefined });
      log.info('key_cleared', { key });
      return ok(undefined);
    } catch (e) {
      return err(classifyStorageError(e, true), 'clear failed', { cause: e });
    }
  }

  return Object.freeze({ getPosition, setPosition, getSettings, setSettings, clear, deepMerge });
}

const storageService = createStorageService();

export { createStorageService, storageService, CONFIG, ERROR_CODES, deepMerge };
export default storageService;
