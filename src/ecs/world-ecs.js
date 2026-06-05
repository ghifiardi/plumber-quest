// src/ecs/world-ecs.js  (minimal; step() + facade methods added in a later task)
import { TILE } from '../engine/constants.js';

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
  }
  add(entity) { this.entities.push(entity); return entity; }
  spawn(entity) { this._spawnQ.push(entity); }
  remove(entity) { this._removeQ.push(entity); }
  nextId() { return this._nextId++; }
  emit(ev) { this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }
}
