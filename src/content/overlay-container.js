// path: src/content/overlay-container.js
// M-13 OverlayContainer —— Shadow DOM 悬浮容器（DDS §14 / FR-001）。
// 上游：M-12 ToggleController、content-main；下游：M-02 StorageService、M-04 ResourceLoader、M-09 CanvasStage、M-10 DragController、M-07 PoseStateMachine。

import { createLogger } from '../shared/logger.js';
import {
  OVERLAY_Z_INDEX,
  OVERLAY_DEFAULT_EDGE_GAP_PX,
  OVERLAY_BG_TRANSPARENT,
  OVERLAY_FADE_MS,
  ALL_MOVE_FRAMES,
  SectorId,
  SPRITE_PATH,
  SPRITE_FRAME_SIZE,
  SPRITE_COLS,
  CSS_FRAME_CLASS_PREFIX,
  BLINK_SPRITE_PATH,
  BLINK_REST_PATH,
  BLINK_DURATION_MS,
  BLINK_LAYER_CLASS,
  BLINK_PLAY_CLASS
} from '../shared/constants.js';

const log = createLogger('OverlayContainer');

const CONFIG = Object.freeze({
  Z_INDEX: OVERLAY_Z_INDEX,
  DEFAULT_EDGE_GAP_PX: OVERLAY_DEFAULT_EDGE_GAP_PX,
  BG_TRANSPARENT: OVERLAY_BG_TRANSPARENT,
  FADE_MS: OVERLAY_FADE_MS,
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

/** 构造注入到 Shadow/iframe 的样式文本（容器透传，仅猫区域响应 + 雪碧图帧定位）。 */
function buildOverlayCss(catSize) {
  const w = catSize.w || CONFIG.CAT_SIZE.w;
  const h = catSize.h || CONFIG.CAT_SIZE.h;
  const bg = CONFIG.BG_TRANSPARENT ? 'transparent' : '#fff';
  const fs = SPRITE_FRAME_SIZE;
  const cols = SPRITE_COLS;
  // 雪碧图帧 background-position 规则（DDS §5.4）
  let frameCss = '';
  for (let i = 0; i < 9; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    frameCss += `.${CSS_FRAME_CLASS_PREFIX}${i} { background-position: -${col * fs}px -${row * fs}px; }\n`;
  }
  // 眨眼动画：闭眼 40% ease-in → 保持 17% → 睁眼 43% ease-out（缓慢眨眼时序）
  const blinkCss = [
    `.${BLINK_LAYER_CLASS} { position: absolute; left: 0; top: 0; width: ${w}px; height: ${h}px;`,
    `  background-repeat: no-repeat; opacity: 0; pointer-events: none; }`,
    `.${BLINK_LAYER_CLASS}.${BLINK_PLAY_CLASS} { animation: cem-blink ${BLINK_DURATION_MS}ms forwards; }`,
    `@keyframes cem-blink {`,
    `  0% { opacity: 0; animation-timing-function: cubic-bezier(0.42, 0, 1, 1); }`,
    `  40% { opacity: 1; animation-timing-function: linear; }`,
    `  57% { opacity: 1; animation-timing-function: cubic-bezier(0, 0, 0.58, 1); }`,
    `  100% { opacity: 0; }`,
    `}`
  ].join('\n');
  return [
    `:host, .cem-overlay { position: fixed; left: 0; top: 0; width: 100%; height: 100%;`,
    `  z-index: ${CONFIG.Z_INDEX}; background: ${bg}; pointer-events: none; }`,
    `.${CONFIG.CAT_LAYER_CLASS} { position: fixed; left: 0; top: 0; width: ${w}px; height: ${h}px;`,
    `  pointer-events: ${CONFIG.POINTER_AUTO}; transform: translate(0px, 0px);`,
    `  cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none;`,
    `  opacity: 1; transition: opacity ${CONFIG.FADE_MS}ms ease; }`,
    frameCss,
    blinkCss
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

/** 预加载全部姿态帧（优先雪碧图 1 次请求，回退逐帧加载），同时预加载休息帧。 */
async function preloadFrames(resourceLoader) {
  if (!resourceLoader) return;
  try {
    let spriteOk = false;
    if (typeof resourceLoader.preloadSprite === 'function') {
      spriteOk = await resourceLoader.preloadSprite();
    }
    if (!spriteOk && typeof resourceLoader.preload === 'function') {
      await resourceLoader.preload(ALL_MOVE_FRAMES);
    }
    if (typeof resourceLoader.preloadRest === 'function') {
      await resourceLoader.preloadRest();
    }
  } catch (e) {
    log.warn('preload_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

/** 渲染初始帧（DDS §10.2：CSS sprite 主模式 → Canvas drawImage 备选）。 */
function renderInitialFrame(resourceLoader, canvasStage) {
  if (!resourceLoader || !canvasStage) return;
  // CSS sprite 模式：设置背景图 + 初始帧类
  if (typeof canvasStage.setSpriteBackground === 'function' && typeof resourceLoader.getUrl === 'function') {
    const spriteUrl = resourceLoader.getUrl(SPRITE_PATH);
    if (spriteUrl) {
      canvasStage.setSpriteBackground(spriteUrl);
      if (typeof canvasStage.setSpriteFrame === 'function') {
        canvasStage.setSpriteFrame(SectorId.CENTER);
      }
      // 眨眼图层背景（复用同帧类布局，1 次请求，opacity 0 常驻待命）
      if (typeof canvasStage.setBlinkBackground === 'function') {
        canvasStage.setBlinkBackground(resourceLoader.getUrl(BLINK_SPRITE_PATH));
      }
      // 休息态闭眼图（rest 阶段眨眼叠加）
      if (typeof canvasStage.setBlinkRestBackground === 'function') {
        canvasStage.setBlinkRestBackground(resourceLoader.getUrl(BLINK_REST_PATH));
      }
      log.info('sprite_initial_frame', {});
      return;
    }
  }
  // 备选：Canvas drawImage
  if (typeof canvasStage.drawImage !== 'function') return;
  if (typeof resourceLoader.get !== 'function') return;
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
    position: { x: 0, y: 0 },
    cleanups: [],
    prevViewport: { w: 0, h: 0 }
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

  /** 淡入：先置透明并强制 reflow，再恢复不透明以触发 CSS 过渡。 */
  function fadeIn() {
    if (!internals.catLayer) return;
    internals.catLayer.style.opacity = '0';
    void internals.catLayer.offsetWidth;
    internals.catLayer.style.opacity = '1';
  }

  /** 淡出：置透明交由 CSS 过渡完成，同时立即停止指针交互。 */
  function fadeOut() {
    if (!internals.catLayer) return;
    internals.catLayer.style.pointerEvents = CONFIG.POINTER_NONE;
    internals.catLayer.style.opacity = '0';
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

  /** 绑定 window resize + 定时轮询双保险，检测视口变化并校正猫位置（FR-001）。 */
  function attachResizeListener() {
    if (typeof window === 'undefined') return;
    // resize 事件直接同步处理（不使用 rAF 节流，避免最大化时 rAF 延迟）
    const onResize = () => repositionOnResize();
    window.addEventListener('resize', onResize);
    internals.cleanups.push(() => window.removeEventListener('resize', onResize));
    // 定时轮询兜底：某些场景 resize 事件不触发（如全屏切换、DPI 变化）
    let pollTimer = setInterval(() => {
      const cw = window.innerWidth;
      const ch = window.innerHeight;
      if (internals.prevViewport.w !== cw || internals.prevViewport.h !== ch) {
        repositionOnResize();
      }
    }, 500);
    internals.cleanups.push(() => clearInterval(pollTimer));
  }

  /** resize 后校正位置：按比例保持猫在视口中的相对位置（窗口模式切换不漂移）。 */
  function repositionOnResize() {
    if (internals.state !== STATE.MOUNTED) return;
    if (typeof window === 'undefined') return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw <= 0 || vh <= 0) return;
    const pos = internals.position;
    const prev = internals.prevViewport;
    let x = pos.x;
    let y = pos.y;
    // 有前次视口尺寸且尺寸变化时，按比例保持相对位置（防止反复切换漂移）
    if (prev.w > 0 && prev.h > 0 && (prev.w !== vw || prev.h !== vh)) {
      const ratioX = (pos.x + size.w / 2) / prev.w;
      const ratioY = (pos.y + size.h / 2) / prev.h;
      x = Math.round(ratioX * vw - size.w / 2);
      y = Math.round(ratioY * vh - size.h / 2);
    }
    // 越出右/下边界 → 贴边收回
    if (x + size.w > vw) x = Math.max(0, vw - size.w);
    if (y + size.h > vh) y = Math.max(0, vh - size.h);
    // 越出左/上边界（负坐标）→ 回到 0
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    internals.prevViewport = { w: vw, h: vh };
    if (x !== pos.x || y !== pos.y) {
      setPosition({ x, y });
      log.info('resize_reposition', { from: pos, to: { x, y }, vw, vh });
    }
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

  function bindDrag() {
    if (!dragFactory) return;
    if (internals.drag && typeof internals.drag.unbind === 'function') {
      try { internals.drag.unbind(); } catch (_) { /* 重绑前解绑 */ }
    }
    try {
      internals.drag = dragFactory({ storageService });
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
    // 同步设置默认位置（右下角贴边），避免 async 竞态期间猫在 (0,0)
    const defaultPos = computeDefaultPosition(size, CONFIG.DEFAULT_EDGE_GAP_PX);
    setPosition(defaultPos);
    // 同步记录当前视口作为比例基准
    const vw0 = typeof window !== 'undefined' ? window.innerWidth : 0;
    const vh0 = typeof window !== 'undefined' ? window.innerHeight : 0;
    if (vw0 > 0 && vh0 > 0) {
      internals.prevViewport = { w: vw0, h: vh0 };
    }
    // 异步读取记忆位置，覆盖默认值
    const remembered = await readRememberedPosition(storageService);
    if (remembered) {
      // 校正记忆位置：若越出当前视口则贴边收回
      const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
      const clampedX = vw > 0 ? Math.min(remembered.x, Math.max(0, vw - size.w)) : remembered.x;
      const clampedY = vh > 0 ? Math.min(remembered.y, Math.max(0, vh - size.h)) : remembered.y;
      setPosition({ x: clampedX, y: clampedY });
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
    attachResizeListener();
    internals.prevViewport = {
      w: typeof window !== 'undefined' ? window.innerWidth : 0,
      h: typeof window !== 'undefined' ? window.innerHeight : 0
    };
    bindDrag();
    void preloadFrames(resourceLoader).then(() => {
      renderInitialFrame(resourceLoader, internals.canvasStage);
    });
    internals.state = STATE.MOUNTED;
    fadeIn();
    void applyInitialPosition();
  }

  function getCanvasStage() {
    return internals.canvasStage;
  }

  function getPoseMachine() {
    return internals.poseMachine;
  }

  function getDrag() {
    return internals.drag;
  }

  return Object.freeze({
    mount,
    unmount,
    setPosition,
    getPosition,
    getCatCenter,
    setPointerEvents,
    fadeIn,
    fadeOut,
    getHost,
    getCanvasStage,
    getPoseMachine,
    getDrag
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
