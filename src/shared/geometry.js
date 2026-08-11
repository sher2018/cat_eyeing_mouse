// path: src/shared/geometry.js
// M-05 shared/geometry —— 纯函数：8 扇区 + 中心态归类。
// 对齐 DDS §6 与 FR-003 角度契约（atan2，右开左闭）。

import { SectorId, SECTOR_BANDS } from './constants.js';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * 计算两点之间的位移。
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @returns {{dx:number,dy:number}}
 */
function computeDelta(from, to) {
  return { dx: to.x - from.x, dy: to.y - from.y };
}

/**
 * 将 atan2 输出归一化到 [-180, 180]。
 * @param {number} dx
 * @param {number} dy
 * @returns {number} 角度（度）
 */
function toDegrees(dx, dy) {
  return Math.atan2(dy, dx) * RAD_TO_DEG;
}

/**
 * 在角度带表中查找所属扇区（右开左闭）。
 * @param {number} deg
 * @returns {number} SectorId
 */
function findSectorByDegree(deg) {
  for (const band of SECTOR_BANDS) {
    if (deg >= band.minDeg && deg < band.maxDeg) {
      return band.id;
    }
  }
  // 恰为 180°（W 扇区右闭端点）兜底
  if (deg === 180 || deg === -180) return SectorId.W;
  // 理论不可达，安全回退到 CENTER
  return SectorId.CENTER;
}

/**
 * 根据鼠标相对猫中心的位移归类扇区。
 * 中心圈半径内归 CENTER（hover 态）。
 * @param {number} dx
 * @param {number} dy
 * @param {number} hoverRadius 中心圈半径
 * @returns {number} SectorId
 */
function classifySector(dx, dy, hoverRadius) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return SectorId.CENTER;
  const radius = Math.max(0, hoverRadius || 0);
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return SectorId.CENTER;
  const deg = toDegrees(dx, dy);
  return findSectorByDegree(deg);
}

/**
 * 计算两个扇区之间的最短夹角（度），用于过渡帧选取。
 * @param {number} from SectorId
 * @param {number} to SectorId
 * @returns {number} 0~180
 */
function angleBetween(from, to) {
  if (from === SectorId.CENTER || to === SectorId.CENTER) return 0;
  const raw = Math.abs(from - to) * 45;
  return raw > 180 ? 360 - raw : raw;
}

export { computeDelta, toDegrees, classifySector, findSectorByDegree, angleBetween };
