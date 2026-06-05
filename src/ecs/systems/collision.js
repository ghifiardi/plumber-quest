// src/ecs/systems/collision.js
// Integrates body entities against the solid tilemap (resolveAgainstTiles does both axes),
// then rests entities on top of solid movers (sets body.standingOn for next-tick carry).
import { resolveAgainstTiles, overlap } from '../../engine/aabb.js';
import { makeSolid } from '../../engine/tile-collision.js';
import { TILE } from '../../engine/constants.js';

// Describe the solid surface an entity offers (or null). Movers carry; conveyors push.
function surfaceOf(p) {
  if (p.c.mover && p.c.mover.solid) {
    const m = p.c.mover;
    return { entityId: p.id, kind: 'mover', deltaX: m.delta.x, deltaY: m.delta.y, pushX: 0, bounceV: 0 };
  }
  if (p.c.conveyor && p.c.conveyor.solid) {
    return { entityId: p.id, kind: 'conveyor', deltaX: 0, deltaY: 0, pushX: p.c.conveyor.pushX, bounceV: 0 };
  }
  return null;
}

export function collisionSystem(world, dt) {
  // INVARIANT: tiles are immutable after load, so the solid() lookup is cached once.
  // If a future cycle (Track B/C) mutates world.tiles (breakable bricks, etc.), this
  // cache must be invalidated (clear world._solid) when tiles change.
  const solid = world._solid || (world._solid = makeSolid(world.tiles));

  for (const e of world.entities) {
    const { body: b, transform: t } = e.c;
    if (!b) continue;
    const box = { x: t.x, y: t.y, w: t.w, h: t.h, vx: b.vx, vy: b.vy };
    const facts = resolveAgainstTiles(box, solid, TILE, dt);
    t.x = box.x; t.y = box.y; b.vx = box.vx; b.vy = box.vy;
    if (facts.landedOnTop) b.onGround = true;
  }

  // rest body-entities on the FIRST solid surface they contact (records body.support).
  // kind:'mover' carries the rider next tick; conveyors/bouncers extend this in later tasks.
  for (const e of world.entities) {
    const { body: b, transform: t } = e.c;
    if (!b) continue;
    for (const p of world.entities) {
      const surf = surfaceOf(p); if (!surf) continue;
      const pt = p.c.transform;
      const feet = { x: t.x, y: t.y, w: t.w, h: t.h };
      const top  = { x: pt.x, y: pt.y - 1, w: pt.w, h: 2 };
      const horizontallyOver = t.x + t.w > pt.x && t.x < pt.x + pt.w;
      const fallingOnto = b.vy >= 0 && (t.y + t.h) >= pt.y - 1 && (t.y + t.h) <= pt.y + 6;
      if (horizontallyOver && fallingOnto) {
        t.y = pt.y - t.h; b.vy = 0; b.onGround = true; b.support = surf; break;
      } else if (overlap(feet, top)) {
        b.onGround = true; b.support = surf; break;
      }
    }
  }
}
