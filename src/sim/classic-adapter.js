// src/sim/classic-adapter.js
// Builds the classic sim from level rows and wraps it in the facade. The classic build
// logic is moved verbatim from main.js's old worldFactory (parse + createWorld + enemies),
// so behavior — and the golden-master fingerprint — is byte-identical.
import { createWorld } from '../game/world.js';
import { parseLevel } from '../levels/level-format.js';
import { spawnGoomba, spawnKoopa } from '../game/enemies.js';
import { LEVEL_TIME, DIFFICULTIES, GOOMBA_SPEED, KOOPA_SPEED } from '../engine/constants.js';
import { STATES } from '../game/game-state.js';

function buildClassicWorld(rows, { levelIndex, session, difficulty }) {
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const time = Math.max(150, Math.round((LEVEL_TIME - levelIndex * 18) * diff.timeScale));
  const espeed = diff.enemyScale * (1 + levelIndex * 0.08);
  const lvl = parseLevel(rows, { tile: 16 });
  const w = createWorld(lvl, { session, time });
  for (const s of lvl.entitySpawns) {
    if (s.type === 'goomba') w.entities.push(spawnGoomba(s.x, s.y, GOOMBA_SPEED * espeed));
    else if (s.type === 'koopa') w.entities.push(spawnKoopa(s.x, s.y, KOOPA_SPEED * espeed));
  }
  return w;
}

export function makeClassicSim(rows, ctx) {
  const world = buildClassicWorld(rows, ctx);
  return {
    update: (dt, intent) => world.update(dt, intent),
    drainEvents: () => world.drainEvents(),
    getStatus: () => ({
      timeUp: world.timeUp, fell: world.fell,
      playerDied: world.playerDied, levelClear: world.flagReached,
    }),
    beginScripted: (state) => {
      if (state === STATES.dying) world.beginDeathAnim();
      else if (state === STATES.levelClear) world.beginClearAnim();
    },
    updateScripted: (dt) => world.updateScripted(dt),
    getCameraTarget: () => ({
      x: world.player.x, y: world.player.y, w: world.player.w, h: world.player.h, facing: world.player.facing,
    }),
    getBounds: () => world.bounds,
    getRenderView: () => world,
    canRespawnInPlace: () => false,
    respawn: () => {},
    get timeRemaining() { return world.timeRemaining; },
    set timeRemaining(v) { world.timeRemaining = v; },
  };
}
