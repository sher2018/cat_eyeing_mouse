// path: src/shared/__tests__/geometry.test.js
import { describe, it, expect } from 'vitest';
import { classifySector, angleBetween, computeDelta } from '../geometry.js';
import { SectorId } from '../constants.js';

describe('geometry / classifySector', () => {
  it('中心圈内归 CENTER', () => {
    expect(classifySector(0, 0, 10)).toBe(SectorId.CENTER);
    expect(classifySector(5, 5, 10)).toBe(SectorId.CENTER);
  });

  it('8 方向中心点归类正确', () => {
    const far = 1000;
    expect(classifySector(far, 0, 10)).toBe(SectorId.E); // 右
    expect(classifySector(0, far, 10)).toBe(SectorId.S); // 下
    expect(classifySector(-far, 0, 10)).toBe(SectorId.W); // 左
    expect(classifySector(0, -far, 10)).toBe(SectorId.N); // 上
    expect(classifySector(far, -far, 10)).toBe(SectorId.NE); // 右上
    expect(classifySector(far, far, 10)).toBe(SectorId.SE); // 右下
    expect(classifySector(-far, far, 10)).toBe(SectorId.SW); // 左下
    expect(classifySector(-far, -far, 10)).toBe(SectorId.NW); // 左上
  });

  it('右开左闭边界（±22.5°）', () => {
    const r = 10;
    // 22.5° 上界，位于 E 与 SE 之间，右开 → 属 SE
    const deg = 22.5;
    const rad = deg * Math.PI / 180;
    expect(classifySector(Math.cos(rad) * 100, Math.sin(rad) * 100, r)).toBe(SectorId.SE);
  });

  it('非法输入返回 CENTER', () => {
    expect(classifySector(NaN, 0, 10)).toBe(SectorId.CENTER);
    expect(classifySector(1, undefined, 10)).toBe(SectorId.CENTER);
  });
});

describe('geometry / angleBetween', () => {
  it('CENTER 参与 = 0', () => {
    expect(angleBetween(SectorId.CENTER, SectorId.E)).toBe(0);
  });
  it('相邻扇区 = 45', () => {
    expect(angleBetween(SectorId.E, SectorId.SE)).toBe(45);
  });
  it('最短夹角（跨 180）', () => {
    expect(angleBetween(SectorId.NE, SectorId.NW)).toBe(90);
  });
});

describe('geometry / computeDelta', () => {
  it('正确计算位移', () => {
    const d = computeDelta({ x: 1, y: 2 }, { x: 4, y: 6 });
    expect(d).toEqual({ dx: 3, dy: 4 });
  });
});
