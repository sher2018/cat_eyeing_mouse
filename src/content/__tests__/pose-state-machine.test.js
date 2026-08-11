// path: src/content/__tests__/pose-state-machine.test.js
// M-07 PoseStateMachine 单元测试（DDS §8.10）。

import { describe, it, expect, beforeEach } from 'vitest';
import { createPoseStateMachine } from '../pose-state-machine.js';
import { SectorId } from '../../shared/constants.js';

describe('PoseStateMachine', () => {
  let psm;

  beforeEach(() => {
    // hoverRadius=10，猫中心 (50,50)
    psm = createPoseStateMachine({ hoverRadius: 10 });
  });

  it('8 方向各触发对应 sector 回调', () => {
    const seen = [];
    psm.onPoseChange((s) => seen.push(s));
    const center = { x: 50, y: 50 };
    // E (+x)
    psm.update({ x: 200, y: 50 }, center);
    expect(seen.pop()).toBe(SectorId.E);
    // S (+y)
    psm.update({ x: 50, y: 200 }, center);
    expect(seen.pop()).toBe(SectorId.S);
    // W (-x)
    psm.update({ x: -100, y: 50 }, center);
    expect(seen.pop()).toBe(SectorId.W);
    // N (-y)
    psm.update({ x: 50, y: -100 }, center);
    expect(seen.pop()).toBe(SectorId.N);
    // NE
    psm.update({ x: 200, y: -100 }, center);
    expect(seen.pop()).toBe(SectorId.NE);
    // SE
    psm.update({ x: 200, y: 200 }, center);
    expect(seen.pop()).toBe(SectorId.SE);
    // SW
    psm.update({ x: -100, y: 200 }, center);
    expect(seen.pop()).toBe(SectorId.SW);
    // NW
    psm.update({ x: -100, y: -100 }, center);
    expect(seen.pop()).toBe(SectorId.NW);
  });

  it('同 sector 连续 update 仅回调一次（防抖）', () => {
    const seen = [];
    psm.onPoseChange((s) => seen.push(s));
    const center = { x: 0, y: 0 };
    psm.update({ x: 100, y: 0 }, center);
    psm.update({ x: 120, y: 0 }, center);
    psm.update({ x: 130, y: 0 }, center);
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(SectorId.E);
  });

  it('hover 进入→CENTER，离开→恢复', () => {
    const poses = [];
    const hovers = [];
    psm.onPoseChange((s) => poses.push(s));
    psm.onHoverChange((b) => hovers.push(b));
    const center = { x: 0, y: 0 };
    psm.update({ x: 100, y: 0 }, center); // E
    expect(poses.pop()).toBe(SectorId.E);
    psm.setHover(true);
    expect(hovers.pop()).toBe(true);
    expect(psm.current()).toBe(SectorId.CENTER);
    psm.update({ x: 5, y: 5 }, center); // hover 中强制 CENTER
    expect(psm.current()).toBe(SectorId.CENTER);
    psm.setHover(false);
    expect(hovers.pop()).toBe(false);
    psm.update({ x: 100, y: 0 }, center);
    expect(psm.current()).toBe(SectorId.E);
  });

  it('Resting 态 update 被忽略', () => {
    const seen = [];
    psm.onPoseChange((s) => seen.push(s));
    const center = { x: 0, y: 0 };
    psm.enterResting();
    psm.update({ x: 1000, y: 0 }, center);
    expect(seen.length).toBe(0);
    psm.exitResting();
    psm.update({ x: 1000, y: 0 }, center);
    expect(seen.length).toBe(1);
  });

  it('订阅者抛错不影响后续订阅者', () => {
    const results = [];
    psm.onPoseChange(() => { throw new Error('boom'); });
    psm.onPoseChange((s) => results.push(s));
    psm.update({ x: 100, y: 0 }, { x: 0, y: 0 });
    expect(results.length).toBe(1);
  });

  it('onPoseChange/onHoverChange 返回取消订阅函数', () => {
    const seen = [];
    const off = psm.onPoseChange((s) => seen.push(s));
    off();
    psm.update({ x: 100, y: 0 }, { x: 0, y: 0 });
    expect(seen.length).toBe(0);
  });
});
