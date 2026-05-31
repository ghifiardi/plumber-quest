import { overlap, resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt } from './tiles.js';

const MUSH_SPEED = 50;
const POWERUP_SCORE = 1000;

function physicsItem(extra) {
  return {
    x:0,y:0,w:14,h:14,vx:0,vy:0,prevX:0,prevY:0,alive:true, ...extra,
    update(world, dt) {
      if (this.static) return;
      this.vy = Math.min(600, this.vy + 1400*dt);
      const solid = (c,r)=>solidAt(world.tiles,c,r);
      const f = resolveAgainstTiles(this, solid, 16, dt);
      if (f.sideBlocked) this.vx = -this.vx;
    },
  };
}

export function makeMushroom(x,y){ return physicsItem({ type:'mushroom', x, y, vx:MUSH_SPEED }); }
export function makeFlower(x,y){ return physicsItem({ type:'flower', x, y, static:true }); }
export function makeCoinPickup(x,y){ return physicsItem({ type:'coin-pickup', x, y, static:true, w:10, h:14 }); }

// Pickups stage of the ordered pass — runs BEFORE enemies/projectiles (spec §4, §10.9).
// Handles (a) authored coin TILES the player overlaps and (b) item ENTITIES.
// Mutates session counters FIRST, then emits events.
export function resolvePickups(w) {
  const p = w.player;

  // (a) coin tiles under the player's AABB
  const c0 = Math.floor(p.x / 16), c1 = Math.floor((p.x + p.w - 1) / 16);
  const r0 = Math.floor(p.y / 16), r1 = Math.floor((p.y + p.h - 1) / 16);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (r < 0 || r >= w.tiles.length || c < 0 || c >= w.tiles[0].length) continue;
    if (w.tiles[r][c].tile === 'coin') {
      w.tiles[r][c] = { tile: 'empty' };
      w.addCoin();
      w.emit({ type: 'coin-collected' });
    }
  }

  // (b) item entities
  for (const it of w.entities) {
    if (!it.alive) continue;
    if (it.type !== 'mushroom' && it.type !== 'flower' && it.type !== 'coin-pickup') continue;
    if (!overlap(p, it)) continue;
    if (it.type === 'coin-pickup') {
      w.addCoin(); w.emit({ type:'coin-collected' });
    } else if (it.type === 'mushroom') {
      if (p.power === 'small') p.power = 'big';
      w.addScore(POWERUP_SCORE); w.emit({ type:'powerup-collected', kind:'mushroom' });
    } else { // flower
      p.power = (p.power === 'small') ? 'big' : 'fire';
      w.addScore(POWERUP_SCORE); w.emit({ type:'powerup-collected', kind:'flower' });
    }
    it.alive = false; w.remove(it);
  }
}
