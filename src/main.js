import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createCamera } from './engine/camera.js';
import { createAudio } from './engine/audio.js';
import { createGameState, STATES } from './game/game-state.js';
import { createWorld } from './game/world.js';
import { parseLevel } from './levels/level-format.js';
import { spawnGoomba, spawnKoopa } from './game/enemies.js';
import { createRenderer } from './render/renderer.js';
import { LEVEL_TIME, DIFFICULTIES, GOOMBA_SPEED, KOOPA_SPEED } from './engine/constants.js';
import L1 from './levels/world-1-1.js';
import L2 from './levels/world-1-2.js';
import L3 from './levels/world-1-3.js';
import L4 from './levels/world-1-4.js';
import L5 from './levels/world-1-5.js';
import L6 from './levels/world-1-6.js';

const LEVELS = [L1, L2, L3, L4, L5, L6];
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(); input.attach(window);
const audio = createAudio();

// Haptic feedback (Android Chrome supports navigator.vibrate; iOS Safari no-ops safely).
const haptic = (pattern) => { if (pattern && navigator.vibrate) { try { navigator.vibrate(pattern); } catch {} } };
// Subtle buzz patterns (ms) for notable game moments. Frequent events (coins) are omitted.
const EVENT_HAPTIC = {
  'enemy-stomped': 18, 'brick-broken': [8, 12, 8], 'powerup-collected': [12, 24],
  'player-hit': 30, 'player-died': [50, 30, 50], 'flag-reached': [20, 20, 40],
};

// worldFactory receives the SAME session object game-state owns, so simulation scoring
// (coins/score) mutates persistent state directly (spec §6; Findings #2/#5).
// Progressive difficulty: later levels get less time + faster enemies, scaled further by
// the chosen difficulty preset.
function worldFactory(levelIndex, session) {
  const diff = DIFFICULTIES[gs.difficulty] || DIFFICULTIES.normal;
  const time = Math.max(150, Math.round((LEVEL_TIME - levelIndex * 18) * diff.timeScale));
  const espeed = diff.enemyScale * (1 + levelIndex * 0.08);   // +8% per level
  const lvl = parseLevel(LEVELS[levelIndex], { tile: 16 });
  const w = createWorld(lvl, { session, time });
  for (const s of lvl.entitySpawns) {
    if (s.type === 'goomba') w.entities.push(spawnGoomba(s.x, s.y, GOOMBA_SPEED * espeed));
    else if (s.type === 'koopa') w.entities.push(spawnKoopa(s.x, s.y, KOOPA_SPEED * espeed));
  }
  return w;
}

const gs = createGameState({ worldFactory, levelCount: LEVELS.length });
const cam = createCamera({ viewW: canvas.width, viewH: canvas.height, bounds: { left:0, top:0, right:99999, bottom:240 } });

// --- canvas scaling: integer up-scale for crisp pixels; fractional DOWN-scale only when
//     the window is smaller than the native 256×240 so it never overflows ---
function resize() {
  const ratio = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
  const scale = ratio >= 1 ? Math.floor(ratio) : ratio;
  canvas.style.width = canvas.width * scale + 'px';
  canvas.style.height = canvas.height * scale + 'px';
}
window.addEventListener('resize', resize); resize();

// mute toggle works before audio init
const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', () => { audio.setMuted(!audio.isMuted()); muteBtn.textContent = audio.isMuted() ? '🔇' : '🔊'; });

// Begin a run with the currently-selected difficulty (music start owned by afterFrame).
function startRun() { gs.startSelected(); cam.bounds = gs.world.bounds; }

// Unified meta-input router for non-gameplay states (title / difficulty menu / pause).
// Gameplay movement keys are handled separately by input.attach.
function metaKey(e) {
  audio.unlock();
  const st = gs.state;
  if (st === STATES.title || st === STATES.gameOver || st === STATES.win) { gs.toDifficultySelect(); return; }
  if (st === STATES.difficultySelect) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') gs.moveSelection(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') gs.moveSelection(1);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') startRun();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    gs.togglePause();
    if (gs.state === STATES.paused) audio.stopMusic();
    else if (gs.state === STATES.playing) audio.startMusic();
  }
}
window.addEventListener('keydown', metaKey);
window.addEventListener('pointerdown', () => audio.unlock());  // unlock audio on first touch

// --- on-screen touch controls -> input actions (A = jump, B = run + fire) ---
const TOUCH_ACTIONS = { left: ['left'], right: ['right'], a: ['jump'], b: ['run', 'fire'] };
for (const btn of document.querySelectorAll('#touch-controls .tc-btn')) {
  const acts = TOUCH_ACTIONS[btn.dataset.action] || [];
  const set = (down) => acts.forEach(a => input.setAction(a, down));
  const press = (e) => {
    e.preventDefault(); audio.unlock();
    const st = gs.state;
    if (st === STATES.title || st === STATES.gameOver || st === STATES.win) { gs.toDifficultySelect(); haptic(12); return; }
    if (st === STATES.difficultySelect) {
      const a = btn.dataset.action;
      if (a === 'left') gs.moveSelection(-1);
      else if (a === 'right') gs.moveSelection(1);
      else if (a === 'a') startRun();
      haptic(12); return;
    }
    set(true); haptic(12); try { btn.setPointerCapture(e.pointerId); } catch {}
  };
  const release = (e) => { e.preventDefault(); set(false); };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);     // fallback when capture isn't held
  btn.addEventListener('contextmenu', (e) => e.preventDefault());  // no long-press menu
}

let prevState = gs.state;
const loop = createLoop({
  beforeFrame() { input.beginFrame(); },           // open input frame BEFORE any fixed steps
  step() {
    const intent = input.consumeIntent();          // edge delivered to first step this frame
    gs.update(1/60, intent);                       // gates by state internally (paused = no-op)
    if (gs.world) cam.bounds = gs.world.bounds;     // live bounds for camera follow
  },                                                // jump SFX now flows via the 'jump' event
  afterFrame() {                                   // once per frame, after ALL steps
    if (gs.world) for (const ev of gs.world.drainEvents()) { audio.playEvent(ev.type); haptic(EVENT_HAPTIC[ev.type]); }
    if (gs.state !== prevState) {
      if ([STATES.title, STATES.difficultySelect, STATES.intro, STATES.dying, STATES.gameOver, STATES.win].includes(gs.state)) audio.stopMusic();
      if (gs.state === STATES.playing && prevState !== STATES.paused) audio.startMusic();
      prevState = gs.state;
    }
  },
  render(alpha) {                                  // real interpolation alpha
    const st = gs.state;
    if (st === STATES.title) renderer.drawTitle();
    else if (st === STATES.difficultySelect) renderer.drawDifficultySelect(gs);
    else if (st === STATES.intro) renderer.drawIntro(gs.world, gs.session);
    else if (st === STATES.gameOver) renderer.drawGameOver(gs.session);
    else if (st === STATES.win) renderer.drawWin(gs.session);
    else if (gs.world) renderer.draw(gs.world, cam, alpha, gs.session, st);  // playing/paused/dying/level-clear
    else renderer.drawTitle();
  },
});
loop.start();
