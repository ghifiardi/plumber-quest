import { resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt } from './tiles.js';

const GOOMBA_SPEED = 40;
const KOOPA_SPEED = 34;
const SHELL_SPEED = 168;

// Shared ground patrol: gravity + turn at walls; (optionally) turn at ledges.
// NOTE: resolveAgainstTiles zeroes vx on a side hit, so capture the intended
// direction + speed BEFORE resolving and reconstruct the reversed velocity from them
// (otherwise `-vx` would be `-0 = 0` and the enemy would freeze against the wall).
function patrol(self, world, dt, turnAtLedges) {
  self.vy = Math.min(600, self.vy + 1400 * dt);
  const dir = Math.sign(self.vx) || 1;
  const speed = Math.abs(self.vx);
  const solid = (c, r) => solidAt(world.tiles, c, r);
  const facts = resolveAgainstTiles(self, solid, 16, dt);
  if (facts.sideBlocked) self.vx = -dir * speed;        // turn at walls / bounce shells
  else if (turnAtLedges && facts.landedOnTop && speed > 0) {
    const aheadCol = Math.floor((self.x + (dir > 0 ? self.w + 1 : -1)) / 16);
    const belowRow = Math.floor((self.y + self.h + 1) / 16);
    if (!solid(aheadCol, belowRow)) self.vx = -dir * speed;
  }
  return facts;
}

export function spawnGoomba(x, y, speed = GOOMBA_SPEED) {
  return {
    type: 'goomba', x, y, w: 14, h: 14, vx: -speed, vy: 0,
    prevX: x, prevY: y, alive: true, squashT: 0,
    update(world, dt) {
      if (this.squashT > 0) { this.squashT -= dt; if (this.squashT <= 0) world.remove(this); return; }
      patrol(this, world, dt, true);
    },
    stomp(world) { this.alive = false; this.vx = 0; this.squashT = 0.25; world.emit({ type:'enemy-stomped', x: this.x, y: this.y }); },
  };
}

// Koopa: walks; stomp -> idle shell; touch idle shell -> kicked sliding shell that
// knocks out other enemies and bounces off walls; stomp a sliding shell -> idle again.
export function spawnKoopa(x, y, speed = KOOPA_SPEED) {
  return {
    type: 'koopa', x, y, w: 14, h: 16, vx: -speed, vy: 0,
    prevX: x, prevY: y, alive: true, mode: 'walk', walkSpeed: speed, kickGrace: 0,
    update(world, dt) {
      if (this.kickGrace > 0) this.kickGrace = Math.max(0, this.kickGrace - dt);
      if (this.mode === 'shell') this.vx = 0;            // idle shell holds still
      patrol(this, world, dt, this.mode === 'walk');     // shells fall off ledges; walkers turn
    },
    toShell() { this.mode = 'shell'; this.vx = 0; this.kickGrace = 0; },   // stomp result
    kick(fromX) { const dir = (this.x >= fromX) ? 1 : -1; this.mode = 'sliding'; this.vx = dir * SHELL_SPEED; this.kickGrace = 0.12; },
  };
}
