// src/fx/effects.js
// Event-driven cosmetic particle system. NOT part of the deterministic sim,
// so Math.random is allowed (rng injectable for tests). Consumes drained game
// events (with additive x,y) and exposes a read-only particle list + flash.
export const FX_FOR = {
  'coin-collected': 'sparkle', 'enemy-stomped': 'stars', 'brick-broken': 'debris',
  'powerup-collected': 'sparkle', 'jump': 'dust', 'player-hit': 'shards',
};
export const FX_COUNT = { sparkle: 5, stars: 6, debris: 4, dust: 3, shards: 4 };
const FLASH_EVENTS = { 'enemy-stomped': 1, 'brick-broken': 1, 'player-hit': 1 };

// per-kind: [color, ttl, speed, gravity, size]
const KIND = {
  sparkle: ['#ffd23f', 0.45, 40, -30, 2],
  stars:   ['#ffffff', 0.5,  70, 140, 2],
  debris:  ['#a3261c', 0.6,  60, 260, 3],
  dust:    ['#d6c8b4', 0.35, 30, 20,  2],
  shards:  ['#ff5a4d', 0.5,  80, 120, 2],
};

export function createEffects({ rng = Math.random, max = 120 } = {}) {
  let parts = [];
  let flashV = 0;

  function spawn(kind, x, y) {
    const [color, ttl, speed, gravity, size] = KIND[kind];
    const n = FX_COUNT[kind];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (rng() - 0.5);
      const sp = speed * (0.5 + rng());
      parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - speed * 0.4,
        gravity, life: ttl, ttl, color, size });
    }
    if (parts.length > max) parts.splice(0, parts.length - max);   // drop oldest
  }

  function handle(ev) {
    if (FLASH_EVENTS[ev.type]) flashV = Math.max(flashV, 0.7);
    const kind = FX_FOR[ev.type];
    if (!kind || ev.x == null || ev.y == null) return;
    spawn(kind, ev.x, ev.y);
  }

  function tick(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    flashV = Math.max(0, flashV - dt * 3.5);
  }

  return {
    handle, spawn, tick,
    list: () => parts,
    flash: () => flashV,
    clear: () => { parts = []; flashV = 0; },
  };
}
