// path: src/content/drag-controller.js
// M-10 DragController —— Pointer Events 拖拽与越界回收（DDS §11，FR-002、§6 边界）。
// 上游：M-13 OverlayContainer；下游：M-02 StorageService（落点持久化）。

import { createLogger } from '../shared/logger.js';
import { DRAG_MOVE_THRESHOLD_PX, DRAG_EDGE_MARGIN_PX } from '../shared/constants.js';

const log = createLogger('DragController');

const CONFIG = Object.freeze({
  MOVE_THRESHOLD_PX: DRAG_MOVE_THRESHOLD_PX,
  EDGE_MARGIN_PX: DRAG_EDGE_MARGIN_PX
});

const ERROR_CODES = Object.freeze({
  DRAG_STORAGE_FAIL: 'DRAG_STORAGE_FAIL'
});

const STATE = Object.freeze({
  IDLE: 'Idle',
  DRAGGING: 'Dragging'
});

/** 获取目标元素当前视口矩形（含尺寸）。 */
function readRect(target) {
  try {
    return target.getBoundingClientRect();
  } catch (_) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
}

/** 获取视口宽高。 */
function getViewport() {
  if (typeof window === 'undefined') return { vw: 0, vh: 0 };
  return { vw: window.innerWidth, vh: window.innerHeight };
}

/** 将坐标收回视口边界（FR-002 越界回收）。 */
function clampPosition(pos, rect, clamp, margin) {
  if (!clamp) return { x: pos.x, y: pos.y };
  const { vw, vh } = getViewport();
  const maxX = Math.max(margin, vw - rect.width - margin);
  const maxY = Math.max(margin, vh - rect.height - margin);
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY)
  };
}

/**
 * 创建拖拽控制器实例。
 * @param {{storageService?:object, clampToViewport?:boolean, moveThreshold?:number, edgeMargin?:number}} [opts]
 * @returns {object} 冻结接口
 */
function createDragController({
  storageService = null,
  clampToViewport = true,
  moveThreshold = CONFIG.MOVE_THRESHOLD_PX,
  edgeMargin = CONFIG.EDGE_MARGIN_PX
} = {}) {
  const moveListeners = new Set();
  const dropListeners = new Set();
  const internals = {
    state: STATE.IDLE,
    target: null,
    startPointer: null,
    startRect: null,
    handlers: null
  };

  function emit(listeners, payload) {
    for (const cb of listeners) {
      try { cb(payload); } catch (_) { /* 拖拽监听异常忽略，不阻塞 */ }
    }
  }

  function persist(pos) {
    if (!storageService || typeof storageService.setPosition !== 'function') return;
    storageService.setPosition(pos).then((result) => {
      if (!result || !result.ok) log.warn(ERROR_CODES.DRAG_STORAGE_FAIL, {});
    }).catch((e) => log.warn(ERROR_CODES.DRAG_STORAGE_FAIL, { msg: e && e.message }));
  }

  function onPointerDown(event) {
    internals.startPointer = { x: event.clientX, y: event.clientY };
    internals.startRect = readRect(internals.target);
  }

  function onPointerMove(event) {
    if (!internals.startPointer) return;
    const dx = event.clientX - internals.startPointer.x;
    const dy = event.clientY - internals.startPointer.y;
    if (internals.state === STATE.IDLE) {
      if (Math.hypot(dx, dy) < moveThreshold) return;
      internals.state = STATE.DRAGGING;
      log.info('drag_start', { start: internals.startPointer });
    }
    const raw = { x: internals.startRect.left + dx, y: internals.startRect.top + dy };
    const pos = clampPosition(raw, internals.startRect, clampToViewport, edgeMargin);
    emit(moveListeners, pos);
  }

  function endDrag(event) {
    if (internals.state !== STATE.DRAGGING) {
      internals.startPointer = null;
      internals.startRect = null;
      return;
    }
    const dx = event.clientX - internals.startPointer.x;
    const dy = event.clientY - internals.startPointer.y;
    const raw = { x: internals.startRect.left + dx, y: internals.startRect.top + dy };
    const pos = clampPosition(raw, internals.startRect, clampToViewport, edgeMargin);
    internals.state = STATE.IDLE;
    internals.startPointer = null;
    internals.startRect = null;
    log.info('drag_drop', pos);
    persist(pos);
    emit(dropListeners, pos);
  }

  function bind(target) {
    unbind();
    if (!target || typeof target.addEventListener !== 'function') return;
    internals.target = target;
    const down = onPointerDown;
    const move = onPointerMove;
    const up = endDrag;
    const cancel = endDrag;
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
    internals.handlers = { down, move, up, cancel };
  }

  function unbind() {
    if (!internals.target || !internals.handlers) return;
    const { down, move, up, cancel } = internals.handlers;
    internals.target.removeEventListener('pointerdown', down);
    internals.target.removeEventListener('pointermove', move);
    internals.target.removeEventListener('pointerup', up);
    internals.target.removeEventListener('pointercancel', cancel);
    internals.handlers = null;
    internals.target = null;
    internals.state = STATE.IDLE;
    internals.startPointer = null;
    internals.startRect = null;
  }

  function onDragMove(cb) {
    if (typeof cb !== 'function') return () => {};
    moveListeners.add(cb);
    return () => moveListeners.delete(cb);
  }

  function onDrop(cb) {
    if (typeof cb !== 'function') return () => {};
    dropListeners.add(cb);
    return () => dropListeners.delete(cb);
  }

  function isDragging() {
    return internals.state === STATE.DRAGGING;
  }

  return Object.freeze({ bind, unbind, isDragging, onDragMove, onDrop });
}

export { createDragController, CONFIG, ERROR_CODES, STATE };
export default createDragController;
