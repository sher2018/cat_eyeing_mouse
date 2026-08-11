// path: src/content/canvas-stage.js
// M-09 CanvasStage —— Canvas 2D 绘制宿主与 rAF 循环（DDS §10，FR-004 AC3/AC4、NFR-002/007）。
// 上游：M-08 TransitionRenderer、M-13 OverlayContainer；下游：浏览器 Canvas 2D + rAF。

import { createLogger } from '../shared/logger.js';
import { DPR_CAP, RAF_SUSPEND_ON_HIDDEN } from '../shared/constants.js';

const log = createLogger('CanvasStage');

const CONFIG = Object.freeze({
  DPR_CAP,
  SUSPEND_ON_HIDDEN: RAF_SUSPEND_ON_HIDDEN
});

const ERROR_CODES = Object.freeze({
  CANVAS_UNAVAILABLE: 'CANVAS_UNAVAILABLE',
  DRAW_ERROR: 'DRAW_ERROR'
});

const STATE = Object.freeze({
  UNMOUNTED: 'UNMOUNTED',
  RUNNING: 'RUNNING',
  SUSPENDED: 'SUSPENDED'
});

/** 读取并截断 devicePixelRatio，防止高分屏过载（NFR-007）。 */
function resolveDpr() {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return Math.min(Math.max(1, dpr), CONFIG.DPR_CAP);
}

/** 安全创建 2D context，不可用返回 null。 */
function createContext(canvas) {
  try {
    const ctx = canvas.getContext('2d');
    return ctx || null;
  } catch (e) {
    log.error(ERROR_CODES.CANVAS_UNAVAILABLE, { msg: e && e.message });
    return null;
  }
}

function createCanvasStage() {
  const internals = {
    state: STATE.UNMOUNTED,
    canvas: null,
    ctx: null,
    size: { w: 0, h: 0 },
    dpr: 1,
    visibilityHandler: null
  };

  function applySize(size) {
    const dpr = resolveDpr();
    internals.dpr = dpr;
    internals.size = { w: size.w, h: size.h };
    const cv = internals.canvas;
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    cv.style.width = `${size.w}px`;
    cv.style.height = `${size.h}px`;
    internals.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function attachVisibility() {
    if (typeof document === 'undefined' || !CONFIG.SUSPEND_ON_HIDDEN) return;
    const handler = () => {
      if (document.hidden) suspend();
      else resume();
    };
    document.addEventListener('visibilitychange', handler);
    internals.visibilityHandler = handler;
  }

  function detachVisibility() {
    if (!internals.visibilityHandler) return;
    document.removeEventListener('visibilitychange', internals.visibilityHandler);
    internals.visibilityHandler = null;
  }

  function mount(hostEl, size) {
    if (internals.state !== STATE.UNMOUNTED) unmount();
    if (!hostEl || typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    const ctx = createContext(canvas);
    if (!ctx) {
      log.error(ERROR_CODES.CANVAS_UNAVAILABLE, {});
      return;
    }
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    internals.canvas = canvas;
    internals.ctx = ctx;
    applySize(size);
    hostEl.appendChild(canvas);
    internals.state = STATE.RUNNING;
    attachVisibility();
    log.info('mounted', { w: size.w, h: size.h, dpr: internals.dpr });
  }

  function unmount() {
    if (internals.state === STATE.UNMOUNTED) return;
    detachVisibility();
    if (internals.canvas && internals.canvas.parentNode) {
      internals.canvas.parentNode.removeChild(internals.canvas);
    }
    internals.canvas = null;
    internals.ctx = null;
    internals.state = STATE.UNMOUNTED;
    log.info('unmounted', {});
  }

  function setSize(size) {
    if (internals.state === STATE.UNMOUNTED || !internals.canvas) return;
    applySize(size);
  }

  function getSize() {
    return Object.freeze({ w: internals.size.w, h: internals.size.h });
  }

  function drawImage(img) {
    if (!internals.ctx || internals.state === STATE.UNMOUNTED) return;
    if (!img) return;
    try {
      internals.ctx.clearRect(0, 0, internals.size.w, internals.size.h);
      internals.ctx.drawImage(img, 0, 0, internals.size.w, internals.size.h);
    } catch (e) {
      log.warn(ERROR_CODES.DRAW_ERROR, { msg: e && e.message });
    }
  }

  function requestFrame(cb) {
    if (internals.state !== STATE.RUNNING) return;
    if (typeof cb !== 'function') return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    if (!raf) {
      try { cb(internals.ctx); } catch (e) { log.warn(ERROR_CODES.DRAW_ERROR, { msg: e && e.message }); }
      return;
    }
    raf(() => {
      if (internals.state !== STATE.RUNNING) return;
      try { cb(internals.ctx); } catch (e) { log.warn(ERROR_CODES.DRAW_ERROR, { msg: e && e.message }); }
    });
  }

  function suspend() {
    if (internals.state !== STATE.RUNNING) return;
    internals.state = STATE.SUSPENDED;
    log.info('suspended', {});
  }

  function resume() {
    if (internals.state !== STATE.SUSPENDED) return;
    internals.state = STATE.RUNNING;
    log.info('resumed', {});
  }

  function getState() {
    return internals.state;
  }

  return Object.freeze({ mount, unmount, drawImage, requestFrame, setSize, getSize, suspend, resume, getState });
}

export { createCanvasStage, CONFIG, ERROR_CODES, STATE };
export default createCanvasStage;
