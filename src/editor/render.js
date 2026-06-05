// src/editor/render.js
// Editor canvas drawing + pure screen<->tile coordinate math. panX is a world-space
// horizontal scroll in px; zoom is screen px per 16px tile. Read-only of the model.
import { TILE } from '../engine/constants.js';

export function screenToTile(view, sx, sy) {
  const worldX = sx / view.zoom * TILE + view.panX;
  const worldY = sy / view.zoom * TILE;
  return { col: Math.floor(worldX / TILE), row: Math.floor(worldY / TILE) };
}
export function tileToScreen(view, col, row) {
  return { sx: (col * TILE - view.panX) * view.zoom / TILE, sy: row * TILE * view.zoom / TILE };
}

const TILE_SPRITE = { ground:'ground', brick:'brick', 'used-block':'usedBlock', pipe:'pipe', 'pipe-deco':'pipeDeco' };
const ENTITY_COLOR = { player:'#fff', platform:'#caa472', conveyor:'#888', spring:'#d33', checkpoint:'#3c6', finish:'#fc3', enemy:'#a52' };

// Draw the model. sprites = buildSprites(1). view = { panX, zoom, w, h }.
export function drawEditor(ctx, model, sprites, view, selection) {
  const z = view.zoom, cells = TILE; const px = (worldX) => (worldX - view.panX) * z / cells;
  ctx.fillStyle = '#0b0b16'; ctx.fillRect(0, 0, view.w, view.h);
  // tiles
  for (let r = 0; r < model.meta.h; r++) for (let c = 0; c < model.meta.w; c++) {
    const kind = model.tiles[r][c]; if (kind === 'empty') continue;
    const sx = px(c*cells), sy = r*z, key = TILE_SPRITE[kind];
    if (key && sprites[key]) ctx.drawImage(sprites[key], Math.round(sx), Math.round(sy), z, z);
    else { ctx.fillStyle = '#557'; ctx.fillRect(Math.round(sx), Math.round(sy), z, z); }   // coin/blocks fallback swatch
  }
  // entities
  for (const e of model.entities) {
    const sx = px(e.x), sy = e.y * z / cells, w = (e.transform?.w || cells) * z / cells, h = (e.transform?.h || cells) * z / cells;
    ctx.fillStyle = ENTITY_COLOR[e.type] || '#0ff';
    ctx.globalAlpha = 0.85; ctx.fillRect(Math.round(sx), Math.round(sy), Math.round(w), Math.round(h)); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000'; ctx.strokeRect(Math.round(sx)+0.5, Math.round(sy)+0.5, Math.round(w), Math.round(h));
  }
  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let c = 0; c <= model.meta.w; c++) { const x = px(c*cells); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, model.meta.h*z); ctx.stroke(); }
  for (let r = 0; r <= model.meta.h; r++) { const y = r*z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(model.meta.w*z - view.panX*z/cells, y); ctx.stroke(); }
  // selection
  if (selection != null && model.entities[selection]) {
    const e = model.entities[selection]; const sx = px(e.x), sy = e.y*z/cells;
    const w = (e.transform?.w||cells)*z/cells, h = (e.transform?.h||cells)*z/cells;
    ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(Math.round(sx)-1, Math.round(sy)-1, Math.round(w)+2, Math.round(h)+2); ctx.lineWidth = 1;
  }
}
