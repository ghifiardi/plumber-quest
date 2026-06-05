// src/editor/model.js
// The editor's source of truth: a kind-grid + plain entity list, with pure ops that
// preserve the rectangular invariant (tiles = meta.h rows x meta.w cols).
import { TILE } from '../engine/constants.js';

export function blankModel(w = 32, h = 15, name = 'Untitled') {
  const tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => 'empty'));
  return { meta: { name, w, h }, tiles, entities: [{ type: 'player', x: 16, y: (h - 3) * TILE }] };
}

const inBounds = (m, col, row) => row >= 0 && row < m.meta.h && col >= 0 && col < m.meta.w;

export function paintTile(m, col, row, kind) { if (inBounds(m, col, row)) m.tiles[row][col] = kind; return m; }
export function eraseTile(m, col, row) { return paintTile(m, col, row, 'empty'); }

export function floodFill(m, col, row, kind) {
  if (!inBounds(m, col, row)) return m;
  const from = m.tiles[row][col];
  if (from === kind) return m;
  const stack = [[col, row]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (!inBounds(m, c, r) || m.tiles[r][c] !== from) continue;
    m.tiles[r][c] = kind;
    stack.push([c+1, r], [c-1, r], [c, r+1], [c, r-1]);
  }
  return m;
}

export function placeEntity(m, type, x, y) {
  if (type === 'player') m.entities = m.entities.filter(e => e.type !== 'player');
  m.entities.push({ type, x, y });
  return m.entities.length - 1;
}
export function moveEntity(m, i, x, y) { const e = m.entities[i]; if (e) { e.x = x; e.y = y; } return m; }
export function deleteEntity(m, i) { if (m.entities[i]) m.entities.splice(i, 1); return m; }

export function setEntityProp(m, i, path, value) {
  const e = m.entities[i]; if (!e) return m;
  const parts = path.split('.');
  let obj = e;
  for (let k = 0; k < parts.length - 1; k++) { obj[parts[k]] = obj[parts[k]] || {}; obj = obj[parts[k]]; }
  obj[parts[parts.length - 1]] = value;
  return m;
}

export function resize(m, w, h) {
  // defensive clamp: dims must be finite integers >= 1 (a forced bad input from the
  // editor must never throw via Array.from); fall back to current dims on garbage.
  w = Math.max(1, Math.floor(Number(w) || m.meta.w));
  h = Math.max(1, Math.floor(Number(h) || m.meta.h));
  const tiles = Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => (m.tiles[r] && m.tiles[r][c]) || 'empty'));
  m.tiles = tiles; m.meta.w = w; m.meta.h = h;
  m.entities = m.entities.filter(e => e.x >= 0 && e.x < w * TILE && e.y >= 0 && e.y < h * TILE);
  return m;
}
