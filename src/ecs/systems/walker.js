// src/ecs/systems/walker.js
// Enemy patrol: set body.vx from walker.dir*speed; flip dir at a wall ahead or a ledge
// ahead. Deterministic tile probes only — no RNG/time. Runs between movement and physics.
import { makeSolid } from '../../engine/tile-collision.js';
import { TILE } from '../../engine/constants.js';

export function walkerSystem(world) {
  const solid = world._solid || (world._solid = makeSolid(world.tiles));
  for (const e of world.entities) {
    const wk = e.c.walker, b = e.c.body, t = e.c.transform;
    if (!wk || !b) continue;
    // probe just ahead of the leading edge, at body mid-height and just below the feet
    const aheadX = wk.dir > 0 ? t.x + t.w + 1 : t.x - 1;
    const col = Math.floor(aheadX / TILE);
    const midRow = Math.floor((t.y + t.h / 2) / TILE);
    const belowRow = Math.floor((t.y + t.h + 2) / TILE);
    const wallAhead = solid(col, midRow);
    const groundAhead = solid(col, belowRow);
    if (wallAhead || (!groundAhead && b.onGround)) wk.dir = -wk.dir;
    b.vx = wk.dir * wk.speed;
  }
}
