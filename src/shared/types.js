// path: src/shared/types.js
// 全局共享类型与 Result 工具（详见 DDS §1 全局数据类型定义）
// 被 M-02/M-03/M-04 等多模块依赖，纯数据定义，无副作用。

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Point} Position
 */

/**
 * @typedef {Object} Settings
 * @property {boolean} hidden
 * @property {boolean} clampToViewport
 * @property {string} locale
 */

/**
 * @typedef {Object} AppError
 * @property {string} code
 * @property {string} message
 * @property {*} [context]
 */

/**
 * @template T
 * @typedef {Object} Result
 * @property {boolean} ok
 * @property {T} [value]
 * @property {AppError} [error]
 */

/** 构造成功结果 */
function ok(value) {
  return Object.freeze({ ok: true, value });
}

/** 构造失败结果 */
function err(code, message, context) {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message, context }) });
}

/** Result 命名空间，冻结防止篡改 */
const Result = Object.freeze({ ok, err });

export { Result, ok, err };
