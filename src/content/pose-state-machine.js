// path: src/content/pose-state-machine.js
// M-07 PoseStateMachine —— 8 扇区姿态状态机（DDS §8，FR-003）。
// 上游：M-13 OverlayContainer 驱动 update/setHover；下游：M-08 TransitionRenderer 订阅 onPoseChange。
// 依赖：M-05 geometry.classifySector、M-06 constants.SectorId。

import { createLogger } from '../shared/logger.js';
import { SectorId } from '../shared/constants.js';
import { classifySector, computeDelta } from '../shared/geometry.js';

const log = createLogger('PoseStateMachine');

const CONFIG = Object.freeze({
  DEBOUNCE_SAME_SECTOR: true
});

const ERROR_CODES = Object.freeze({
  PSM_LISTENER_ERROR: 'PSM_LISTENER_ERROR'
});

const STATE = Object.freeze({
  TRACKING: 'Tracking',
  HOVER: 'Hover',
  RESTING: 'Resting'
});

/** 安全触发订阅者，单个抛错不影响其它（DDS §8.6）。 */
function emit(listeners, payload, onErrorEvent) {
  for (const cb of listeners) {
    try { cb(payload); } catch (e) {
      log.error(ERROR_CODES.PSM_LISTENER_ERROR, { event: onErrorEvent, msg: e && e.message });
    }
  }
}

/**
 * 创建姿态状态机实例。
 * @param {{hoverRadius?:number}} [opts]
 * @returns {object} 冻结接口
 */
function createPoseStateMachine({ hoverRadius = 0 } = {}) {
  const radius = Math.max(0, hoverRadius);
  const poseListeners = new Set();
  const hoverListeners = new Set();
  const internals = {
    state: STATE.TRACKING,
    current: SectorId.CENTER,
    hover: false,
    mouseOutside: false
  };

  function notifyPose(from, to) {
    if (from === to) return;
    internals.current = to;
    log.info('sector_change', { from, to });
    emit(poseListeners, to, 'onPoseChange');
  }

  function setHover(isHovering) {
    const next = !!isHovering;
    if (next === internals.hover) return;
    internals.hover = next;
    if (next) {
      internals.state = STATE.HOVER;
      const from = internals.current;
      internals.current = SectorId.CENTER;
      log.info('hover_change', { hover: true });
      emit(hoverListeners, true, 'onHoverChange');
      if (from !== SectorId.CENTER) emit(poseListeners, SectorId.CENTER, 'onPoseChange');
    } else {
      internals.state = STATE.TRACKING;
      log.info('hover_change', { hover: false });
      emit(hoverListeners, false, 'onHoverChange');
    }
  }

  function update(pointer, catCenter) {
    if (internals.state === STATE.RESTING) return;
    if (internals.mouseOutside) return;
    if (!pointer || !catCenter) return;
    const { dx, dy } = computeDelta(catCenter, pointer);
    const target = internals.hover ? SectorId.CENTER : classifySector(dx, dy, radius);
    if (CONFIG.DEBOUNCE_SAME_SECTOR && target === internals.current) return;
    notifyPose(internals.current, target);
  }

  function current() {
    return internals.current;
  }

  function onPoseChange(cb) {
    if (typeof cb !== 'function') return () => {};
    poseListeners.add(cb);
    return () => poseListeners.delete(cb);
  }

  function onHoverChange(cb) {
    if (typeof cb !== 'function') return () => {};
    hoverListeners.add(cb);
    return () => hoverListeners.delete(cb);
  }

  function enterResting() {
    if (internals.state === STATE.RESTING) return;
    internals.state = STATE.RESTING;
    log.info('state_change', { state: STATE.RESTING });
  }

  function exitResting() {
    if (internals.state !== STATE.RESTING) return;
    internals.state = internals.hover ? STATE.HOVER : STATE.TRACKING;
    log.info('state_change', { state: internals.state });
  }

  function notifyMouseLeave() {
    if (internals.mouseOutside) return;
    internals.mouseOutside = true;
    if (internals.state === STATE.RESTING) return;
    if (internals.current !== SectorId.CENTER) {
      notifyPose(internals.current, SectorId.CENTER);
    }
    log.info('mouse_leave', {});
  }

  function notifyMouseReenter() {
    if (!internals.mouseOutside) return;
    internals.mouseOutside = false;
    log.info('mouse_reenter', {});
  }

  function getState() {
    return internals.state;
  }

  return Object.freeze({
    update,
    setHover,
    current,
    onPoseChange,
    onHoverChange,
    enterResting,
    exitResting,
    notifyMouseLeave,
    notifyMouseReenter,
    getState
  });
}

export { createPoseStateMachine, CONFIG, ERROR_CODES, STATE };
export default createPoseStateMachine;
