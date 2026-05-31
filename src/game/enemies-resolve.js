import { overlap } from '../engine/aabb.js';

const STOMP_SCORE = 100;

// Player vs goombas. Stomp (came from above) kills + bounces; otherwise damages player.
export function resolveEnemies(w) {
  const p = w.player;
  for (const e of w.entities) {
    if (e.type !== 'goomba' || !e.alive) continue;
    if (!overlap(p, e)) continue;
    const cameFromAbove = p.vy > 0 && (p.prevY + p.h) <= e.y + 4;
    if (cameFromAbove) { e.stomp(w); w.addScore(STOMP_SCORE); p.vy = -240; }   // consequence then event in stomp()
    else { damagePlayer(w); if (w.playerDied) break; }   // stop after death: no duplicate player-died this frame
  }
}

// Power step-down with brief invulnerability; death only when already small.
export function damagePlayer(w) {
  const p = w.player;
  if (p.invuln > 0) return;
  if (p.power === 'fire') { p.power = 'big'; p.invuln = 1.2; w.emit({ type: 'player-hit' }); }
  else if (p.power === 'big') { p.power = 'small'; p.invuln = 1.2; w.emit({ type: 'player-hit' }); }
  else { w.playerDied = true; w.emit({ type: 'player-died' }); }
}
