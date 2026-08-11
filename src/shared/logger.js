// path: src/shared/logger.js
// 统一分级日志工具，格式：[Level][Module][Event] context
// 所有模块通过 createLogger('Module') 创建专属实例。

const LOG_LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

/** 当前最低输出级别，可通过 setLevel 动态调整（默认 info） */
let currentMinLevel = LOG_LEVELS.info;

function setLevel(levelName) {
  const level = LOG_LEVELS[levelName];
  if (typeof level === 'number') currentMinLevel = level;
}

function shouldLog(levelName) {
  return LOG_LEVELS[levelName] >= currentMinLevel;
}

function format(levelName, module, event, context) {
  const ctx = context ? ' ' + safeStringify(context) : '';
  return `[${levelName.toUpperCase()}][${module}]${event ? '[' + event + ']' : ''}${ctx}`;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function createLogger(module) {
  return Object.freeze({
    debug: (event, context) => emit('debug', module, event, context),
    info: (event, context) => emit('info', module, event, context),
    warn: (event, context) => emit('warn', module, event, context),
    error: (event, context) => emit('error', module, event, context)
  });
}

function emit(levelName, module, event, context) {
  if (!shouldLog(levelName)) return;
  const line = format(levelName, module, event, context);
  if (levelName === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (levelName === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export { createLogger, setLevel, LOG_LEVELS };
