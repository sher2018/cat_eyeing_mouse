// path: src/adapter/__tests__/resource-loader.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createResourceLoader, CONFIG, ERROR_CODES } from '../resource-loader.js';
import { SectorId, MOVE_FRAMES, ALL_MOVE_FRAMES } from '../../shared/constants.js';

/** 构造 runtime adapter：getURL 拼接为扩展绝对 URL */
function createRuntimeAdapter() {
  return { runtime: () => ({ getURL: (p) => 'chrome-extension://abc/' + p }) };
}

/** 构造 runtime 抛错的 adapter（模拟 getURL 不可用） */
function createThrowingRuntimeAdapter() {
  return { runtime: () => { throw new Error('runtime.* unavailable'); } };
}

/**
 * 安装 mock Image：src 命中 failSubstrings 之一时触发 onerror，否则 onload。
 * 回调在微任务中触发，模拟异步加载。
 */
function installMockImage(failSubstrings = []) {
  const original = globalThis.Image;
  const created = [];
  class MockImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this._src = '';
      created.push(this);
    }
    set src(v) {
      this._src = String(v);
      const shouldFail = failSubstrings.some((s) => this._src.includes(s));
      queueMicrotask(() => {
        if (shouldFail && typeof this.onerror === 'function') this.onerror();
        else if (typeof this.onload === 'function') this.onload();
      });
    }
    get src() { return this._src; }
  }
  globalThis.Image = MockImage;
  return {
    created,
    restore: () => { if (original !== undefined) globalThis.Image = original; else delete globalThis.Image; }
  };
}

describe('ResourceLoader', () => {
  let mockImage;
  beforeEach(() => { mockImage = installMockImage(); });
  afterEach(() => { mockImage.restore(); });

  describe('getUrl', () => {
    it('相对路径解析为扩展绝对 URL', () => {
      const svc = createResourceLoader(createRuntimeAdapter());
      const url = svc.getUrl('res/move/1.png');
      expect(url).toBe('chrome-extension://abc/res/move/1.png');
    });

    it('runtime 不可用时回退 FALLBACK_DATAURL', () => {
      const svc = createResourceLoader(createThrowingRuntimeAdapter());
      expect(svc.getUrl('res/move/1.png')).toBe(CONFIG.FALLBACK_DATAURL);
    });
  });

  describe('preload + get', () => {
    it('preload 后 get(CENTER) 返回已缓存 Image', async () => {
      const svc = createResourceLoader(createRuntimeAdapter());
      await svc.preload(['res/move/0.png']);
      const r = svc.get(SectorId.CENTER);
      expect(r.ok).toBe(true);
      expect(r.value).toBeDefined();
      expect(r.value.src).toContain('res/move/0.png');
    });

    it('默认 preload 加载全部姿态帧后各 sector 均可取', async () => {
      const svc = createResourceLoader(createRuntimeAdapter());
      await svc.preload();
      for (const id of Object.keys(MOVE_FRAMES).map(Number)) {
        const r = svc.get(id);
        expect(r.ok).toBe(true);
        expect(r.value).toBeDefined();
      }
    });

    it('单帧 404：该 sector 回退占位，其它正常', async () => {
      const mock = installMockImage(['res/move/3.png']);
      const svc = createResourceLoader(createRuntimeAdapter());
      await svc.preload(['res/move/0.png', 'res/move/3.png']);
      const ok0 = svc.get(SectorId.CENTER);
      expect(ok0.value.src).toContain('res/move/0.png');
      const fail3 = svc.get(SectorId.SE);
      expect(fail3.value.src).toBe(CONFIG.FALLBACK_DATAURL);
      mock.restore();
    });

    it('preload 单帧失败时整体仍返回 ok', async () => {
      const mock = installMockImage(['res/move/3.png']);
      const svc = createResourceLoader(createRuntimeAdapter());
      const r = await svc.preload(['res/move/3.png']);
      expect(r.ok).toBe(true);
      mock.restore();
    });
  });

  describe('get（未命中 / 降级）', () => {
    it('未预加载时 get 返回 fallback 且 ok', () => {
      const svc = createResourceLoader(createRuntimeAdapter());
      const r = svc.get(SectorId.N);
      expect(r.ok).toBe(true);
      expect(r.value.src).toBe(CONFIG.FALLBACK_DATAURL);
    });

    it('runtime 不可用时 get 仍返回 fallback 不崩', () => {
      const svc = createResourceLoader(createThrowingRuntimeAdapter());
      const r = svc.get(SectorId.E);
      expect(r.ok).toBe(true);
      expect(r.value).toBeDefined();
    });
  });

  describe('getFallback', () => {
    it('返回 src 为 FALLBACK_DATAURL 的 Image', () => {
      const svc = createResourceLoader(createRuntimeAdapter());
      const fb = svc.getFallback();
      expect(fb).toBeDefined();
      expect(fb.src).toBe(CONFIG.FALLBACK_DATAURL);
    });
  });

  describe('invalidate', () => {
    it('清空缓存后 get 回到 fallback', async () => {
      const svc = createResourceLoader(createRuntimeAdapter());
      await svc.preload(['res/move/0.png']);
      expect(svc.get(SectorId.CENTER).value.src).toContain('res/move/0.png');
      svc.invalidate();
      expect(svc.get(SectorId.CENTER).value.src).toBe(CONFIG.FALLBACK_DATAURL);
    });
  });

  describe('幂等', () => {
    it('重复 preload 不报错且覆盖缓存', async () => {
      const svc = createResourceLoader(createRuntimeAdapter());
      await svc.preload(['res/move/0.png']);
      const first = svc.get(SectorId.CENTER).value;
      await svc.preload(['res/move/0.png']);
      const second = svc.get(SectorId.CENTER).value;
      expect(second).toBeDefined();
      expect(second.src).toContain('res/move/0.png');
      expect(second).not.toBe(first);
    });
  });

  describe('CONFIG / 冻结', () => {
    it('配置已冻结且 MOVE_FRAMES 与常量一致', () => {
      expect(Object.isFrozen(CONFIG)).toBe(true);
      expect(CONFIG.MOVE_FRAMES[SectorId.CENTER]).toBe(MOVE_FRAMES[SectorId.CENTER]);
      expect(ALL_MOVE_FRAMES).toHaveLength(9);
    });

    it('错误码定义完整', () => {
      expect(ERROR_CODES.RES_LOAD_FAILED).toBe('RES_LOAD_FAILED');
      expect(ERROR_CODES.RES_URL_UNAVAILABLE).toBe('RES_URL_UNAVAILABLE');
    });
  });
});
