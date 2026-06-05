// src/ecs/systems/physics.js
// Gravity only. Integration + tile resolution happen in collision (via resolveAgainstTiles).
import { GRAVITY, MAX_FALL } from '../../engine/constants.js';

export function physicsSystem(world, dt) {
  for (const e of world.entities) {
    const b = e.c.body; if (!b || !b.gravity) continue;
    b.onGround = false;   // re-derived by collision this tick
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
  }
}
