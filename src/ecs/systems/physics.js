// src/ecs/systems/physics.js
// Gravity only. Integration + tile resolution happen in collision (via resolveAgainstTiles).
import { GRAVITY, MAX_FALL } from '../../engine/constants.js';

export function physicsSystem(world, dt) {
  for (const e of world.entities) {
    const b = e.c.body; if (!b || !b.gravity) continue;
    b.onGround = false; b.support = null;   // both re-derived by collision this tick
    if (b.invuln > 0) b.invuln = Math.max(0, b.invuln - dt);
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
  }
}
