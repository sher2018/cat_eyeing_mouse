// path: src/adapter/resource-loader.js
// M-04 ResourceLoader —— /res 静态资源加载与缓存（DDS §5，绑定 /res）。
// 将相对路径解析为扩展绝对 URL，预加载姿态帧并缓存；加载失败回退透明占位，永不抛异常。

import browserAdapter from './browser-adapter.js';
import { ok } from '../shared/types.js';
import { createLogger } from '../shared/logger.js';
import { MOVE_FRAMES, REST_FRAME, ALL_MOVE_FRAMES } from '../shared/constants.js';

const log = createLogger('ResourceLoader');

/** 透明 1x1 PNG 占位 dataURL */
const FALLBACK_DATAURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const CONFIG = Object.freeze({
  RES_ROOT: 'res',
  FALLBACK_DATAURL,
  MOVE_FRAMES,
  REST_FRAME
});

const ERROR_CODES = Object.freeze({
  RES_LOAD_FAILED: 'RES_LOAD_FAILED',
  RES_URL_UNAVAILABLE: 'RES_URL_UNAVAILABLE'
});

/** 安全获取 runtime 句柄，不可用时返回 null */
function getRuntime(adapter) {
  try {
    return adapter.runtime();
  } catch (e) {
    return null;
  }
}

/** 加载单张图片，永不 reject（load/error 均 resolve） */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ loaded: true, img });
    img.onerror = () => resolve({ loaded: false, img });
    img.src = src;
  });
}

function createResourceLoader(adapter = browserAdapter) {
  const cache = new Map();
  let fallbackEl = null;

  function getFallback() {
    if (fallbackEl) return fallbackEl;
    fallbackEl = new Image();
    fallbackEl.src = CONFIG.FALLBACK_DATAURL;
    return fallbackEl;
  }

  function getUrl(relPath) {
    const rt = getRuntime(adapter);
    if (!rt) {
      log.error('geturl_unavailable', { code: ERROR_CODES.RES_URL_UNAVAILABLE, relPath });
      return CONFIG.FALLBACK_DATAURL;
    }
    return rt.getURL(relPath);
  }

  async function preload(frames = ALL_MOVE_FRAMES) {
    const list = Array.isArray(frames) ? frames : [];
    let failedCount = 0;
    for (const path of list) {
      const url = getUrl(path);
      const res = await loadImage(url);
      if (res.loaded) {
        cache.set(path, res.img);
      } else {
        failedCount += 1;
        log.warn('frame_load_failed', { path, code: ERROR_CODES.RES_LOAD_FAILED });
        cache.set(path, getFallback());
      }
    }
    log.info('preload_done', { count: list.length, failedCount });
    return ok(undefined);
  }

  function get(sector) {
    const path = CONFIG.MOVE_FRAMES[sector];
    if (path && cache.has(path)) return ok(cache.get(path));
    log.warn('frame_not_cached', { sector, path, code: ERROR_CODES.RES_LOAD_FAILED });
    return ok(getFallback());
  }

  function invalidate() {
    cache.clear();
    fallbackEl = null;
  }

  return Object.freeze({ getUrl, preload, get, getFallback, invalidate });
}

const resourceLoader = createResourceLoader();

export { createResourceLoader, resourceLoader, CONFIG, ERROR_CODES };
export default resourceLoader;
