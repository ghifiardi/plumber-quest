// src/editor/serialize.js
// The contract seam between the editor's kind-grid model and the loader definition.
// editorModelToDefinition validates editor-model invariants FIRST (fail early), then
// emits the exact { engine:'ecs', meta, tiles:[[{tile}]], entities } shape loader.js consumes.

// compact char <-> tile-kind legend (fixed; unknown chars/kinds throw on conversion)
export const TILE_LEGEND = {
  ' ': 'empty', '#': 'ground', 'B': 'brick', 'U': 'upgrade-block',
  'C': 'coin-block', 'o': 'coin', 'x': 'used-block', 'P': 'pipe', 'p': 'pipe-deco',
};
export const KIND_TO_CHAR = Object.fromEntries(Object.entries(TILE_LEGEND).map(([ch, k]) => [k, ch]));
const KNOWN_KINDS = new Set(Object.values(TILE_LEGEND));
const ALLOWED_ENTITY_KEYS = new Set(['type', 'x', 'y', 'transform', 'mover', 'conveyor', 'bouncer', 'trigger', 'walker', 'editor', 'meta']);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

export function definitionToEditorModel(def) {
  return {
    meta: { name: def.meta.name, w: def.meta.w, h: def.meta.h },
    tiles: def.tiles.map(row => row.map(c => c.tile)),
    entities: def.entities.map(e => clone(e)),
  };
}

export function editorModelToDefinition(model) {
  const { meta, tiles, entities } = model || {};
  if (!meta || typeof meta.name !== 'string' || !isNum(meta.w) || !isNum(meta.h)) throw new Error('editor: meta {name,w,h} required');
  if (!Array.isArray(tiles) || tiles.length !== meta.h) throw new Error('editor: tiles must have meta.h rows');
  for (const row of tiles) {
    if (!Array.isArray(row) || row.length !== meta.w) throw new Error('editor: tiles must be rectangular (meta.w cols)');
    for (const k of row) if (!KNOWN_KINDS.has(k)) throw new Error(`editor: unknown tile kind '${k}'`);
  }
  if (!Array.isArray(entities)) throw new Error('editor: entities array required');
  let players = 0;
  for (const e of entities) {
    if (!isNum(e.x) || !isNum(e.y)) throw new Error(`editor: entity ${e.type} needs finite x,y`);
    if (e.type === 'player') players++;
    for (const key of Object.keys(e)) if (!ALLOWED_ENTITY_KEYS.has(key)) throw new Error(`editor: disallowed entity key '${key}' on ${e.type}`);
  }
  if (players !== 1) throw new Error(`editor: exactly one player required (got ${players})`);
  return {
    engine: 'ecs',
    meta: { name: meta.name, w: meta.w, h: meta.h },
    tiles: tiles.map(row => row.map(k => ({ tile: k }))),
    entities: entities.map(e => clone(e)),
  };
}
