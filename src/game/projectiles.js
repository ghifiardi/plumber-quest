import { overlap, resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt } from './tiles.js';
import { FIREBALL_SPEED, MAX_FIREBALLS } from '../engine/constants.js';

const STOMP_SCORE = 100;

export function makeFireball(x, y, dir) {
  return {
    type:'fireball', x, y, w:8, h:8, vx: dir*FIREBALL_SPEED, vy:0,
    prevX:x, prevY:y, alive:true, life: 2.5,
    update(world, dt) {
      this.life -= dt;
      this.vy = Math.min(400, this.vy + 1200*dt);
      const solid=(c,r)=>solidAt(world.tiles,c,r);
      const f = resolveAgainstTiles(this, solid, 16, dt);
      if (f.landedOnTop) this.vy = -180;          // bounce along ground
      if (f.sideBlocked || this.life <= 0) this._expire(world);
    },
    _expire(world) { if (this.alive) { this.alive = false; world.remove(this); } },
    // The ONLY place the active count is decremented — the lifecycle removal path.
    // _expire's `alive` guard ensures a fireball is queued for removal once, so this runs once.
    onRemove(world) { world.player.fireballs = Math.max(0, world.player.fireballs - 1); },
  };
}

// Spawn from player on firePressed. Increments the active count at spawn time; the cap
// is checked against player.fireballs (kept correct by increment-on-spawn / onRemove-decrement).
export function tryFire(world, intent) {
  const p = world.player;
  if (!intent.firePressed || p.power !== 'fire') return;
  if (p.fireballs >= MAX_FIREBALLS) return;
  p.fireballs += 1;
  world.spawn(makeFireball(p.x + (p.facing > 0 ? p.w : -8), p.y + 4, p.facing || 1));
  world.emit({ type: 'fireball-fired' });
}

// Projectiles stage: fireball vs enemies. Does NOT touch the active count (no recalculation).
export function resolveProjectiles(w) {
  for (const fb of w.entities) {
    if (fb.type !== 'fireball' || !fb.alive) continue;
    for (const e of w.entities) {
      if (e.type === 'goomba' && e.alive && overlap(fb, e)) {
        e.stomp(w); w.addScore(STOMP_SCORE); fb._expire(w);
        break;
      }
    }
  }
}
