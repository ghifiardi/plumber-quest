// src/ecs/systems/lifetime.js
// Cull out-of-bounds entities, then flush spawn/remove queues — the ONE structural
// mutation point per tick. Player is never culled (drives the 'fell' status instead).
export function lifetimeSystem(world, dt) {
  for (const e of world.entities) {
    if (e.type === 'player') continue;
    const t = e.c.transform;
    if (t && t.y > world.bounds.bottom + 64) world.remove(e);
  }
  if (world._removeQ.length) {
    const drop = new Set(world._removeQ);
    world.entities = world.entities.filter(e => !drop.has(e));
    world._removeQ.length = 0;
  }
  if (world._spawnQ.length) { world.entities.push(...world._spawnQ); world._spawnQ.length = 0; }
}
