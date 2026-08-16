// path: src/content/canvas-stage.js
// M-09 CanvasStage —— CSS Sprite 宿主（主）与 Canvas 2D 绘制（备选）+ rAF 循环（DDS §10）。
// 主模式：CSS background-position 切换（GPU 合成，无重绘/闪烁）。
// 备选模式：Canvas 2D drawImage（crossfade/rest 帧使用）。

import { createLogger } from '../shared/logger.js';
import {
  DPR_CAP,
  RAF_SUSPEND_ON_HIDDEN,
  CSS_FRAME_CLASS_PREFIX,
  BLINK_LAYER_CLASS,
  BLINK_PLAY_CLASS,
  BLINK_DURATION_MS
} from '../shared/constants.js';

const log = createLogger('CanvasStage');

const CONFIG = Object.freeze({
  DPR_CAP,
  SUSPEND_ON_HIDDEN: RAF_SUSPEND_ON_HIDDEN,
  FRAME_CLASS_PREFIX: CSS_FRAME_CLASS_PREFIX,
  BLINK_LAYER_CLASS,
  BLINK_PLAY_CLASS,
  BLINK_DURATION_MS
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
    spriteEl: null,
    blinkEl: null,
    blinkReady: false,
    blinkSpriteUrl: '',
    blinkRestUrl: '',
    spriteMode: false,
    currentFrameClass: '',
    size: { w: 0, h: 0 },
    dpr: 1,
    visibilityHandler: null
  };

  function applySize(size) {
    const dpr = resolveDpr();
    internals.dpr = dpr;
    internals.size = { w: size.w, h: size.h };
    const cv = internals.canvas;
    if (cv) {
      cv.width = Math.round(size.w * dpr);
      cv.height = Math.round(size.h * dpr);
      cv.style.width = `${size.w}px`;
      cv.style.height = `${size.h}px`;
    }
    if (internals.ctx) {
      internals.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (internals.spriteEl) {
      internals.spriteEl.style.width = `${size.w}px`;
      internals.spriteEl.style.height = `${size.h}px`;
    }
    if (internals.blinkEl) {
      internals.blinkEl.style.width = `${size.w}px`;
      internals.blinkEl.style.height = `${size.h}px`;
    }
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

    // CSS Sprite 宿主元素（主模式，DDS §10.2 setSpriteFrame）
    const spriteEl = document.createElement('div');
    spriteEl.style.cssText = `width:${size.w}px;height:${size.h}px;background-repeat:no-repeat;display:none;pointer-events:none;`;
    internals.spriteEl = spriteEl;
    hostEl.appendChild(spriteEl);

    // 眨眼图层（blink_sprite 叠加在 spriteEl 之上，opacity 0 常驻，播放时 CSS 合成透明度）
    const blinkEl = document.createElement('div');
    blinkEl.className = CONFIG.BLINK_LAYER_CLASS;
    blinkEl.style.cssText = `width:${size.w}px;height:${size.h}px;position:absolute;left:0;top:0;background-repeat:no-repeat;opacity:0;pointer-events:none;display:none;`;
    internals.blinkEl = blinkEl;
    hostEl.appendChild(blinkEl);

    // Canvas 2D（备选模式）
    const canvas = document.createElement('canvas');
    const ctx = createContext(canvas);
    if (ctx) {
      canvas.style.display = 'block';
      canvas.style.pointerEvents = 'none';
      internals.canvas = canvas;
      internals.ctx = ctx;
      applySize(size);
      hostEl.appendChild(canvas);
    } else {
      log.error(ERROR_CODES.CANVAS_UNAVAILABLE, {});
    }

    internals.size = { w: size.w, h: size.h };
    internals.state = STATE.RUNNING;
    attachVisibility();
    log.info('mounted', { w: size.w, h: size.h, dpr: internals.dpr });
  }

  function unmount() {
    if (internals.state === STATE.UNMOUNTED) return;
    detachVisibility();
    if (internals.spriteEl && internals.spriteEl.parentNode) {
      internals.spriteEl.parentNode.removeChild(internals.spriteEl);
    }
    if (internals.blinkEl && internals.blinkEl.parentNode) {
      internals.blinkEl.parentNode.removeChild(internals.blinkEl);
    }
    if (internals.canvas && internals.canvas.parentNode) {
      internals.canvas.parentNode.removeChild(internals.canvas);
    }
    internals.spriteEl = null;
    internals.blinkEl = null;
    internals.blinkReady = false;
    internals.canvas = null;
    internals.ctx = null;
    internals.spriteMode = false;
    internals.currentFrameClass = '';
    internals.state = STATE.UNMOUNTED;
    log.info('unmounted', {});
  }

  function setSize(size) {
    if (internals.state === STATE.UNMOUNTED) return;
    applySize(size);
  }

  function getSize() {
    return Object.freeze({ w: internals.size.w, h: internals.size.h });
  }

  /** CSS 雪碧图模式：设置背景图并显示 sprite div（隐藏 canvas）。 */
  function setSpriteBackground(url) {
    if (!internals.spriteEl || !url) return;
    internals.spriteEl.style.backgroundImage = `url("${url}")`;
    internals.spriteEl.style.display = 'block';
    internals.spriteMode = true;
    if (internals.canvas) internals.canvas.style.display = 'none';
  }

  /** CSS 雪碧图模式：切换 background-position 帧类（DDS §10.2 setSpriteFrame），眨眼图层同步帧。 */
  function setSpriteFrame(idx) {
    if (!internals.spriteEl) return;
    const newClass = `${CONFIG.FRAME_CLASS_PREFIX}${idx}`;
    if (internals.currentFrameClass) {
      internals.spriteEl.classList.remove(internals.currentFrameClass);
      if (internals.blinkEl) internals.blinkEl.classList.remove(internals.currentFrameClass);
    }
    internals.spriteEl.classList.add(newClass);
    if (internals.blinkEl) internals.blinkEl.classList.add(newClass);
    internals.currentFrameClass = newClass;
  }

  /** 眨眼图层：设置 blink_sprite 背景图（预加载 1 次请求）。 */
  function setBlinkBackground(url) {
    if (!internals.blinkEl || !url) return;
    internals.blinkSpriteUrl = url;
    if (internals.spriteMode) {
      internals.blinkEl.style.backgroundImage = `url("${url}")`;
      internals.blinkEl.style.display = 'block';
    }
    internals.blinkReady = true;
  }

  /** 眨眼图层：设置休息态闭眼图（rest 阶段整图叠加，无帧偏移）。 */
  function setBlinkRestBackground(url) {
    if (!internals.blinkEl || !url) return;
    internals.blinkRestUrl = url;
    if (!internals.spriteMode && internals.blinkEl.style.display !== 'none') {
      // 已处于 rest 展示中，立即应用
      applyRestBlink();
    }
  }

  /** 眨眼层切换到 rest 闭眼整图：去帧类、归零偏移。 */
  function applyRestBlink() {
    const el = internals.blinkEl;
    if (!el || !internals.blinkRestUrl) return;
    if (internals.currentFrameClass) el.classList.remove(internals.currentFrameClass);
    el.style.backgroundImage = `url("${internals.blinkRestUrl}")`;
    el.style.backgroundPosition = '0 0';
    el.style.display = 'block';
  }

  /** 播放一次眨眼动画（600ms：40% 闭眼 ease-in / 17% 保持 / 43% 睁眼 ease-out），结束回调 onEnd。 */
  function playBlink(onEnd) {
    const el = internals.blinkEl;
    const playable = el && ((internals.spriteMode && internals.blinkReady) || (!internals.spriteMode && internals.blinkRestUrl));
    if (!playable) {
      if (typeof onEnd === 'function') onEnd();
      return;
    }
    let finished = false;
    let fallbackTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (fallbackTimer != null) clearTimeout(fallbackTimer);
      el.classList.remove(CONFIG.BLINK_PLAY_CLASS);
      if (typeof onEnd === 'function') onEnd();
    };
    el.addEventListener('animationend', finish, { once: true });
    // 兜底：动画被禁用（如 prefers-reduced-motion）时 animationend 不触发
    fallbackTimer = setTimeout(() => {
      el.removeEventListener('animationend', finish);
      finish();
    }, CONFIG.BLINK_DURATION_MS + 200);
    // 重新触发动画：移除 class → 强制 reflow → 重新添加
    el.classList.remove(CONFIG.BLINK_PLAY_CLASS);
    void el.offsetWidth;
    el.classList.add(CONFIG.BLINK_PLAY_CLASS);
  }

  /** 切换到 Canvas 备选模式（rest 帧等使用），眨眼层切换为 rest 闭眼整图待命。 */
  function showCanvas() {
    if (internals.spriteEl) internals.spriteEl.style.display = 'none';
    if (internals.blinkEl) internals.blinkEl.classList.remove(CONFIG.BLINK_PLAY_CLASS);
    if (internals.blinkRestUrl) {
      applyRestBlink();
    } else if (internals.blinkEl) {
      internals.blinkEl.style.display = 'none';
    }
    if (internals.canvas) internals.canvas.style.display = 'block';
    internals.spriteMode = false;
  }

  /** 切换回 CSS 雪碧图模式，眨眼层恢复雪碧图背景与帧偏移。 */
  function showSprite() {
    if (internals.canvas) internals.canvas.style.display = 'none';
    if (internals.spriteEl) internals.spriteEl.style.display = 'block';
    const el = internals.blinkEl;
    if (el && internals.blinkReady) {
      el.style.backgroundImage = `url("${internals.blinkSpriteUrl}")`;
      el.style.backgroundPosition = '';
      if (internals.currentFrameClass) el.classList.add(internals.currentFrameClass);
      el.style.display = 'block';
    }
    internals.spriteMode = true;
  }

  /** Canvas 备选模式：清空并绘制单张图片。 */
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

  function isSpriteMode() {
    return internals.spriteMode;
  }

  return Object.freeze({
    mount, unmount, drawImage, requestFrame, setSize, getSize,
    suspend, resume, getState,
    setSpriteBackground, setSpriteFrame, showCanvas, showSprite, isSpriteMode,
    setBlinkBackground, setBlinkRestBackground, playBlink
  });
}

export { createCanvasStage, CONFIG, ERROR_CODES, STATE };
export default createCanvasStage;
