import { LEVEL_TIME } from '../engine/constants.js';
import { resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt, bumpTile } from './tiles.js';
import { createPlayer, controlPlayer } from './player.js';
import { makeMushroom, makeFlower, resolvePickups } from './pickups.js';
import { resolveEnemies } from './enemies-resolve.js';
import { tryFire, resolveProjectiles } from './projectiles.js';

const COIN_SCORE = 200;

// Flagpole grab bonus: the higher up the pole you touch (frac 1 = top), the more points.
const FLAG_TIERS = [[0.9, 5000], [0.7, 2000], [0.5, 800], [0.25, 400], [0, 100]];
export function flagBonusForFrac(frac) {
  const f = Math.max(0, Math.min(1, frac));
  for (const [th, v] of FLAG_TIERS) if (f >= th) return v;
  return 100;
}

export function createWorld(level, { time = LEVEL_TIME, session = null } = {}) {
  const w = {
    level, tiles: level.tiles, bounds: level.bounds,
    player: createPlayer(level.playerSpawn),
    entities: [], events: [],
    session: session || { score: 0, coins: 0, lives: 3, levelIndex: 0 },
    timeRemaining: time, timeUp: false, fell: false, flagReached: false, playerDied: false,
    peakRise: 0,                          // jump tests: max height risen from spawn
    animClock: 0,                         // seconds; advanced in update/updateScripted, read by renderer
    popups: [],                           // floating score text {text,x,y,life} — cosmetic, sim-updated
    shake: 0,                             // screen-shake magnitude (px), decays each step
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

  // --- cosmetic juice (sim-owned data; renderer only reads it) ---
  w.popup = (text, x, y) => { w.popups.push({ text: String(text), x, y, life: 0.85 }); };
  w.addShake = (n) => { w.shake = Math.max(w.shake, n); };
  const tickFx = (dt) => {
    if (w.shake > 0) w.shake = Math.max(0, w.shake - 36 * dt);
    if (w.popups.length) {
      for (const p of w.popups) { p.y -= 26 * dt; p.life -= dt; }
      w.popups = w.popups.filter(p => p.life > 0);
    }
  };

  // scripted (non-physics) animation driven by game-state during dying / level-clear.
  w._anim = null;
  w.flagSlide = 0;                        // 0 = flag at top of pole, 1 = slid to the bottom
  w._clearT = 0;
  const FLAG_SLIDE_TIME = 0.7;            // seconds for the flag + hero to ride down
  w.beginDeathAnim = () => { w._anim = 'death'; w.player.vy = -300; };   // death "pop"
  w.beginClearAnim = () => {
    w._anim = 'clear'; w._clearT = 0; w.flagSlide = 0;
    // grab the pole at the top: snap the hero onto it, clinging (facing left)
    w.player.x = w.level.finish.x; w.player.y = w.level.finish.y;
    w.player.vx = 0; w.player.vy = 0; w.player.facing = -1; w.player.onGround = false;
  };
  // hero rests on top of the 2-row ground at the base of the pole
  const clearGroundY = () => w.bounds.bottom - 32 - w.player.h;
  w.updateScripted = (dt) => {
    w.animClock += dt;                    // keep animations alive during scripted states
    tickFx(dt);
    if (w._anim === 'death') {
      w.player.prevY = w.player.y;
      w.player.vy = Math.min(600, w.player.vy + 1400 * dt);
      w.player.y += w.player.vy * dt;                 // hop then fall
    } else if (w._anim === 'clear') {
      w._clearT += dt;
      const groundY = clearGroundY();
      if (w._clearT < FLAG_SLIDE_TIME) {
        const t = w._clearT / FLAG_SLIDE_TIME;        // 0..1: flag + hero ride down together
        w.flagSlide = t;
        w.player.prevY = w.player.y;
        w.player.y = w.level.finish.y + t * (groundY - w.level.finish.y);
      } else {                                        // landed: hop off and stroll right
        w.flagSlide = 1;
        w.player.prevX = w.player.x; w.player.prevY = w.player.y;
        w.player.y = groundY; w.player.facing = 1;
        w.player.x += 40 * dt;
      }
    }
  };

  const solid = (c, r) => solidAt(w.tiles, c, r);

  w.update = (dt, intent) => {
    // NOTE: events are NOT cleared here. They accumulate across every fixed step of a
    // rendered frame and are removed only via drainEvents() (called once per frame).
    w.animClock += dt;                    // single animation clock (renderer reads, never writes)
    tickFx(dt);                           // decay shake + float/expire score popups

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
      world.flagReached = true;
      // bonus by how high on the pole the hero grabbed (1 = top, 0 = ground)
      const poleTop = f.y, poleBottom = world.bounds.bottom - 32;
      const frac = (poleBottom - p.y) / Math.max(1, poleBottom - poleTop);
      const bonus = flagBonusForFrac(frac);
      world.flagBonus = bonus;
      world.addScore(bonus);
      world.popup(bonus, f.x, p.y);                   // show the grab bonus at the pole
      world.emit({ type: 'flag-reached', bonus });
    }
  }

  return w;
}
