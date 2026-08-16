// path: src/content/content-main.js
// 内容脚本入口装配（DDS §17 依赖矩阵 / 架构 §3.2 装配点）。
// 组合：M-13 OverlayContainer + M-12 ToggleController + M-08 TransitionRenderer + M-11 IdleDetector，
// 并监听 ServiceWorker 广播的 TOGGLE_VISIBLE 消息（FR-007/009）。

import { createLogger } from '../shared/logger.js';
import { MSG_TYPES } from '../shared/constants.js';
import storageService from '../adapter/storage-service.js';
import resourceLoader from '../adapter/resource-loader.js';
import { createOverlayContainer } from './overlay-container.js';
import { createToggleController } from './toggle-controller.js';
import { createCanvasTransitionRenderer } from './transition-renderer.js';
import { createIdleDetector } from './idle-detector.js';
import { createCanvasStage } from './canvas-stage.js';
import { createPoseStateMachine } from './pose-state-machine.js';
import { createDragController } from './drag-controller.js';
import { createBlinkController } from './blink-controller.js';

const log = createLogger('ContentMain');

/** 探测真实扩展运行时，避免测试环境误装配。 */
function hasRuntime() {
  const ns = (typeof globalThis !== 'undefined' && (globalThis.chrome || globalThis.browser)) || null;
  return !!(ns && ns.runtime && typeof ns.runtime.onMessage === 'object');
}

/**
 * 扩展生命周期看门狗：轮询 runtime.id，检测扩展被移除/禁用/更新导致的上下文失效，
 * 失效时回调 onInvalid（用于拆除注入 DOM，无需手动刷新页面）。
 * Chromium 卸载扩展不提供任何内容脚本回调，且不回收已注入 DOM——此为标准行为；
 * runtime.id 在扩展失效后变为 undefined 且访问绑定可能抛错，是官方推荐的失效判据。
 * 仅本地属性读取，不产生 IPC、不唤醒 SW；Chrome 与 Edge（同为 Chromium）行为一致。
 * @param {{ns:object, onInvalid:Function, intervalMs?:number, timerApi?:{set:Function, clear:Function}}} deps
 * @returns {object} 冻结的 { start, stop, isInvalidated }
 */
function createLifetimeWatchdog({ ns, onInvalid, intervalMs = 2000, timerApi } = {}) {
  const timers = timerApi || {
    set: (fn, ms) => setInterval(fn, ms),
    clear: (id) => clearInterval(id)
  };
  let timerId = null;
  let stopped = false;

  function isInvalidated() {
    try {
      return !(ns && ns.runtime && ns.runtime.id);
    } catch (_) {
      return true; // 上下文失效后访问绑定可能直接抛错
    }
  }

  function tick() {
    if (stopped) return;
    if (!isInvalidated()) return;
    stop();
    try { onInvalid(); } catch (e) {
      log.warn('watchdog_cleanup_failed', { msg: e && e.message ? e.message : String(e) });
    }
  }

  function start() {
    if (stopped || timerId !== null) return;
    tick(); // 启动即校验一次
    if (stopped) return; // 启动时已失效则不再挂定时器
    timerId = timers.set(tick, intervalMs);
  }

  function stop() {
    stopped = true;
    if (timerId !== null) {
      timers.clear(timerId);
      timerId = null;
    }
  }

  start();
  return Object.freeze({ start, stop, isInvalidated });
}

/**
 * 组装整个内容侧依赖图并启动。
 * @returns {object} 冻结的 { overlay, toggle, idle, dispose }
 */
function createApp() {
  const overlay = createOverlayContainer({
    storageService,
    resourceLoader,
    canvasStageFactory: createCanvasStage,
    poseMachineFactory: createPoseStateMachine,
    dragFactory: createDragController
  });

  const idle = createIdleDetector();
  let renderer = null;
  let toggle = null;
  let blink = null;
  let unbindMouseLeave = null;
  let unbindMouseReenter = null;

  function wireRenderer() {
    const poseMachine = overlay.getPoseMachine();
    const canvasStage = overlay.getCanvasStage();
    if (!poseMachine || !canvasStage) return;
    renderer = createCanvasTransitionRenderer({ canvasStage, resourceLoader, mode: 'css' });
    poseMachine.onPoseChange((sector) => {
      if (!renderer) return;
      renderer.playTo(sector);
      // 姿态过渡进行中抑制眨眼（避免转头动画与闭眼叠加突兀）
      if (blink && typeof renderer.isActive === 'function' && renderer.isActive()) {
        blink.suppress('transition');
      }
    });
    if (typeof renderer.onComplete === 'function') {
      renderer.onComplete(() => { if (blink) blink.resume('transition'); });
    }
  }

  /** 装配眨眼控制器：随机 3–5s 间隔；拖拽/休息态抑制（hover 抚摸时缓慢眨眼符合猫科习性）。 */
  function wireBlink() {
    const cs = overlay.getCanvasStage();
    if (!cs) return;
    blink = createBlinkController({ canvasStage: cs });
    const drag = typeof overlay.getDrag === 'function' ? overlay.getDrag() : null;
    if (drag) {
      if (typeof drag.onDragMove === 'function') {
        drag.onDragMove(() => { if (blink) blink.suppress('drag'); });
      }
      if (typeof drag.onDrop === 'function') {
        drag.onDrop(() => { if (blink) blink.resume('drag'); });
      }
    }
    blink.start();
  }

  function afterMount() {
    wireRenderer();
    wireBlink();
    bindMouseLeaveReenter();
    idle.start();
  }

  /** 绑定 document mouseleave/mouseenter 驱动 PSM 越界跟踪（FR-003 AC5）；重复调用先解绑防叠加。 */
  function bindMouseLeaveReenter() {
    if (unbindMouseLeave) { unbindMouseLeave(); unbindMouseLeave = null; }
    if (unbindMouseReenter) { unbindMouseReenter(); unbindMouseReenter = null; }
    const pm = overlay.getPoseMachine();
    if (!pm) return;
    const onLeave = () => {
      if (pm && typeof pm.notifyMouseLeave === 'function') pm.notifyMouseLeave();
    };
    const onReenter = () => {
      if (pm && typeof pm.notifyMouseReenter === 'function') pm.notifyMouseReenter();
    };
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onReenter);
    unbindMouseLeave = () => document.removeEventListener('mouseleave', onLeave);
    unbindMouseReenter = () => document.removeEventListener('mouseenter', onReenter);
  }

  // 空闲态：切到 Canvas 模式渲染 sit_back 帧（眨眼层切 rest 闭眼图，眨眼继续）；唤醒恢复（FR-008）。
  idle.onIdle(() => {
    const pm = overlay.getPoseMachine();
    if (pm && typeof pm.enterResting === 'function') pm.enterResting();
    const cs = overlay.getCanvasStage();
    if (cs) {
      if (typeof cs.showCanvas === 'function') cs.showCanvas();
      if (typeof resourceLoader.getRest === 'function') {
        const result = resourceLoader.getRest();
        if (result && result.ok && result.value) {
          try { cs.drawImage(result.value); } catch (_) { /* 渲染失败忽略 */ }
        }
      }
    }
  });
  idle.onWake(() => {
    const pm = overlay.getPoseMachine();
    if (pm && typeof pm.exitResting === 'function') pm.exitResting();
    const cs = overlay.getCanvasStage();
    if (cs) {
      if (typeof cs.showSprite === 'function') cs.showSprite();
      if (pm && typeof pm.current === 'function' && typeof cs.setSpriteFrame === 'function') {
        try { cs.setSpriteFrame(pm.current()); } catch (_) { /* 帧切换失败忽略 */ }
      }
    }
  });

  /** 惰性创建显隐控制器：必须先于 mount 完成，否则 mount 抛错会让 popup 按钮永久静默失效。 */
  function ensureToggle(initialVisible) {
    if (toggle) return;
    toggle = createToggleController({ overlayContainer: overlay, storageService, initialVisible });
    toggle.onVisibilityChange((visible) => {
      if (visible) afterMount();
      else {
        idle.stop();
        if (blink) blink.stop();
      }
    });
  }

  async function bootstrap() {
    let hidden = false;
    try {
      const result = await storageService.getSettings();
      hidden = result && result.ok && result.value ? !!result.value.hidden : false;
    } catch (e) {
      log.warn('read_settings_failed', { msg: e && e.message ? e.message : String(e) });
    }
    ensureToggle(!hidden);
    if (!hidden) {
      try {
        overlay.mount();
        afterMount();
      } catch (e) {
        // 挂载失败不阻断消息链路：toggle 已就绪，popup 显隐仍可恢复（show 会重试 mount）
        log.warn('mount_failed', { msg: e && e.message ? e.message : String(e) });
      }
    }
    log.info('bootstrapped', { visible: !hidden });
  }

  function onMessage(message) {
    const type = message && typeof message === 'object' ? message.type : null;
    if (type === MSG_TYPES.TOGGLE_VISIBLE) {
      if (toggle) toggle.toggle();
    }
  }

  function dispose() {
    if (unbindMouseLeave) { unbindMouseLeave(); unbindMouseLeave = null; }
    if (unbindMouseReenter) { unbindMouseReenter(); unbindMouseReenter = null; }
    idle.stop();
    if (blink) blink.stop();
    overlay.unmount();
  }

  return Object.freeze({ overlay, get toggle() { return toggle; }, idle, bootstrap, onMessage, dispose });
}

/** 浏览器入口：仅在有真实运行时与 DOM 时装配并注册消息监听。 */
if (hasRuntime() && typeof document !== 'undefined') {
  try {
    const app = createApp();
    const ns = globalThis.chrome || globalThis.browser;
    ns.runtime.onMessage.addListener(app.onMessage);
    void app.bootstrap();
    // 卸载/禁用/更新看门狗：扩展上下文失效即拆除注入 DOM（overlay/监听器/定时器），无需手动刷新
    createLifetimeWatchdog({ ns, onInvalid: () => app.dispose() });
    log.info('installed', { reason: 'runtime_detected' });
  } catch (e) {
    log.warn('install_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

export { createApp, createLifetimeWatchdog };
