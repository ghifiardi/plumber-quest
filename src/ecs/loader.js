// src/ecs/loader.js
import { EcsWorld } from './world-ecs.js';
import { makeEntity } from './entity.js';
import { instantiate, TYPE_REGISTRY } from './components.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// Bags that may appear inline on an entity but are NOT components.
const NON_COMPONENT_KEYS = new Set(['type', 'x', 'y', 'editor', 'meta']);

function deepMerge(target, patch) {
  for (const k of Object.keys(patch)) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])
        && target[k] && typeof target[k] === 'object') {
      deepMerge(target[k], patch[k]);
    } else {
      target[k] = patch[k];
    }
  }
  return target;
}

export function definitionToWorld(def) {
  if (!def || typeof def !== 'object') throw new Error('loader: definition must be an object');
  const { meta, tiles, entities } = def;

  // --- meta ---
  if (!meta || typeof meta.name !== 'string') throw new Error('loader: meta.name (string) required');
  if (!isNum(meta.w) || !isNum(meta.h)) throw new Error('loader: meta.w and meta.h (numbers) required');

  // --- tiles (rectangular h x w of {tile} cells) ---
  if (!Array.isArray(tiles) || tiles.length !== meta.h) throw new Error('loader: tiles must have meta.h rows');
  for (const row of tiles) {
    if (!Array.isArray(row) || row.length !== meta.w) throw new Error('loader: tiles must be rectangular (meta.w cols)');
  }

  // --- entities ---
  if (!Array.isArray(entities)) throw new Error('loader: entities array required');
  const world = new EcsWorld({ tiles, meta });
  let players = 0;

  for (const def1 of entities) {
    const type = def1.type;
    if (!TYPE_REGISTRY[type]) throw new Error(`loader: unknown entity type: ${type}`);
    if (!isNum(def1.x) || !isNum(def1.y)) throw new Error(`loader: entity ${type} needs finite x,y`);
    if (type === 'player') players++;

    const { c } = instantiate(type);
    // position
    c.transform.x = def1.x; c.transform.y = def1.y;
    c.transform.prevX = def1.x; c.transform.prevY = def1.y;

    // inline component overrides (reject unknown keys; allow editor/meta)
    for (const key of Object.keys(def1)) {
      if (NON_COMPONENT_KEYS.has(key)) continue;
      if (!(key in c)) throw new Error(`loader: unknown component key '${key}' on ${type}`);
      deepMerge(c[key], def1[key]);
    }

    // mover origin defaults to spawn position if not given
    if (c.mover && (c.mover.origin.x === 0 && c.mover.origin.y === 0)) {
      c.mover.origin = { x: def1.x, y: def1.y };
    }

    world.add(makeEntity(world.nextId(), type, c));
  }

  if (players !== 1) throw new Error(`loader: exactly one player required (got ${players})`);
  return world;
}
