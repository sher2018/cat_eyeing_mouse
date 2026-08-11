// path: src/adapter/__tests__/storage-service.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStorageService, deepMerge, ERROR_CODES } from '../storage-service.js';
import { KEY_POSITION, KEY_SETTINGS, DEFAULT_SETTINGS } from '../../shared/constants.js';

/** 构造内存版 adapter，模拟 chrome.storage.local 行为 */
function createMemoryAdapter(initial = {}) {
  const data = { ...initial };
  return {
    _data: data,
    storage: () => ({
      localGet: async (keys) => {
        if (typeof keys === 'string') {
          return keys in data ? { [keys]: data[keys] } : {};
        }
        return { ...data };
      },
      localSet: async (items) => {
        for (const [k, v] of Object.entries(items)) {
          if (v === undefined) delete data[k];
          else data[k] = v;
        }
      }
    })
  };
}

/** 构造 storage() 抛错的 adapter（模拟受限页面） */
function createThrowingAdapter() {
  return { storage: () => { throw new Error('storage.local unavailable'); } };
}

/** 构造写入超配额的 adapter */
function createQuotaAdapter() {
  return {
    storage: () => ({
      localGet: async () => ({}),
      localSet: async () => {
        throw new Error('QUOTA_BYTES quota exceeded');
      }
    })
  };
}

describe('StorageService', () => {
  describe('getPosition / setPosition', () => {
    it('写入坐标后读取一致', async () => {
      const svc = createStorageService(createMemoryAdapter());
      const r = await svc.setPosition({ x: 120, y: 240 });
      expect(r.ok).toBe(true);
      const got = await svc.getPosition();
      expect(got.ok).toBe(true);
      expect(got.value).toEqual({ x: 120, y: 240 });
    });

    it('无记忆坐标时返回 null', async () => {
      const svc = createStorageService(createMemoryAdapter());
      const got = await svc.getPosition();
      expect(got.ok).toBe(true);
      expect(got.value).toBeNull();
    });

    it('storage 不可用时返回 STORAGE_UNAVAILABLE', async () => {
      const svc = createStorageService(createThrowingAdapter());
      const got = await svc.getPosition();
      expect(got.ok).toBe(false);
      expect(got.error.code).toBe(ERROR_CODES.STORAGE_UNAVAILABLE);
    });

    it('写入超配额返回 STORAGE_QUOTA', async () => {
      const svc = createStorageService(createQuotaAdapter());
      const r = await svc.setPosition({ x: 1, y: 2 });
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe(ERROR_CODES.STORAGE_QUOTA);
    });
  });

  describe('getSettings / setSettings', () => {
    it('缺省返回 DEFAULT_SETTINGS', async () => {
      const svc = createStorageService(createMemoryAdapter());
      const got = await svc.getSettings();
      expect(got.ok).toBe(true);
      expect(got.value).toEqual({ ...DEFAULT_SETTINGS });
    });

    it('部分设置写入后与默认深合并，保留其它字段', async () => {
      const adapter = createMemoryAdapter();
      const svc = createStorageService(adapter);
      const r = await svc.setSettings({ hidden: true });
      expect(r.ok).toBe(true);
      const got = await svc.getSettings();
      expect(got.value.hidden).toBe(true);
      expect(got.value.clampToViewport).toBe(DEFAULT_SETTINGS.clampToViewport);
      expect(got.value.locale).toBe(DEFAULT_SETTINGS.locale);
    });

    it('多次部分写入累积合并', async () => {
      const svc = createStorageService(createMemoryAdapter());
      await svc.setSettings({ hidden: true });
      await svc.setSettings({ locale: 'zh_CN' });
      const got = await svc.getSettings();
      expect(got.value).toEqual({ hidden: true, clampToViewport: true, locale: 'zh_CN' });
    });

    it('存储结构损坏时回退默认并合并', async () => {
      const adapter = createMemoryAdapter({ [KEY_SETTINGS]: 'corrupt-string' });
      const svc = createStorageService(adapter);
      const got = await svc.getSettings();
      expect(got.ok).toBe(true);
      expect(got.value).toEqual({ ...DEFAULT_SETTINGS });
    });

    it('storage 不可用时 getSettings 返回 STORAGE_UNAVAILABLE', async () => {
      const svc = createStorageService(createThrowingAdapter());
      const got = await svc.getSettings();
      expect(got.ok).toBe(false);
      expect(got.error.code).toBe(ERROR_CODES.STORAGE_UNAVAILABLE);
    });
  });

  describe('clear', () => {
    it('清除指定键后再读取为 null', async () => {
      const adapter = createMemoryAdapter();
      const svc = createStorageService(adapter);
      await svc.setPosition({ x: 5, y: 6 });
      const cleared = await svc.clear(KEY_POSITION);
      expect(cleared.ok).toBe(true);
      const got = await svc.getPosition();
      expect(got.value).toBeNull();
      expect(KEY_POSITION in adapter._data).toBe(false);
    });

    it('storage 不可用时返回 STORAGE_UNAVAILABLE', async () => {
      const svc = createStorageService(createThrowingAdapter());
      const r = await svc.clear(KEY_SETTINGS);
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe(ERROR_CODES.STORAGE_UNAVAILABLE);
    });
  });

  describe('deepMerge（纯函数）', () => {
    it('source 覆盖 target 同名键', () => {
      const out = deepMerge({ a: 1, b: 2 }, { b: 9, c: 3 });
      expect(out).toEqual({ a: 1, b: 9, c: 3 });
    });

    it('嵌套对象递归合并', () => {
      const out = deepMerge({ o: { x: 1, y: 2 } }, { o: { y: 20 } });
      expect(out).toEqual({ o: { x: 1, y: 20 } });
    });

    it('source 非对象时返回 target 副本', () => {
      const out = deepMerge({ a: 1 }, null);
      expect(out).toEqual({ a: 1 });
    });

    it('不修改入参（不可变性）', () => {
      const target = { a: { x: 1 } };
      const source = { a: { y: 2 } };
      deepMerge(target, source);
      expect(target).toEqual({ a: { x: 1 } });
    });
  });

  describe('导出与冻结', () => {
    it('默认实例与工厂均可用且已冻结', () => {
      const svc = createStorageService(createMemoryAdapter());
      expect(Object.isFrozen(svc)).toBe(true);
      expect(typeof svc.getPosition).toBe('function');
    });
  });
});
