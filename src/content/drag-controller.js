// path: src/content/drag-controller.js
// M-10 DragController —— Pointer Events 拖拽与越界回收（DDS §11，FR-002、§6 边界）。
// 上游：M-13 OverlayContainer；下游：M-02 StorageService（落点持久化）。
// 跨浏览器健壮性：pointerId 隔离多指针、setPointerCapture、touch-action 配合、
// blur/visibilitychange 取消悬挂拖拽、dragstart/contextmenu/selectstart 拦截、grab/grabbing 反馈。

import { createLogger } from '../shared/logger.js';
import { DRAG_MOVE_THRESHOLD_PX, DRAG_EDGE_MARGIN_PX } from '../shared/constants.js';

const log = createLogger('DragController');

const CONFIG = Object.freeze({
  MOVE_THRESHOLD_PX: DRAG_MOVE_THRESHOLD_PX,
  EDGE_MARGIN_PX: DRAG_EDGE_MARGIN_PX,
  CURSOR_DRAGGING: 'grabbing'
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
    activePointerId: null,
    lastPos: null,
    handlers: null,
    savedDocStyle: null
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

  function resetPending() {
    internals.startPointer = null;
    internals.startRect = null;
    internals.activePointerId = null;
    internals.lastPos = null;
  }

  /** 非激活指针（第二触点/其他设备）的事件一律忽略。 */
  function isFromActivePointer(event) {
    if (internals.activePointerId == null || event.pointerId == null) return true;
    return event.pointerId === internals.activePointerId;
  }

  /** 拖拽期间全局反馈：grabbing 光标 + 禁止选中文本（作用于 documentElement，结束时还原）。 */
  function applyDragFeedback(on) {
    const doc = typeof document !== 'undefined' ? document.documentElement : null;
    if (!doc || !doc.style) return;
    if (on) {
      if (internals.savedDocStyle) return;
      internals.savedDocStyle = { cursor: doc.style.cursor, userSelect: doc.style.userSelect };
      doc.style.cursor = CONFIG.CURSOR_DRAGGING;
      doc.style.userSelect = 'none';
    } else if (internals.savedDocStyle) {
      doc.style.cursor = internals.savedDocStyle.cursor;
      doc.style.userSelect = internals.savedDocStyle.userSelect;
      internals.savedDocStyle = null;
    }
  }

  function onPointerDown(event) {
    if (event.button !== 0) return; // 仅主键（左键）启动拖拽
    // 已有待定/活动指针（如鼠标拖拽中触屏落到猫上）时忽略新指针，不抢夺当前拖拽
    if (internals.startPointer) return;
    internals.activePointerId = event.pointerId != null ? event.pointerId : null;
    internals.startPointer = { x: event.clientX, y: event.clientY };
    internals.startRect = readRect(internals.target);
    // 指针捕获：事件直达 target，避免拖出元素后事件丢失（失败则回退 window 监听）
    if (internals.target && typeof internals.target.setPointerCapture === 'function' && event.pointerId != null) {
      try { internals.target.setPointerCapture(event.pointerId); } catch (_) { /* 忽略 */ }
    }
  }

  function onPointerMove(event) {
    if (!internals.startPointer) return;
    if (!isFromActivePointer(event)) return;
    // 未按住主键（悬停，或释放事件丢失后的残留状态）→ 复位并忽略，绝不跟随
    if (event.buttons === 0) {
      resetPending();
      return;
    }
    const dx = event.clientX - internals.startPointer.x;
    const dy = event.clientY - internals.startPointer.y;
    if (internals.state === STATE.IDLE) {
      if (Math.hypot(dx, dy) < moveThreshold) return;
      internals.state = STATE.DRAGGING;
      applyDragFeedback(true);
      log.info('drag_start', { start: internals.startPointer });
    }
    const raw = { x: internals.startRect.left + dx, y: internals.startRect.top + dy };
    const pos = clampPosition(raw, internals.startRect, clampToViewport, edgeMargin);
    internals.lastPos = pos;
    emit(moveListeners, pos);
  }

  function endDrag(event) {
    if (!isFromActivePointer(event)) return;
    if (internals.state !== STATE.DRAGGING) {
      resetPending();
      return;
    }
    const hasPoint = event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
    const dx = hasPoint ? event.clientX - internals.startPointer.x : 0;
    const dy = hasPoint ? event.clientY - internals.startPointer.y : 0;
    const raw = { x: internals.startRect.left + dx, y: internals.startRect.top + dy };
    const pos = clampPosition(raw, internals.startRect, clampToViewport, edgeMargin);
    internals.state = STATE.IDLE;
    resetPending();
    applyDragFeedback(false);
    log.info('drag_drop', pos);
    persist(pos);
    emit(dropListeners, pos);
  }

  /** 窗口失焦/页面隐藏时终止拖拽：指针流必然已断，避免悬挂状态劫持后续手势。 */
  function cancelDrag() {
    if (internals.state === STATE.DRAGGING) {
      const pos = internals.lastPos
        || { x: internals.startRect ? internals.startRect.left : 0, y: internals.startRect ? internals.startRect.top : 0 };
      internals.state = STATE.IDLE;
      log.info('drag_cancelled', pos);
      persist(pos);
      emit(dropListeners, pos);
    }
    resetPending();
    applyDragFeedback(false);
  }

  function onWindowBlur() {
    cancelDrag();
  }

  function onVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden) cancelDrag();
  }

  /** 拖拽期间拦截原生 HTML5 拖拽（会抢占指针流导致 pointermove 停发）。 */
  function onDragstart(event) {
    if (internals.state === STATE.DRAGGING) event.preventDefault();
  }

  /** 拖拽期间拦截右键菜单（弹出菜单会打断指针流）。 */
  function onContextmenu(event) {
    if (internals.state === STATE.DRAGGING) event.preventDefault();
  }

  /** 拖拽期间拦截文本选择（视觉污染 + 可能升级为原生拖拽）。 */
  function onSelectstart(event) {
    if (internals.state === STATE.DRAGGING) event.preventDefault();
  }

  function bind(target) {
    unbind();
    if (!target || typeof target.addEventListener !== 'function') return;
    if (typeof window === 'undefined') return;
    internals.target = target;
    const handlers = {
      down: onPointerDown,
      move: onPointerMove,
      up: endDrag,
      cancel: endDrag,
      blur: onWindowBlur,
      visibilitychange: onVisibilityChange,
      dragstart: onDragstart,
      contextmenu: onContextmenu,
      selectstart: onSelectstart
    };
    target.addEventListener('pointerdown', handlers.down);
    // move/up/cancel 绑定 window：拖拽移出猫图层后仍可收到移动与释放，防止拖拽状态残留
    window.addEventListener('pointermove', handlers.move);
    window.addEventListener('pointerup', handlers.up);
    window.addEventListener('pointercancel', handlers.cancel);
    // 失焦取消 + 原生行为拦截（dragstart/contextmenu 冒泡至 window）
    window.addEventListener('blur', handlers.blur);
    window.addEventListener('dragstart', handlers.dragstart, true);
    window.addEventListener('contextmenu', handlers.contextmenu, true);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handlers.visibilitychange);
      document.addEventListener('selectstart', handlers.selectstart, true);
    }
    internals.handlers = handlers;
  }

  function unbind() {
    if (!internals.target || !internals.handlers) return;
    const h = internals.handlers;
    internals.target.removeEventListener('pointerdown', h.down);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', h.move);
      window.removeEventListener('pointerup', h.up);
      window.removeEventListener('pointercancel', h.cancel);
      window.removeEventListener('blur', h.blur);
      window.removeEventListener('dragstart', h.dragstart, true);
      window.removeEventListener('contextmenu', h.contextmenu, true);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', h.visibilitychange);
      document.removeEventListener('selectstart', h.selectstart, true);
    }
    internals.handlers = null;
    internals.target = null;
    internals.state = STATE.IDLE;
    resetPending();
    applyDragFeedback(false);
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

  return Object.freeze({ bind, unbind, isDragging, onDragMove, onDrop, cancelDrag });
}

export { createDragController, CONFIG, ERROR_CODES, STATE };
export default createDragController;
