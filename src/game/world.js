import { LEVEL_TIME } from '../engine/constants.js';
import { resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt, bumpTile } from './tiles.js';
import { createPlayer, controlPlayer } from './player.js';
import { makeMushroom, makeFlower, resolvePickups } from './pickups.js';
import { resolveEnemies } from './enemies-resolve.js';
import { tryFire, resolveProjectiles } from './projectiles.js';

const COIN_SCORE = 200;

export function createWorld(level, { time = LEVEL_TIME, session = null } = {}) {
  const w = {
    level, tiles: level.tiles, bounds: level.bounds,
    player: createPlayer(level.playerSpawn),
    entities: [], events: [],
    session: session || { score: 0, coins: 0, lives: 3, levelIndex: 0 },
    timeRemaining: time, timeUp: false, fell: false, flagReached: false, playerDied: false,
    peakRise: 0,                          // jump tests: max height risen from spawn
    _spawnQ: [], _removeQ: [],
  };
  w.player.fireballs = 0;
  const baselineY = level.playerSpawn.y;

  w.spawn  = (e) => { w._spawnQ.push(e); };
  w.remove = (e) => { w._removeQ.push(e); };
  // simulation-owned scoring (mutated BEFORE events are emitted — spec §6)
  w.addScore = (n) => { w.session.score += n; };
  w.addCoin  = () => { w.session.coins += 1; w.session.score += COIN_SCORE; };
  // pickup factory injection keeps tiles.js decoupled from pickups.js
  w.spawnPickup = (kind, x, y) => { w.spawn(kind === 'mushroom' ? makeMushroom(x, y) : makeFlower(x, y)); };
  // events accumulate across all fixed steps; drained once per rendered frame
  w.emit = (ev) => { w.events.push(ev); };
  w.drainEvents = () => { const e = w.events; w.events = []; return e; };

  // scripted (non-physics) animation driven by game-state during dying / level-clear.
  w._anim = null;
  w.beginDeathAnim = () => { w._anim = 'death'; w.player.vy = -300; };   // death "pop"
  w.beginClearAnim = () => { w._anim = 'clear'; };
  w.updateScripted = (dt) => {
    if (w._anim === 'death') {
      w.player.prevY = w.player.y;
      w.player.vy = Math.min(600, w.player.vy + 1400 * dt);
      w.player.y += w.player.vy * dt;                 // hop then fall
    } else if (w._anim === 'clear') {
      w.player.prevX = w.player.x;
      w.player.x += 40 * dt;                          // stroll past the flag
    }
  };

  const solid = (c, r) => solidAt(w.tiles, c, r);

  w.update = (dt, intent) => {
    // NOTE: events are NOT cleared here. They accumulate across every fixed step of a
    // rendered frame and are removed only via drainEvents() (called once per frame).

    // snapshot prev transforms for interpolation
    w.player.prevX = w.player.x; w.player.prevY = w.player.y;
    for (const e of w.entities) { e.prevX = e.x; e.prevY = e.y; }

    // timer
    w.timeRemaining -= dt;
    if (w.timeRemaining <= 0) { w.timeRemaining = 0; w.timeUp = true; }

    // === stage 1: tiles (player vs tilemap) ===
    controlPlayer(w.player, intent, dt);
    if (w.player.jumped) { w.player.jumped = false; w.emit({ type: 'jump' }); }  // real jump (incl. coyote/buffer)
    tryFire(w, intent);                                  // spawn fireball on firePressed (Task 10)
    const facts = resolveAgainstTiles(w.player, solid, 16, dt);
    w.player.onGround = facts.landedOnTop;
    if (facts.hitFromBelow) for (const t of facts.tilesHitBelow) bumpTile(w, t.col, t.row);
    w.peakRise = Math.max(w.peakRise, baselineY - w.player.y);
    if (w.player.y > w.bounds.bottom) w.fell = true;

    // entity self-updates
    for (const e of w.entities) if (e.update) e.update(w, dt);

    // === ordered interaction pass (spec §4): pickups -> enemies -> projectiles -> finish ===
    resolvePickups(w);
    resolveEnemies(w);
    resolveProjectiles(w);
    resolveFinish(w);

    // lifecycle flush: dedupe removals (so onRemove runs once even if removal was
    // requested twice), run onRemove hooks, remove, THEN add (new entities update next step)
    if (w._removeQ.length) {
      const unique = [...new Set(w._removeQ)];
      for (const e of unique) if (e.onRemove) e.onRemove(w);
      w.entities = w.entities.filter(e => !unique.includes(e));
      w._removeQ.length = 0;
    }
    if (w._spawnQ.length) { w.entities.push(...w._spawnQ); w._spawnQ.length = 0; }
  };

  function resolveFinish(world) {
    if (world.flagReached) return;
    const f = world.level.finish, p = world.player;
    if (p.x + p.w > f.x && p.x < f.x + 16 && p.y + p.h > f.y && p.y < world.bounds.bottom) {
      world.flagReached = true; world.emit({ type: 'flag-reached' });
    }
  }

  return w;
}
