// src/ecs/systems/trigger.js
// Overlap triggers: checkpoint (one-shot, stores a respawn transform) and finish
// (one-shot via the world.levelClear guard). Player-vs-trigger AABB overlap.
import { overlap } from '../../engine/aabb.js';

export function triggerSystem(world) {
  const player = world.entities.find(e => e.type === 'player');
  if (!player) return;
  const pb = player.c.transform;
  for (const e of world.entities) {
    const tr = e.c.trigger; if (!tr) continue;
    const t = e.c.transform;
    if (!overlap(pb, t)) continue;
    if (tr.tag === 'checkpoint') {
      if (tr.fired) continue;
      tr.fired = true;
      world.checkpoint = { x: tr.spawnX ?? t.x, y: tr.spawnY ?? t.y };
      world.emit({ type: 'checkpoint', x: t.x, y: t.y });
    } else if (tr.tag === 'finish') {
      if (world.levelClear) continue;
      world.levelClear = true;
      world.emit({ type: 'flag-reached' });
    }
  }
}
