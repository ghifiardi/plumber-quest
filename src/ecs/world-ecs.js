// src/ecs/world-ecs.js  (minimal; step() + facade methods added in a later task)
import { TILE } from '../engine/constants.js';
import { SYSTEM_ORDER } from './systems/index.js';
import { ecsWorldToRenderView } from './view.js';

export class EcsWorld {
  constructor({ tiles, meta }) {
    this.tiles = tiles;
    this.meta = meta;
    this.bounds = { left: 0, top: 0, right: meta.w * TILE, bottom: meta.h * TILE };
    this.entities = [];
    this.events = [];
    this._spawnQ = [];
    this._removeQ = [];
    this._nextId = 0;          // reset to 0 per load (this is a fresh world)
    this.timeRemaining = 0;    // facade field; unused by demo-1 (no level-clear)
    this.animClock = 0;        // advanced each tick; read by the renderer via the view
    this.checkpoint = null;    // { x, y } respawn transform set by a checkpoint trigger
    this.playerDied = false;   // set by hazard collision (Task 9), cleared on respawn
    this.levelClear = false;   // set by the finish trigger
  }
  add(entity) { this.entities.push(entity); return entity; }
  spawn(entity) { this._spawnQ.push(entity); }
  remove(entity) { this._removeQ.push(entity); }
  nextId() { return this._nextId++; }
  emit(ev) { this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  // --- Sim facade (see src/sim/sim.js) ---
  update(dt, intent) { stepWorld(this, dt, intent); }

  getStatus() {
    const p = this._player();
    const fell = !!p && p.c.transform.y > this.bounds.bottom;
    return { timeUp: false, fell, playerDied: this.playerDied, levelClear: this.levelClear };
  }
  beginScripted(_state) { /* no scripted death/clear art in ECS this cycle */ }
  updateScripted(_dt) { /* no-op this cycle */ }

  getCameraTarget() {
    const p = this._player();
    if (!p) return { x: 0, y: 0, w: 16, h: 16, facing: 1 };   // player is never culled today; guard the invariant
    const t = p.c.transform;
    return { x: t.x, y: t.y, w: t.w, h: t.h, facing: (p.c.control && p.c.control.facing) || 1 };
  }
  getBounds() { return this.bounds; }
  getRenderView() { return ecsWorldToRenderView(this); }

  _player() { return this.entities.find(e => e.type === 'player'); }
}

// Advance the world one fixed tick. Returns the events emitted THIS tick (for tests).
// Snapshots prevX/prevY first (renderer interpolation), runs systems in order.
export function stepWorld(world, dt, intent) {
  world.animClock += dt;                  // single animation clock (renderer reads via the view)
  for (const e of world.entities) {
    const t = e.c.transform; if (t) { t.prevX = t.x; t.prevY = t.y; }
  }
  const before = world.events.length;
  for (const [, fn] of SYSTEM_ORDER) fn(world, dt, intent);
  return world.events.slice(before);
}
