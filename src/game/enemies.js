import { resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt } from './tiles.js';

const GOOMBA_SPEED = 40;

export function spawnGoomba(x, y) {
  return {
    type: 'goomba', x, y, w: 14, h: 14, vx: -GOOMBA_SPEED, vy: 0,
    prevX: x, prevY: y, alive: true, squashT: 0,
    update(world, dt) {
      if (this.squashT > 0) { this.squashT -= dt; if (this.squashT <= 0) world.remove(this); return; }
      this.vy = Math.min(600, this.vy + 1400 * dt);
      const solid = (c, r) => solidAt(world.tiles, c, r);
      const facts = resolveAgainstTiles(this, solid, 16, dt);
      if (facts.sideBlocked) this.vx = -this.vx;        // turn at walls
      // turn at ledges: if no ground ahead while grounded
      if (facts.landedOnTop) {
        const aheadCol = Math.floor((this.x + (this.vx > 0 ? this.w + 1 : -1)) / 16);
        const belowRow = Math.floor((this.y + this.h + 1) / 16);
        if (!solid(aheadCol, belowRow)) this.vx = -this.vx;
      }
    },
    stomp(world) { this.alive = false; this.vx = 0; this.squashT = 0.25; world.emit({ type:'enemy-stomped' }); },
  };
}
