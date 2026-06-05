// src/ecs/components.js
import {
  RUN_ACCEL, RUN_MAX, RUN_MAX_FAST, JUMP_VELOCITY, JUMP_CUT, COYOTE, JUMP_BUFFER,
} from '../engine/constants.js';

const clone = (v) => JSON.parse(JSON.stringify(v));   // templates are plain JSON-safe data

// Component templates (default values). Per-entity instances are deep clones.
const TEMPLATES = {
  transform: { x: 0, y: 0, w: 16, h: 16, prevX: 0, prevY: 0 },
  body:      { vx: 0, vy: 0, onGround: false, gravity: true, standingOn: null },
  control:   { accel: RUN_ACCEL, maxVx: RUN_MAX, maxVxRun: RUN_MAX_FAST, facing: 1 },
  jump:      { jumpV: JUMP_VELOCITY, jumpCut: JUMP_CUT, coyoteMax: COYOTE, bufferMax: JUMP_BUFFER,
               coyote: 0, buffer: 0, heldPrev: false, jumped: false },
  mover:     { axis: 'x', dist: 48, speed: 30, origin: { x: 0, y: 0 }, pos: 0, dir: 1,
               solid: true, delta: { x: 0, y: 0 } },
  sprite:    { id: 'hero', anim: 'stand', facing: 1 },
};

// type -> which components that entity gets.
export const TYPE_REGISTRY = {
  player:   ['transform', 'body', 'control', 'jump', 'sprite'],
  platform: ['transform', 'mover', 'sprite'],
};

// Build a fresh { c:{...} } component bag for a type (deep-cloned). Throws on unknown type.
export function instantiate(type) {
  const list = TYPE_REGISTRY[type];
  if (!list) throw new Error(`unknown entity type: ${type}`);
  const c = {};
  for (const name of list) c[name] = clone(TEMPLATES[name]);
  if (type === 'platform') c.sprite.id = 'platform';
  return { c };
}
