// path: src/content/overlay-container.js
// M-13 OverlayContainer —— Shadow DOM 悬浮容器（DDS §14 / FR-001）。
// 上游：M-12 ToggleController、content-main；下游：M-02 StorageService、M-04 ResourceLoader、M-09 CanvasStage、M-10 DragController、M-07 PoseStateMachine。

import { createLogger } from '../shared/logger.js';
import {
  OVERLAY_Z_INDEX,
  OVERLAY_DEFAULT_EDGE_GAP_PX,
  OVERLAY_BG_TRANSPARENT,
  DEFAULT_SETTINGS,
  ALL_MOVE_FRAMES,
  SectorId
} from '../shared/constants.js';

const log = createLogger('OverlayContainer');

const CONFIG = Object.freeze({
  Z_INDEX: OVERLAY_Z_INDEX,
  DEFAULT_EDGE_GAP_PX: OVERLAY_DEFAULT_EDGE_GAP_PX,
  BG_TRANSPARENT: OVERLAY_BG_TRANSPARENT,
  CAT_SIZE: Object.freeze({ w: 128, h: 128 }),
  SHADOW_MODE: 'open',
  HOST_ID: 'cat-eyeing-mouse-overlay',
  CAT_LAYER_CLASS: 'cem-cat-layer',
  POINTER_AUTO: 'auto',
  POINTER_NONE: 'none'
});

const ERROR_CODES = Object.freeze({
  SHADOW_UNAVAILABLE: 'SHADOW_UNAVAILABLE',
  HOST_NOT_FOUND: 'HOST_NOT_FOUND'
});

const STATE = Object.freeze({
  UNMOUNTED: 'UNMOUNTED',
  MOUNTED: 'MOUNTED'
});

/** 解析宿主元素，缺失时回退到 document.body 并记 WARN。 */
function resolveHost(hostEl) {
  if (hostEl && typeof hostEl.appendChild === 'function') return hostEl;
  if (typeof document !== 'undefined' && document.body) return document.body;
  log.warn(ERROR_CODES.HOST_NOT_FOUND, { reason: 'no_host' });
  return null;
}

/** 计算无记忆坐标时的右下角贴边默认位置（FR-001 AC1）。 */
function computeDefaultPosition(catSize, gap, viewport) {
  const w = catSize.w || CONFIG.CAT_SIZE.w;
  const h = catSize.h || CONFIG.CAT_SIZE.h;
  const vw = (viewport && viewport.width) || (typeof window !== 'undefined' ? window.innerWidth : 0);
  const vh = (viewport && viewport.height) || (typeof window !== 'undefined' ? window.innerHeight : 0);
  return Object.freeze({ x: Math.max(0, vw - w - gap), y: Math.max(0, vh - h - gap) });
}

/** 构造注入到 Shadow/iframe 的样式文本（容器透传，仅猫区域响应）。 */
function buildOverlayCss(catSize) {
  const w = catSize.w || CONFIG.CAT_SIZE.w;
  const h = catSize.h || CONFIG.CAT_SIZE.h;
  const bg = CONFIG.BG_TRANSPARENT ? 'transparent' : '#fff';
  return [
    `:host, .cem-overlay { position: fixed; left: 0; top: 0; width: 100%; height: 100%;`,
    `  z-index: ${CONFIG.Z_INDEX}; background: ${bg}; pointer-events: none; }`,
    `.${CONFIG.CAT_LAYER_CLASS} { position: fixed; left: 0; top: 0; width: ${w}px; height: ${h}px;`,
    `  pointer-events: ${CONFIG.POINTER_AUTO}; transform: translate(0px, 0px); }`
  ].join('\n');
}

/** 创建并插入 <style> 节点到指定根节点。 */
function injectStyles(root, cssText) {
  if (!root || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = cssText;
  root.appendChild(style);
}

/** 创建猫图层 div（定位 + 指针响应载体）。 */
function createCatLayer(documentRef, catSize) {
  const layer = documentRef.createElement('div');
  layer.className = CONFIG.CAT_LAYER_CLASS;
  layer.style.width = `${catSize.w}px`;
  layer.style.height = `${catSize.h}px`;
  layer.style.pointerEvents = CONFIG.POINTER_AUTO;
  return layer;
}

/** 将坐标应用到猫图层（transform，避免 reflow）。 */
function applyPosition(catLayer, pos) {
  if (!catLayer || !catLayer.style) return;
  catLayer.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
}

/** 创建降级 iframe 并返回其 document.body 作为挂载根。 */
function createFallbackIframe(hostDiv) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:${CONFIG.Z_INDEX};pointer-events:none;background:transparent;`;
  hostDiv.appendChild(iframe);
  const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
  if (doc) {
    try {
      doc.open();
      doc.write('<body></body>');
      doc.close();
    } catch (_) {
      /* 跨域受限，忽略 */
    }
    return doc.body || iframe;
  }
  return iframe;
}

/** 预加载全部姿态帧，失败仅记 WARN（不阻塞挂载）。 */
async function preloadFrames(resourceLoader) {
  if (!resourceLoader || typeof resourceLoader.preload !== 'function') return;
  try {
    await resourceLoader.preload(ALL_MOVE_FRAMES);
  } catch (e) {
    log.warn('preload_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

/** 渲染初始帧（0.png / CENTER），失败回退 fallback。 */
function renderInitialFrame(resourceLoader, canvasStage) {
  if (!resourceLoader || typeof resourceLoader.get !== 'function') return;
  if (!canvasStage || typeof canvasStage.drawImage !== 'function') return;
  const result = resourceLoader.get(SectorId.CENTER);
  const image = result && result.ok ? result.value : safeFallback(resourceLoader);
  if (!image) return;
  try {
    canvasStage.drawImage(image);
  } catch (e) {
    log.warn('initial_frame_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

function safeFallback(resourceLoader) {
  try {
    const fb = typeof resourceLoader.getFallback === 'function' ? resourceLoader.getFallback() : null;
    return fb && fb.ok ? fb.value : null;
  } catch (_) {
    return null;
  }
}

/**
 * 创建 OverlayContainer 实例。
 * @param {{storageService?:object, resourceLoader?:object, canvasStageFactory?:Function, poseMachineFactory?:Function, dragFactory?:Function, catSize?:{w:number,h:number}}} [deps]
 * @returns {object} 冻结的容器接口
 */
function createOverlayContainer({
  storageService,
  resourceLoader,
  canvasStageFactory,
  poseMachineFactory,
  dragFactory,
  catSize = CONFIG.CAT_SIZE
} = {}) {
  const size = Object.freeze({ w: catSize.w, h: catSize.h });
  const internals = {
    state: STATE.UNMOUNTED,
    hostDiv: null,
    root: null,
    catLayer: null,
    canvasStage: null,
    poseMachine: null,
    drag: null,
    clamp: DEFAULT_SETTINGS.clampToViewport,
    position: { x: 0, y: 0 },
    cleanups: []
  };

  function setPosition(pos) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    internals.position = { x: pos.x, y: pos.y };
    applyPosition(internals.catLayer, internals.position);
  }

  function getPosition() {
    return Object.freeze({ x: internals.position.x, y: internals.position.y });
  }

  function getCatCenter() {
    return Object.freeze({
      x: internals.position.x + size.w / 2,
      y: internals.position.y + size.h / 2
    });
  }

  function setPointerEvents(policy) {
    if (!internals.catLayer) return;
    internals.catLayer.style.pointerEvents = policy === CONFIG.POINTER_AUTO ? CONFIG.POINTER_AUTO : CONFIG.POINTER_NONE;
  }

  function getHost() {
    return internals.hostDiv;
  }

  function clearListeners() {
    for (const cleanup of internals.cleanups) {
      try { cleanup(); } catch (_) { /* 忽略解绑异常 */ }
    }
    internals.cleanups = [];
  }

  function unmount() {
    if (internals.state === STATE.UNMOUNTED) return;
    clearListeners();
    if (internals.canvasStage && typeof internals.canvasStage.unmount === 'function') {
      try { internals.canvasStage.unmount(); } catch (e) {
        log.warn('canvas_unmount_failed', { msg: e && e.message ? e.message : String(e) });
      }
    }
    if (internals.hostDiv && internals.hostDiv.parentNode) {
      try { internals.hostDiv.parentNode.removeChild(internals.hostDiv); } catch (_) { /* 忽略 */ }
    }
    internals.hostDiv = null;
    internals.root = null;
    internals.catLayer = null;
    internals.canvasStage = null;
    internals.poseMachine = null;
    internals.drag = null;
    internals.state = STATE.UNMOUNTED;
    log.info('unmounted', {});
  }

  function attachMouseListeners() {
    if (typeof document === 'undefined') return;
    const onMove = (event) => {
      if (!internals.poseMachine) return;
      const pointer = { x: event.clientX, y: event.clientY };
      try { internals.poseMachine.update(pointer, getCatCenter()); } catch (e) {
        log.warn('pose_update_failed', { msg: e && e.message ? e.message : String(e) });
      }
    };
    document.addEventListener('mousemove', onMove);
    internals.cleanups.push(() => document.removeEventListener('mousemove', onMove));

    const onEnter = () => safeSetHover(internals.poseMachine, true);
    const onLeave = () => safeSetHover(internals.poseMachine, false);
    if (internals.catLayer) {
      internals.catLayer.addEventListener('mouseenter', onEnter);
      internals.catLayer.addEventListener('mouseleave', onLeave);
      internals.cleanups.push(() => {
        internals.catLayer.removeEventListener('mouseenter', onEnter);
        internals.catLayer.removeEventListener('mouseleave', onLeave);
      });
    }
  }

  function bindDrag(clampToViewport) {
    if (!dragFactory) return;
    if (internals.drag && typeof internals.drag.unbind === 'function') {
      try { internals.drag.unbind(); } catch (_) { /* 重绑前解绑 */ }
    }
    try {
      internals.drag = dragFactory({ storageService, clampToViewport });
      if (internals.drag && typeof internals.drag.onDragMove === 'function') {
        internals.drag.onDragMove((pos) => setPosition(pos));
      }
      if (internals.drag && typeof internals.drag.onDrop === 'function' && storageService) {
        internals.drag.onDrop((pos) => persistPosition(storageService, pos));
      }
      if (internals.drag && typeof internals.drag.bind === 'function' && internals.catLayer) {
        internals.drag.bind(internals.catLayer);
      }
    } catch (e) {
      log.warn('drag_bind_failed', { msg: e && e.message ? e.message : String(e) });
    }
  }

  async function applyInitialPosition() {
    const remembered = await readRememberedPosition(storageService);
    if (remembered) {
      setPosition(remembered);
    } else {
      setPosition(computeDefaultPosition(size, CONFIG.DEFAULT_EDGE_GAP_PX));
    }
    log.info('mounted', { position: internals.position });
  }

  function mount(hostEl) {
    if (internals.state === STATE.MOUNTED) unmount();
    const host = resolveHost(hostEl);
    if (!host) return;
    const hostDiv = createHostDiv();
    host.appendChild(hostDiv);
    const { root, catLayer } = prepareRoot(hostDiv, size);
    internals.hostDiv = hostDiv;
    internals.root = root;
    internals.catLayer = catLayer;
    mountCanvasStage(canvasStageFactory, root, catLayer, size, internals);
    startPoseMachine(poseMachineFactory, size, internals);
    attachMouseListeners();
    internals.clamp = resolveClamp(storageService);
    bindDrag(internals.clamp);
    void preloadFrames(resourceLoader);
    renderInitialFrame(resourceLoader, internals.canvasStage);
    internals.state = STATE.MOUNTED;
    void applyInitialPosition();
  }

  function getCanvasStage() {
    return internals.canvasStage;
  }

  function getPoseMachine() {
    return internals.poseMachine;
  }

  function setClamp(clamp) {
    internals.clamp = !!clamp;
    if (internals.state !== STATE.MOUNTED) return;
    bindDrag(internals.clamp);
    log.info('clamp_updated', { clamp: internals.clamp });
  }

  return Object.freeze({
    mount,
    unmount,
    setPosition,
    getPosition,
    getCatCenter,
    setPointerEvents,
    getHost,
    getCanvasStage,
    getPoseMachine,
    setClamp
  });
}

function safeSetHover(poseMachine, hovering) {
  if (!poseMachine || typeof poseMachine.setHover !== 'function') return;
  try { poseMachine.setHover(hovering); } catch (e) {
    log.warn('hover_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

function createHostDiv() {
  const hostDiv = document.createElement('div');
  hostDiv.id = CONFIG.HOST_ID;
  return hostDiv;
}

/** 创建挂载根（优先 Shadow DOM，失败降级 iframe）与猫图层。 */
function prepareRoot(hostDiv, size) {
  try {
    const shadow = hostDiv.attachShadow({ mode: CONFIG.SHADOW_MODE });
    injectStyles(shadow, buildOverlayCss(size));
    const catLayer = createCatLayer(document, size);
    shadow.appendChild(catLayer);
    return { root: shadow, catLayer };
  } catch (e) {
    log.warn(ERROR_CODES.SHADOW_UNAVAILABLE, { reason: e && e.message ? e.message : String(e) });
    const body = createFallbackIframe(hostDiv);
    injectStyles(body, buildOverlayCss(size));
    const catLayer = createCatLayer(document, size);
    body.appendChild(catLayer);
    return { root: body, catLayer };
  }
}

function mountCanvasStage(factory, root, catLayer, size, internals) {
  if (!factory) return;
  try {
    internals.canvasStage = factory();
    if (internals.canvasStage && typeof internals.canvasStage.mount === 'function') {
      internals.canvasStage.mount(catLayer, size);
    }
  } catch (e) {
    log.warn('canvas_stage_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

function startPoseMachine(factory, size, internals) {
  if (!factory) return;
  try {
    internals.poseMachine = factory({ hoverRadius: Math.min(size.w, size.h) / 2 });
  } catch (e) {
    log.warn('pose_machine_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

async function readRememberedPosition(storageService) {
  if (!storageService || typeof storageService.getPosition !== 'function') return null;
  try {
    const result = await storageService.getPosition();
    if (result && result.ok && result.value && Number.isFinite(result.value.x) && Number.isFinite(result.value.y)) {
      return result.value;
    }
  } catch (e) {
    log.warn('read_position_failed', { msg: e && e.message ? e.message : String(e) });
  }
  return null;
}

function resolveClamp(storageService) {
  if (!storageService || typeof storageService.getSettings !== 'function') return DEFAULT_SETTINGS.clampToViewport;
  return DEFAULT_SETTINGS.clampToViewport;
}

async function persistPosition(storageService, pos) {
  if (!storageService || typeof storageService.setPosition !== 'function') return;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
  try {
    await storageService.setPosition(pos);
  } catch (e) {
    log.warn('persist_position_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

export { createOverlayContainer, CONFIG, ERROR_CODES };
