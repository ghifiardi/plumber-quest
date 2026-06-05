// src/editor/input.js
// Pure editor input helpers. entityAt does AABB hit-testing in WORLD coords (px).
import { TILE } from '../engine/constants.js';
import { TYPE_REGISTRY } from '../ecs/components.js';

// Components a type carries that the property panel can edit (schema-driven). Derived
// from TYPE_REGISTRY so a freshly-placed entity (just {type,x,y}) still exposes its
// editable fields; the panel seeds the override bag on first edit.
const EDITABLE_COMPONENTS = new Set(['transform', 'mover', 'conveyor', 'bouncer', 'walker', 'trigger']);
export function editableComponentsForType(type) {
  return (TYPE_REGISTRY[type] || []).filter(c => EDITABLE_COMPONENTS.has(c));
}

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
