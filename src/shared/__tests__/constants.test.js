// path: src/shared/__tests__/constants.test.js
import { describe, it, expect } from 'vitest';
import {
  SectorId,
  MOVE_FRAMES,
  IDLE_THRESHOLD_MS,
  SECTOR_BANDS,
  DEFAULT_SETTINGS,
  MSG_TYPES
} from '../constants.js';

describe('constants', () => {
  it('MOVE_FRAMES 与 FR-003 契约一致', () => {
    expect(MOVE_FRAMES[SectorId.CENTER]).toBe('res/move/0.png');
    expect(MOVE_FRAMES[SectorId.NE]).toBe('res/move/1.png');
    expect(MOVE_FRAMES[SectorId.N]).toBe('res/move/8.png');
  });

  it('IDLE_THRESHOLD_MS = 8000（FR-008）', () => {
    expect(IDLE_THRESHOLD_MS).toBe(8000);
  });

  it('SECTOR_BANDS 覆盖 8 扇区', () => {
    expect(SECTOR_BANDS.length).toBe(9); // W 拆为两段
    const ids = new Set(SECTOR_BANDS.map(b => b.id));
    expect(ids.size).toBe(8);
  });

  it('DEFAULT_SETTINGS 合理', () => {
    expect(DEFAULT_SETTINGS.clampToViewport).toBe(true);
    expect(DEFAULT_SETTINGS.hidden).toBe(false);
  });

  it('MSG_TYPES 完整', () => {
    expect(MSG_TYPES.TOGGLE_VISIBLE).toBe('TOGGLE_VISIBLE');
    expect(MSG_TYPES.SETTINGS_UPDATED).toBe('SETTINGS_UPDATED');
  });
});
