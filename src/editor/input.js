// src/editor/input.js
// Pure editor input helpers. entityAt does AABB hit-testing in WORLD coords (px).
import { TILE } from '../engine/constants.js';

export function entityAt(model, worldX, worldY) {
  for (let i = model.entities.length - 1; i >= 0; i--) {   // topmost first
    const e = model.entities[i];
    const w = e.transform?.w || TILE, h = e.transform?.h || TILE;
    if (worldX >= e.x && worldX < e.x + w && worldY >= e.y && worldY < e.y + h) return i;
  }
  return -1;
}

// Snap a world coord to the tile grid (entities place on tile origins).
export const snap = (v) => Math.floor(v / TILE) * TILE;
