// path: src/content/transition-renderer.js
// M-08 CanvasTransitionRenderer —— 姿态过渡渲染（DDS §9，FR-004）。
// 上游：M-07 PoseStateMachine 订阅 onPoseChange→playTo；下游：M-04 ResourceLoader、M-09 CanvasStage。

import { createLogger } from '../shared/logger.js';
import {
  SectorId,
  TRANSITION_THROTTLE_MS,
  TRANSITION_DURATION_MS,
  TRANSITION_FRAME_DIR
} from '../shared/constants.js';

const log = createLogger('TransitionRenderer');

const CONFIG = Object.freeze({
  MODE_FRAMES: 'frames',
  MODE_CROSSFADE: 'crossfade',
  THROTTLE_MS: TRANSITION_THROTTLE_MS,
  CROSSFADE_MS: TRANSITION_DURATION_MS,
  FRAME_DIR: TRANSITION_FRAME_DIR
});

const ERROR_CODES = Object.freeze({
  TR_FRAMES_MISSING: 'TR_FRAMES_MISSING',
  TR_RENDER_FAILED: 'TR_RENDER_FAILED'
});

const STATE = Object.freeze({
  IDLE: 'Idle',
  PLAYING: 'Playing'
});

/** 降级链：frames 序列缺失 → crossfade → 硬切（DDS §9.6）。 */

/**
 * 创建过渡渲染器实例。
 * @param {{canvasStage?:object, resourceLoader?:object, mode?:string}} [opts]
 * @returns {object} 冻结接口
 */
function createCanvasTransitionRenderer({ canvasStage = null, resourceLoader = null, mode = CONFIG.MODE_FRAMES } = {}) {
  const completeListeners = new Set();
  const internals = {
    state: STATE.IDLE,
    mode: mode === CONFIG.MODE_CROSSFADE ? CONFIG.MODE_CROSSFADE : CONFIG.MODE_FRAMES,
    current: SectorId.CENTER,
    rafId: null,
    lastPlayAt: 0,
    pendingTarget: null,
    startTime: 0,
    fromImg: null,
    toImg: null
  };

  function emitComplete() {
    for (const cb of completeListeners) {
      try { cb(); } catch (e) { log.warn(ERROR_CODES.TR_RENDER_FAILED, { msg: e && e.message }); }
    }
  }

  function clearRaf() {
    internals.rafId = null;
  }

  function getImage(sector) {
    if (!resourceLoader || typeof resourceLoader.get !== 'function') return null;
    const result = resourceLoader.get(sector);
    return result && result.ok ? result.value : null;
  }

  function drawCrossfade(ctx, t) {
    const { fromImg, toImg } = internals;
    const w = (canvasStage && canvasStage.getSize && canvasStage.getSize().w) || 0;
    const h = (canvasStage && canvasStage.getSize && canvasStage.getSize().h) || 0;
    try {
      ctx.clearRect(0, 0, w, h);
      if (fromImg) {
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(fromImg, 0, 0, w, h);
      }
      if (toImg) {
        ctx.globalAlpha = t;
        ctx.drawImage(toImg, 0, 0, w, h);
      }
      ctx.globalAlpha = 1;
    } catch (e) {
      log.warn(ERROR_CODES.TR_RENDER_FAILED, { msg: e && e.message });
    }
  }

  function tick(ctx) {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - internals.startTime;
    const t = Math.min(1, elapsed / CONFIG.CROSSFADE_MS);
    drawCrossfade(ctx, t);
    if (t < 1) {
      scheduleNext(tick);
    } else {
      finishPlay();
    }
  }

  function scheduleNext(stepFn) {
    if (!canvasStage || typeof canvasStage.requestFrame !== 'function') {
      finishPlay();
      return;
    }
    canvasStage.requestFrame((ctx) => {
      if (internals.state !== STATE.PLAYING) return;
      stepFn(ctx);
    });
  }

  function finishPlay() {
    internals.state = STATE.IDLE;
    internals.fromImg = null;
    internals.toImg = null;
    clearRaf();
    emitComplete();
    if (internals.pendingTarget !== null) {
      const next = internals.pendingTarget;
      internals.pendingTarget = null;
      playTo(next);
    }
  }

  function startCrossfade(from, to) {
    internals.fromImg = getImage(from);
    internals.toImg = getImage(to);
    if (!internals.toImg) {
      log.warn(ERROR_CODES.TR_FRAMES_MISSING, { reason: 'no_target_image', sector: to });
      hardCut(to);
      return;
    }
    internals.startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    scheduleNext(tick);
  }

  function hardCut(to) {
    const img = getImage(to);
    if (img && canvasStage && typeof canvasStage.drawImage === 'function') {
      try { canvasStage.drawImage(img); } catch (e) {
        log.warn(ERROR_CODES.TR_RENDER_FAILED, { msg: e && e.message });
      }
    }
    internals.current = to;
    finishPlay();
  }

  function playTo(target) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - internals.lastPlayAt < CONFIG.THROTTLE_MS) {
      internals.pendingTarget = target;
      log.info('throttled_merge', { target });
      return;
    }
    internals.lastPlayAt = now;
    if (internals.state === STATE.PLAYING) {
      log.info('preempted', { newTarget: target });
    }
    const from = internals.current;
    internals.current = target;
    internals.state = STATE.PLAYING;
    log.info('transition_start', { from, to: target, mode: internals.mode });
    if (internals.mode === CONFIG.MODE_FRAMES) {
      log.warn(ERROR_CODES.TR_FRAMES_MISSING, { reason: 'frames_unavailable_fallback_crossfade', from, to: target });
      startCrossfade(from, target);
    } else {
      startCrossfade(from, target);
    }
  }

  function cancel() {
    internals.state = STATE.IDLE;
    internals.pendingTarget = null;
    internals.fromImg = null;
    internals.toImg = null;
    clearRaf();
  }

  function isActive() {
    return internals.state === STATE.PLAYING;
  }

  function setMode(nextMode) {
    internals.mode = nextMode === CONFIG.MODE_CROSSFADE ? CONFIG.MODE_CROSSFADE : CONFIG.MODE_FRAMES;
  }

  function onComplete(cb) {
    if (typeof cb !== 'function') return () => {};
    completeListeners.add(cb);
    return () => completeListeners.delete(cb);
  }

  return Object.freeze({ playTo, cancel, isActive, onComplete, setMode });
}

export { createCanvasTransitionRenderer, CONFIG, ERROR_CODES, STATE };
export default createCanvasTransitionRenderer;
