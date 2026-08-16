// path: src/shared/constants.js
// M-06 shared/constants —— 全模块共享常量，杜绝硬编码。
// 对齐 DDS §7 与 FR-003 帧映射契约、FR-008 休息态阈值。

/**
 * @typedef {number} SectorId
 * 0=CENTER, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW, 8=N
 */

/** 扇区枚举 */
const SectorId = Object.freeze({
  CENTER: 0,
  NE: 1,
  E: 2,
  SE: 3,
  S: 4,
  SW: 5,
  W: 6,
  NW: 7,
  N: 8
});

/** 扇区→姿态帧文件映射（对齐 FR-003 契约，禁止改动编号语义） */
const MOVE_FRAMES = Object.freeze({
  [SectorId.CENTER]: 'res/move/0.png',
  [SectorId.NE]: 'res/move/1.png',
  [SectorId.E]: 'res/move/2.png',
  [SectorId.SE]: 'res/move/3.png',
  [SectorId.S]: 'res/move/4.png',
  [SectorId.SW]: 'res/move/5.png',
  [SectorId.W]: 'res/move/6.png',
  [SectorId.NW]: 'res/move/7.png',
  [SectorId.N]: 'res/move/8.png'
});

/** 全部姿态帧相对路径数组，供 ResourceLoader.preload 使用 */
const ALL_MOVE_FRAMES = Object.freeze(Object.values(MOVE_FRAMES));

/** 休息态素材路径（FR-008） */
const REST_FRAME = 'res/rest/sit_back/sit_back.png';

/** 雪碧图配置（性能优化：1 次请求替代 9 次） */
const SPRITE_PATH = 'res/spine/move_sprite.png';
const SPRITE_CSS_PATH = 'res/spine/move_sprite.css';
const SPRITE_FRAME_SIZE = 128;
const SPRITE_COLS = 3;
const SPRITE_ROWS = 3;
const CSS_FRAME_CLASS_PREFIX = 'move-sprite-';

/** 眨眼雪碧图（与 move_sprite 同 3x3 布局，眼睛闭合态） */
const BLINK_SPRITE_PATH = 'res/spine/blink_sprite.png';
/** 休息态闭眼图（与 sit_back 同尺寸，rest 阶段眨眼叠加） */
const BLINK_REST_PATH = 'res/rest/sit_back/blink_sit_back.png';
/** 单次眨眼总时长（0.5–1s 区间默认 600ms，缓慢眨眼） */
const BLINK_DURATION_MS = 600;
/** 眨眼间隔随机抖动区间（3–5s，避免机械节拍感） */
const BLINK_INTERVAL_MIN_MS = 3000;
const BLINK_INTERVAL_MAX_MS = 5000;
/** 眨眼图层与播放态 class */
const BLINK_LAYER_CLASS = 'cem-blink-layer';
const BLINK_PLAY_CLASS = 'cem-blinking';

/** 过渡帧目录（构建期生成产物） */
const TRANSITION_FRAME_DIR = 'res/move/transitions';

/** 8 扇区角度带（单位：度；右开左闭，对齐 FR-003 DDS §6.4） */
const SECTOR_BANDS = Object.freeze([
  Object.freeze({ id: SectorId.E, minDeg: -22.5, maxDeg: 22.5 }),
  Object.freeze({ id: SectorId.SE, minDeg: 22.5, maxDeg: 67.5 }),
  Object.freeze({ id: SectorId.S, minDeg: 67.5, maxDeg: 112.5 }),
  Object.freeze({ id: SectorId.SW, minDeg: 112.5, maxDeg: 157.5 }),
  Object.freeze({ id: SectorId.W, minDeg: 157.5, maxDeg: 180 }),
  Object.freeze({ id: SectorId.W, minDeg: -180, maxDeg: -157.5 }),
  Object.freeze({ id: SectorId.NW, minDeg: -157.5, maxDeg: -112.5 }),
  Object.freeze({ id: SectorId.N, minDeg: -112.5, maxDeg: -67.5 }),
  Object.freeze({ id: SectorId.NE, minDeg: -67.5, maxDeg: -22.5 })
]);

/** 休息态触发阈值（FR-008 默认 10s） */
const IDLE_THRESHOLD_MS = 10000;
/** 唤醒防抖 */
const WAKE_DEBOUNCE_MS = 120;
/** 过渡最小间隔（§6 边界节流） */
const TRANSITION_THROTTLE_MS = 60;
/** 单次过渡时长（80~160ms） */
const TRANSITION_DURATION_MS = 120;
/** 页面隐藏暂停 rAF（NFR-002） */
const RAF_SUSPEND_ON_HIDDEN = true;
/** devicePixelRatio 上限（NFR-007） */
const DPR_CAP = 3;

/** 存储键 */
const KEY_POSITION = 'cem.position';
const KEY_SETTINGS = 'cem.settings';

/** 默认设置 */
const DEFAULT_SETTINGS = Object.freeze({
  hidden: false,
  clampToViewport: true,
  locale: 'en'
});

/** 扩展默认语言回退基线（与 manifest default_locale 一致） */
const DEFAULT_LOCALE = 'en';

/** UI 语言到 _locales 目录映射 */
const LOCALE_MAP = Object.freeze({
  zh: 'zh_CN',
  'zh-CN': 'zh_CN',
  'zh-cn': 'zh_CN',
  en: 'en',
  'en-US': 'en'
});

/** 悬浮容器配置（FR-001） */
const OVERLAY_Z_INDEX = 2147483647;
const OVERLAY_DEFAULT_EDGE_GAP_PX = 8;
const OVERLAY_BG_TRANSPARENT = true;
/** 显隐切换淡入淡出时长（平滑过渡） */
const OVERLAY_FADE_MS = 180;

/** 拖拽配置（FR-002） */
const DRAG_MOVE_THRESHOLD_PX = 3;
const DRAG_EDGE_MARGIN_PX = 0;

/** 消息协议类型（M-15 ServiceWorker） */
const MSG_TYPES = Object.freeze({
  TOGGLE_VISIBLE: 'TOGGLE_VISIBLE',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  ACK: 'ACK'
});

export {
  SectorId,
  MOVE_FRAMES,
  ALL_MOVE_FRAMES,
  REST_FRAME,
  SPRITE_PATH,
  SPRITE_CSS_PATH,
  SPRITE_FRAME_SIZE,
  SPRITE_COLS,
  SPRITE_ROWS,
  CSS_FRAME_CLASS_PREFIX,
  BLINK_SPRITE_PATH,
  BLINK_REST_PATH,
  BLINK_DURATION_MS,
  BLINK_INTERVAL_MIN_MS,
  BLINK_INTERVAL_MAX_MS,
  BLINK_LAYER_CLASS,
  BLINK_PLAY_CLASS,
  TRANSITION_FRAME_DIR,
  SECTOR_BANDS,
  IDLE_THRESHOLD_MS,
  WAKE_DEBOUNCE_MS,
  TRANSITION_THROTTLE_MS,
  TRANSITION_DURATION_MS,
  RAF_SUSPEND_ON_HIDDEN,
  DPR_CAP,
  KEY_POSITION,
  KEY_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_LOCALE,
  LOCALE_MAP,
  OVERLAY_Z_INDEX,
  OVERLAY_DEFAULT_EDGE_GAP_PX,
  OVERLAY_BG_TRANSPARENT,
  OVERLAY_FADE_MS,
  DRAG_MOVE_THRESHOLD_PX,
  DRAG_EDGE_MARGIN_PX,
  MSG_TYPES
};
