// path: src/adapter/__tests__/i18n-service.test.js
import { describe, it, expect } from 'vitest';
import { createI18nService } from '../i18n-service.js';
import { DEFAULT_LOCALE, LOCALE_MAP } from '../../shared/constants.js';

/** 构造 i18n adapter：messages 为 key→message 映射，自动处理 $1/$2 占位符 */
function createI18nAdapter(messages = {}, uiLang = DEFAULT_LOCALE) {
  return {
    i18n: () => ({
      getMessage: (key, subs) => {
        const msg = messages[key];
        if (!msg) return '';
        let out = msg;
        if (Array.isArray(subs)) {
          subs.forEach((s, i) => {
            out = out.split('$' + (i + 1)).join(String(s));
          });
        }
        return out;
      },
      getUILanguage: () => uiLang
    })
  };
}

/** i18n() 抛错的 adapter */
function createUnavailableAdapter() {
  return { i18n: () => { throw new Error('i18n.* unavailable'); } };
}

const ZH_MESSAGES = {
  action_show: '显示猫咪',
  greet: '你好，$1！今天是 $2。'
};
const EN_MESSAGES = {
  action_show: 'Show Cat',
  greet: 'Hello, $1! Today is $2.'
};

describe('I18nService', () => {
  describe('t', () => {
    it('zh_CN 下返回中文文案', () => {
      const svc = createI18nService(createI18nAdapter(ZH_MESSAGES, 'zh-CN'));
      expect(svc.t('action_show')).toBe('显示猫咪');
    });

    it('en 下返回英文文案', () => {
      const svc = createI18nService(createI18nAdapter(EN_MESSAGES, 'en-US'));
      expect(svc.t('action_show')).toBe('Show Cat');
    });

    it('key 不存在时返回 key 本身', () => {
      const svc = createI18nService(createI18nAdapter(ZH_MESSAGES, 'zh-CN'));
      expect(svc.t('not_exist_key')).toBe('not_exist_key');
    });

    it('占位符 $1/$2 正确替换', () => {
      const svc = createI18nService(createI18nAdapter(EN_MESSAGES, 'en'));
      expect(svc.t('greet', ['Alice', 'Monday'])).toBe('Hello, Alice! Today is Monday.');
    });

    it('i18n 不可用时返回 key 本身且不抛', () => {
      const svc = createI18nService(createUnavailableAdapter());
      expect(svc.t('any_key')).toBe('any_key');
    });
  });

  describe('getLocale', () => {
    it('zh-CN 映射为 zh_CN', () => {
      const svc = createI18nService(createI18nAdapter({}, 'zh-CN'));
      expect(svc.getLocale()).toBe('zh_CN');
    });

    it('zh 映射为 zh_CN', () => {
      const svc = createI18nService(createI18nAdapter({}, 'zh'));
      expect(svc.getLocale()).toBe('zh_CN');
    });

    it('en-US 映射为 en', () => {
      const svc = createI18nService(createI18nAdapter({}, 'en-US'));
      expect(svc.getLocale()).toBe('en');
    });

    it('未命中语言回退 DEFAULT_LOCALE', () => {
      const svc = createI18nService(createI18nAdapter({}, 'fr-FR'));
      expect(svc.getLocale()).toBe(DEFAULT_LOCALE);
    });

    it('i18n 不可用时回退 DEFAULT_LOCALE', () => {
      const svc = createI18nService(createUnavailableAdapter());
      expect(svc.getLocale()).toBe(DEFAULT_LOCALE);
    });
  });

  describe('hasKey', () => {
    it('存在返回 true', () => {
      const svc = createI18nService(createI18nAdapter(EN_MESSAGES, 'en'));
      expect(svc.hasKey('action_show')).toBe(true);
    });

    it('不存在返回 false', () => {
      const svc = createI18nService(createI18nAdapter(EN_MESSAGES, 'en'));
      expect(svc.hasKey('missing')).toBe(false);
    });

    it('i18n 不可用时返回 false', () => {
      const svc = createI18nService(createUnavailableAdapter());
      expect(svc.hasKey('any')).toBe(false);
    });
  });

  describe('bulk', () => {
    it('批量返回 key→文案映射', () => {
      const svc = createI18nService(createI18nAdapter(EN_MESSAGES, 'en'));
      const out = svc.bulk(['action_show', 'greet', 'missing']);
      expect(out.action_show).toBe('Show Cat');
      expect(out.missing).toBe('missing');
      expect(Object.keys(out)).toHaveLength(3);
    });

    it('空数组返回空对象', () => {
      const svc = createI18nService(createI18nAdapter(EN_MESSAGES, 'en'));
      expect(svc.bulk([])).toEqual({});
    });
  });

  describe('CONFIG / 冻结', () => {
    it('LOCALE_MAP 与常量一致且服务已冻结', () => {
      const svc = createI18nService(createI18nAdapter({}, 'en'));
      expect(Object.isFrozen(svc)).toBe(true);
      expect(LOCALE_MAP['zh-CN']).toBe('zh_CN');
    });
  });
});
