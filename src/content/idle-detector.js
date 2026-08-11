// path: src/content/idle-detector.js
// M-11 IdleDetector —— 鼠标静止计时与休息态唤醒（DDS §12，FR-008、NFR-002）。
// 上游：M-07 PoseStateMachine、M-08 TransitionRenderer 订阅 onIdle/onWake；下游：document mousemove + 定时器。

import { createLogger } from '../shared/logger.js';
import { IDLE_THRESHOLD_MS, WAKE_DEBOUNCE_MS } from '../shared/constants.js';

const log = createLogger('IdleDetector');

const CONFIG = Object.freeze({
  IDLE_THRESHOLD_MS,
  WAKE_DEBOUNCE_MS
});

const ERROR_CODES = Object.freeze({
  IDLE_TIMER_FAIL: 'IDLE_TIMER_FAIL'
});

const STATE = Object.freeze({
  ACTIVE: 'Active',
  IDLE: 'Idle'
});

/**
 * 创建空闲检测器实例。
 * @param {{threshold?:number, wakeDebounce?:number}} [opts]
 * @returns {object} 冻结接口
 */
function createIdleDetector({ threshold = CONFIG.IDLE_THRESHOLD_MS, wakeDebounce = CONFIG.WAKE_DEBOUNCE_MS } = {}) {
  const idleListeners = new Set();
  const wakeListeners = new Set();
  const internals = {
    state: STATE.ACTIVE,
    thresholdMs: threshold,
    timerId: null,
    moveHandler: null,
    lastMoveAt: 0,
    wakeTimerId: null,
    idleSince: 0
  };

  function emitIdle() {
    log.info('enter_idle', { idleMs: internals.thresholdMs });
    for (const cb of idleListeners) {
      try { cb(); } catch (e) { log.warn(ERROR_CODES.IDLE_TIMER_FAIL, { msg: e && e.message }); }
    }
  }

  function emitWake() {
    const rested = internals.idleSince ? Date.now() - internals.idleSince : 0;
    log.info('wake', { restedMs: rested });
    for (const cb of wakeListeners) {
      try { cb(); } catch (e) { log.warn(ERROR_CODES.IDLE_TIMER_FAIL, { msg: e && e.message }); }
    }
  }

  function clearTimer() {
    if (internals.timerId !== null) {
      clearTimeout(internals.timerId);
      internals.timerId = null;
    }
  }

  function clearWakeDebounce() {
    if (internals.wakeTimerId !== null) {
      clearTimeout(internals.wakeTimerId);
      internals.wakeTimerId = null;
    }
  }

  function arm() {
    clearTimer();
    try {
      internals.timerId = setTimeout(() => {
        internals.timerId = null;
        if (internals.state !== STATE.ACTIVE) return;
        internals.state = STATE.IDLE;
        internals.idleSince = Date.now();
        emitIdle();
      }, internals.thresholdMs);
    } catch (e) {
      log.warn(ERROR_CODES.IDLE_TIMER_FAIL, { msg: e && e.message });
    }
  }

  function onMove() {
    internals.lastMoveAt = Date.now();
    if (internals.state === STATE.IDLE) {
      clearWakeDebounce();
      internals.wakeTimerId = setTimeout(() => {
        internals.wakeTimerId = null;
        if (internals.state !== STATE.IDLE) return;
        internals.state = STATE.ACTIVE;
        internals.idleSince = 0;
        emitWake();
      }, wakeDebounce);
    }
    arm();
  }

  function start(thresholdMs) {
    if (typeof thresholdMs === 'number' && thresholdMs > 0) internals.thresholdMs = thresholdMs;
    if (internals.moveHandler) return;
    if (typeof document === 'undefined') {
      log.warn(ERROR_CODES.IDLE_TIMER_FAIL, { reason: 'no_document' });
      return;
    }
    internals.moveHandler = onMove;
    document.addEventListener('mousemove', internals.moveHandler);
    internals.state = STATE.ACTIVE;
    arm();
  }

  function stop() {
    if (internals.moveHandler && typeof document !== 'undefined') {
      document.removeEventListener('mousemove', internals.moveHandler);
    }
    internals.moveHandler = null;
    clearTimer();
    clearWakeDebounce();
    internals.state = STATE.ACTIVE;
  }

  function reset() {
    if (!internals.moveHandler) return;
    onMove();
  }

  function onIdle(cb) {
    if (typeof cb !== 'function') return () => {};
    idleListeners.add(cb);
    return () => idleListeners.delete(cb);
  }

  function onWake(cb) {
    if (typeof cb !== 'function') return () => {};
    wakeListeners.add(cb);
    return () => wakeListeners.delete(cb);
  }

  function isIdle() {
    return internals.state === STATE.IDLE;
  }

  return Object.freeze({ start, stop, reset, onIdle, onWake, isIdle });
}

export { createIdleDetector, CONFIG, ERROR_CODES, STATE };
export default createIdleDetector;
