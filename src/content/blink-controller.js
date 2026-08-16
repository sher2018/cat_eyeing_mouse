// path: src/content/blink-controller.js
// M-16 BlinkController —— 缓慢眨眼调度（眨眼动画 FR）。
// 时序：随机间隔 3–5s 触发一次 600ms 眨眼（40% 闭眼 ease-in / 17% 保持 / 43% 睁眼 ease-out）。
// 抑制联动：Hover（抚摸）、拖拽、休息态抑制调度，避免与姿态/拖拽动画叠加冲突。
// 渲染：委托 CanvasStage.playBlink 添加一次性 CSS class（GPU 合成 opacity，主线程零逐帧开销）。

import { createLogger } from '../shared/logger.js';
import {
  BLINK_DURATION_MS,
  BLINK_INTERVAL_MIN_MS,
  BLINK_INTERVAL_MAX_MS
} from '../shared/constants.js';

const log = createLogger('BlinkController');

const CONFIG = Object.freeze({
  DURATION_MS: BLINK_DURATION_MS,
  INTERVAL_MIN_MS: BLINK_INTERVAL_MIN_MS,
  INTERVAL_MAX_MS: BLINK_INTERVAL_MAX_MS
});

const ERROR_CODES = Object.freeze({
  BLK_PLAY_FAILED: 'BLK_PLAY_FAILED'
});

const STATE = Object.freeze({
  IDLE: 'Idle',
  BLINKING: 'Blinking'
});

/** 3–5s 区间内随机间隔（避免机械节拍感，贴近真实猫的不规律眨眼）。 */
function randomInterval() {
  const { INTERVAL_MIN_MS: min, INTERVAL_MAX_MS: max } = CONFIG;
  return min + Math.random() * Math.max(0, max - min);
}

/**
 * 创建眨眼控制器实例。
 * @param {{canvasStage?:object}} [opts]
 * @returns {object} 冻结接口
 */
function createBlinkController({ canvasStage = null } = {}) {
  const internals = {
    state: STATE.IDLE,
    timerId: null,
    suppressions: new Set()
  };

  function clearTimer() {
    if (internals.timerId != null) {
      clearTimeout(internals.timerId);
      internals.timerId = null;
    }
  }

  function scheduleNext() {
    clearTimer();
    if (internals.suppressions.size > 0) return;
    internals.timerId = setTimeout(playOnce, randomInterval());
  }

  function playOnce() {
    internals.timerId = null;
    // 到点时若已被抑制：不播放，等待全部解除后重新调度
    if (internals.suppressions.size > 0) return;
    if (!canvasStage || typeof canvasStage.playBlink !== 'function') return;
    internals.state = STATE.BLINKING;
    log.info('blink_play', {});
    try {
      canvasStage.playBlink(() => {
        internals.state = STATE.IDLE;
        scheduleNext();
      });
    } catch (e) {
      log.warn(ERROR_CODES.BLK_PLAY_FAILED, { msg: e && e.message });
      internals.state = STATE.IDLE;
      scheduleNext();
    }
  }

  function start() {
    if (internals.timerId != null) return;
    scheduleNext();
    log.info('started', { min: CONFIG.INTERVAL_MIN_MS, max: CONFIG.INTERVAL_MAX_MS });
  }

  function stop() {
    clearTimer();
    internals.suppressions.clear();
    internals.state = STATE.IDLE;
    log.info('stopped', {});
  }

  /** 抑制眨眼调度（原因幂等）：hover / drag / rest。 */
  function suppress(reason) {
    internals.suppressions.add(reason || 'default');
    if (internals.suppressions.size === 1) {
      clearTimer();
      log.info('suppressed', { reason });
    }
  }

  /** 解除抑制；全部解除后恢复调度。 */
  function resume(reason) {
    const key = reason || 'default';
    if (!internals.suppressions.has(key)) return;
    internals.suppressions.delete(key);
    if (internals.suppressions.size === 0 && internals.timerId == null) {
      scheduleNext();
      log.info('resumed', { reason: key });
    }
  }

  function isSuppressed() {
    return internals.suppressions.size > 0;
  }

  function getState() {
    return internals.state;
  }

  return Object.freeze({ start, stop, suppress, resume, isSuppressed, getState });
}

export { createBlinkController, CONFIG, ERROR_CODES, STATE };
export default createBlinkController;
