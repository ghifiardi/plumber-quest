// src/ecs/entity.js
// An entity is a plain object: stable id, a type tag (used by the view/renderer),
// and namespaced component bags under `c` (presence check: 'name' in e.c).
export function makeEntity(id, type, components = {}) {
  return { id, type, c: { ...components } };
}
