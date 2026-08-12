// path: src/content/content-main.js
// 内容脚本入口装配（DDS §17 依赖矩阵 / 架构 §3.2 装配点）。
// 组合：M-13 OverlayContainer + M-12 ToggleController + M-08 TransitionRenderer + M-11 IdleDetector，
// 并监听 ServiceWorker 广播的 TOGGLE_VISIBLE / SET_CLAMP 消息（FR-007/009）。

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

const log = createLogger('ContentMain');

/** 探测真实扩展运行时，避免测试环境误装配。 */
function hasRuntime() {
  const ns = (typeof globalThis !== 'undefined' && (globalThis.chrome || globalThis.browser)) || null;
  return !!(ns && ns.runtime && typeof ns.runtime.onMessage === 'object');
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
  let unbindMouseLeave = null;
  let unbindMouseReenter = null;

  function wireRenderer() {
    const poseMachine = overlay.getPoseMachine();
    const canvasStage = overlay.getCanvasStage();
    if (!poseMachine || !canvasStage) return;
    renderer = createCanvasTransitionRenderer({ canvasStage, resourceLoader, mode: 'crossfade' });
    poseMachine.onPoseChange((sector) => {
      if (renderer) renderer.playTo(sector);
    });
  }

  function afterMount() {
    wireRenderer();
    bindMouseLeaveReenter();
    idle.start();
  }

  /** 绑定 document mouseleave/mouseenter 驱动 PSM 越界跟踪（FR-003 AC5）。 */
  function bindMouseLeaveReenter() {
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

  // 空闲态：进入休息态渲染 sit_back 帧；唤醒恢复当前姿态帧（FR-008）。
  idle.onIdle(() => {
    const pm = overlay.getPoseMachine();
    if (pm && typeof pm.enterResting === 'function') pm.enterResting();
    const cs = overlay.getCanvasStage();
    if (cs && typeof resourceLoader.getRest === 'function') {
      const result = resourceLoader.getRest();
      if (result && result.ok && result.value) {
        try { cs.drawImage(result.value); } catch (_) { /* 渲染失败忽略 */ }
      }
    }
  });
  idle.onWake(() => {
    const pm = overlay.getPoseMachine();
    if (pm && typeof pm.exitResting === 'function') pm.exitResting();
    const cs = overlay.getCanvasStage();
    if (cs && pm && typeof pm.current === 'function') {
      const sector = pm.current();
      const result = resourceLoader.get(sector);
      if (result && result.ok && result.value) {
        try { cs.drawImage(result.value); } catch (_) { /* 渲染失败忽略 */ }
      }
    }
  });

  async function bootstrap() {
    let hidden = false;
    try {
      const result = await storageService.getSettings();
      hidden = result && result.ok && result.value ? !!result.value.hidden : false;
    } catch (e) {
      log.warn('read_settings_failed', { msg: e && e.message ? e.message : String(e) });
    }
    if (!hidden) {
      overlay.mount();
      afterMount();
    }
    toggle = createToggleController({ overlayContainer: overlay, storageService, initialVisible: !hidden });
    toggle.onVisibilityChange((visible) => {
      if (visible) afterMount();
      else idle.stop();
    });
    log.info('bootstrapped', { visible: !hidden });
  }

  function onMessage(message) {
    const type = message && typeof message === 'object' ? message.type : null;
    if (type === MSG_TYPES.TOGGLE_VISIBLE) {
      if (toggle) toggle.toggle();
    } else if (type === MSG_TYPES.SET_CLAMP) {
      overlay.setClamp(!!(message && message.clamp));
    }
  }

  function dispose() {
    if (unbindMouseLeave) { unbindMouseLeave(); unbindMouseLeave = null; }
    if (unbindMouseReenter) { unbindMouseReenter(); unbindMouseReenter = null; }
    idle.stop();
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
    log.info('installed', { reason: 'runtime_detected' });
  } catch (e) {
    log.warn('install_failed', { msg: e && e.message ? e.message : String(e) });
  }
}

export { createApp };
