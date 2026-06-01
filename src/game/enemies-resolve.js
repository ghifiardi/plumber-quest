import { overlap } from '../engine/aabb.js';

const STOMP_SCORE = 100;
const SHELL_KILL_SCORE = 200;

function killEnemy(w, e, x, y, score) {
  if (e.type === 'goomba' && e.stomp) e.stomp(w);   // squash + remove via its own timer
  else { e.alive = false; w.remove(e); }            // walking koopa knocked out by a shell
  w.addScore(score); w.popup(score, x, y); w.emit({ type: 'enemy-stomped' });
}

// Resolves: (1) sliding shells knocking out other enemies, then (2) player vs enemies.
export function resolveEnemies(w) {
  const p = w.player;

  // (1) sliding koopa shells plow through other grounded enemies
  for (const s of w.entities) {
    if (s.type !== 'koopa' || s.mode !== 'sliding' || !s.alive) continue;
    for (const e of w.entities) {
      if (e === s || !e.alive) continue;
      const target = e.type === 'goomba' || (e.type === 'koopa' && e.mode === 'walk');
      if (target && overlap(s, e)) { killEnemy(w, e, e.x, e.y, SHELL_KILL_SCORE); w.addShake(2); }
    }
  }

  // (2) player vs enemies
  for (const e of w.entities) {
    if (!e.alive) continue;
    if (!overlap(p, e)) continue;
    const cameFromAbove = p.vy > 0 && (p.prevY + p.h) <= e.y + 4;

    if (e.type === 'goomba') {
      if (e.squashT > 0) continue;                  // already squashed this frame
      if (cameFromAbove) {
        e.stomp(w); w.addScore(STOMP_SCORE); p.vy = -240;
        w.popup(STOMP_SCORE, e.x, e.y); w.addShake(3);
      } else { damagePlayer(w); if (w.playerDied) break; }

    } else if (e.type === 'koopa') {
      if (e.mode === 'walk') {
        if (cameFromAbove) {
          e.toShell(); p.vy = -240; w.addScore(STOMP_SCORE);
          w.popup(STOMP_SCORE, e.x, e.y); w.addShake(3); w.emit({ type: 'enemy-stomped' });
        } else { damagePlayer(w); if (w.playerDied) break; }
      } else if (e.mode === 'shell') {              // idle shell: any touch kicks it away
        e.kick(p.x); w.emit({ type: 'enemy-stomped' });
        if (cameFromAbove) p.vy = -240;
      } else {                                      // sliding shell
        if (cameFromAbove) { e.toShell(); p.vy = -240; }   // stomp to stop it
        else if (e.kickGrace <= 0) { damagePlayer(w); if (w.playerDied) break; }
      }
    }
  }
}

// Power step-down with brief invulnerability; death only when already small.
export function damagePlayer(w) {
  const p = w.player;
  if (p.invuln > 0) return;
  if (p.power === 'fire') { p.power = 'big'; p.invuln = 1.2; w.emit({ type: 'player-hit' }); w.addShake(3); }
  else if (p.power === 'big') { p.power = 'small'; p.invuln = 1.2; w.emit({ type: 'player-hit' }); w.addShake(3); }
  else { w.playerDied = true; w.emit({ type: 'player-died' }); w.addShake(5); }
}
