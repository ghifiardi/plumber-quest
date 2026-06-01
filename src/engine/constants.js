export const FIXED_DT = 1 / 60;
export const TILE = 16;
export const GRAVITY = 1400;          // px/s^2
export const MAX_FALL = 600;          // px/s
export const RUN_ACCEL = 1200;        // px/s^2
export const RUN_MAX = 140;           // px/s walk
export const RUN_MAX_FAST = 220;      // px/s with run held
export const FRICTION = 1600;         // px/s^2
export const JUMP_VELOCITY = -380;    // px/s initial jump
export const JUMP_CUT = 0.45;         // multiply vy when jump released early
export const COYOTE = 0.08;           // s
export const JUMP_BUFFER = 0.10;      // s
export const MAX_FIREBALLS = 2;
export const FIREBALL_SPEED = 260;    // px/s
export const LEVEL_TIME = 300;        // game seconds
export const INVULN_TIME = 1.2;       // s after taking damage

// Difficulty presets — affect starting lives, level time, and enemy speed.
export const DIFFICULTIES = {
  easy:   { label: 'EASY',   lives: 5, timeScale: 1.2, enemyScale: 0.85 },
  normal: { label: 'NORMAL', lives: 3, timeScale: 1.0, enemyScale: 1.0 },
  hard:   { label: 'HARD',   lives: 2, timeScale: 0.8, enemyScale: 1.3 },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
// Base enemy speeds (enemies.js uses these as defaults; main.js scales from them).
export const GOOMBA_SPEED = 40;
export const KOOPA_SPEED = 34;
