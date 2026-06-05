import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { computeDisplay } from './engine/display.js';
import { createCamera } from './engine/camera.js';
import { createAudio } from './engine/audio.js';
import { createGameState, STATES } from './game/game-state.js';
import { createRenderer } from './render/renderer.js';
import L1 from './levels/world-1-1.js';
import L2 from './levels/world-1-2.js';
import L3 from './levels/world-1-3.js';
import L4 from './levels/world-1-4.js';
import L5 from './levels/world-1-5.js';
import L6 from './levels/world-1-6.js';
import DEMO1 from './levels/ecs/demo-1.js';
import { makeSim } from './sim/factory.js';
import { SOCIAL } from './net/config.js';
import { createSocial } from './net/social.js';
import { createNoopTransport } from './net/noop-transport.js';
import { createSocialOverlay } from './ui/social-overlay.js';
import { createEffects } from './fx/effects.js';
import { createFxOverlay } from './fx/fx-overlay.js';
import { createHitstop } from './engine/hitstop.js';
import { createCrt } from './render/crt.js';
import * as handles from './net/handles.js';
import { installationId, resetIdentity } from './net/identity.js';
import { CALLOUTS } from './net/schema.js';

const ECS_DEMO = new URLSearchParams(location.search).get('ecsdemo');
const LEVELS = ECS_DEMO ? [DEMO1] : [L1, L2, L3, L4, L5, L6];
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(); input.attach(window);
const audio = createAudio({ musicUrl: 'assets/theme.mp3' });   // original Suno track; synth fallback if it fails

// --- social layer (opt-in; no network until enabled) ---
const identity = { installationId, resetIdentity };
let social = createSocial({ config: SOCIAL, transport: createNoopTransport(), identity, handles });
const socialOverlay = createSocialOverlay(canvas.getContext('2d'));
const effects = createEffects();
const fxOverlay = createFxOverlay(canvas.getContext('2d'));
const hitstop = createHitstop();
const crt = createCrt(canvas.getContext('2d'));
const ONLINE_KEY = 'pq.online', NOTICE_KEY = 'pq.online.noticed';

async function buildSupabaseSocial() {
  const { createSupabaseTransport } = await import('./net/supabase-transport.js');  // lazy
  return createSocial({ config: SOCIAL, transport: createSupabaseTransport(SOCIAL), identity, handles });
}
let statusUnsub = null;
function bindSocialStatus() {              // reflect REAL connection status on the toggle
  if (statusUnsub) { statusUnsub(); statusUnsub = null; }
  statusUnsub = social.subscribe((s) => {
    if (localStorage.getItem(ONLINE_KEY) !== '1') return;
    setOnlineUI(s.status === 'connected' ? 'online'
      : s.status === 'connecting' ? 'connecting' : 'retrying');
  });
}
async function goOnline() {
  if (!SOCIAL.enabled) return;
  localStorage.setItem(ONLINE_KEY, '1');
  setOnlineUI('connecting');
  try {                                   // never let a failed connect/import block the game (§13)
    social = await buildSupabaseSocial();
    bindSocialStatus();                   // status subscription drives the label from here
    await social.enable();
  } catch (err) {
    console.warn('[social] could not go online:', err);
    if (statusUnsub) { statusUnsub(); statusUnsub = null; }
    social = createSocial({ config: SOCIAL, transport: createNoopTransport(), identity, handles });
    localStorage.setItem(ONLINE_KEY, '0');
    setOnlineUI('off');
  }
}
async function goOffline() {
  if (statusUnsub) { statusUnsub(); statusUnsub = null; }
  await social.disable();
  social = createSocial({ config: SOCIAL, transport: createNoopTransport(), identity, handles });
  localStorage.setItem(ONLINE_KEY, '0');
  setOnlineUI('off');
}

// Haptic feedback (Android Chrome supports navigator.vibrate; iOS Safari no-ops safely).
const haptic = (pattern) => { if (pattern && navigator.vibrate) { try { navigator.vibrate(pattern); } catch {} } };
// Subtle buzz patterns (ms) for notable game moments. Frequent events (coins) are omitted.
const EVENT_HAPTIC = {
  'enemy-stomped': 18, 'brick-broken': [8, 12, 8], 'powerup-collected': [12, 24],
  'player-hit': 30, 'player-died': [50, 30, 50], 'flag-reached': [20, 20, 40], 'one-up': [12, 30, 12],
};

// One factory for both sim paths; the discriminant lives in makeSim (sim/factory.js),
// so neither main.js nor game-state.js branches on classic-vs-ECS.
function worldFactory(levelIndex, session) {
  return makeSim(LEVELS[levelIndex], { levelIndex, session, difficulty: gs.difficulty });
}

const gs = createGameState({ worldFactory, levelCount: LEVELS.length });
const cam = createCamera({ viewW: canvas.width, viewH: canvas.height, bounds: { left:0, top:0, right:99999, bottom:240 } });

// --- canvas display scaling ---
// The canvas renders into a high-res backbuffer (set by the renderer), so we size it via
// CSS to FILL the viewport (keeping the 256:240 aspect). On mobile this makes the game as
// large as the screen allows instead of a tiny 1× block; the high-res backbuffer keeps it
// crisp. On touch devices we reserve a little bottom space for the on-screen controls.
const LOGICAL_W = 256, LOGICAL_H = 240;
const isTouch = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
  || (navigator.maxTouchPoints || 0) > 0 || ('ontouchstart' in window);
if (isTouch) document.body.classList.add('touch');   // reveal the on-screen controls
function resize() {
  const vw = window.innerWidth || LOGICAL_W, vh = window.innerHeight || LOGICAL_H;
  const { cssW, cssH, band } = computeDisplay(vw, vh, window.devicePixelRatio || 1, isTouch, LOGICAL_W, LOGICAL_H);
  document.body.style.paddingBottom = band + 'px';   // centers canvas above the control band
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  // NOTE: canvas.width/height (the backbuffer) intentionally stays 256x240 — never resized.
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// mute toggle works before audio init
const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', () => { audio.setMuted(!audio.isMuted()); muteBtn.textContent = audio.isMuted() ? '🔇' : '🔊'; });

const crtBtn = document.getElementById('crt');
crtBtn.classList.toggle('on', crt.isOn());
crtBtn.addEventListener('click', () => { crtBtn.classList.toggle('on', crt.toggle()); });

// --- social DOM controls ---
const $ = (id) => document.getElementById(id);
const socialToggle = $('social-toggle'), calloutBtn = $('callout-btn'),
  handleBox = $('social-handle'), handleName = $('handle-name'),
  calloutMenu = $('callout-menu'), notice = $('social-notice');

function setOnlineUI(mode) {                // 'off' | 'connecting' | 'online' | 'retrying'
  const connected = mode === 'online';
  socialToggle.textContent = mode === 'off' ? "SEE WHO'S ONLINE"
    : mode === 'connecting' ? 'CONNECTING…'
    : connected ? 'ONLINE ◂' : 'RETRYING…';
  socialToggle.classList.toggle('on', mode !== 'off');
  calloutBtn.hidden = !connected; handleBox.hidden = !connected;
  handleName.textContent = connected ? handles.loadHandle() : '';
}

socialToggle.addEventListener('click', () => {
  const on = localStorage.getItem(ONLINE_KEY) === '1';
  if (on) { goOffline(); return; }
  if (localStorage.getItem(NOTICE_KEY) !== '1') { notice.hidden = false; return; }  // first-run consent
  goOnline();
});
$('notice-ok').addEventListener('click', () => { localStorage.setItem(NOTICE_KEY, '1'); notice.hidden = true; goOnline(); });
$('notice-cancel').addEventListener('click', () => { notice.hidden = true; });
$('reroll').addEventListener('click', () => { handleName.textContent = handles.rerollHandle(); });
// "Reset online identity" (spec §8): go offline first, then drop the local
// session/handle/iid; a fresh anon session + handle is minted on next enable.
$('reset-id').addEventListener('click', async () => {
  if (localStorage.getItem(ONLINE_KEY) === '1') await goOffline();
  resetIdentity();                       // clears iid + handle
  localStorage.removeItem('pq.supabase.auth');  // drop the persisted anon session
  handleName.textContent = handles.loadHandle();
});

// Callout menu: one tap per preset.
calloutMenu.innerHTML = CALLOUTS.map((c) => `<button data-c="${c}">${c}</button>`).join('');
calloutBtn.addEventListener('click', () => { calloutMenu.hidden = !calloutMenu.hidden; });
calloutMenu.addEventListener('click', (e) => {
  const c = e.target.dataset.c; if (!c) return;
  social.sendCallout(c); calloutMenu.hidden = true; haptic(12);
});
window.addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !calloutBtn.hidden) calloutMenu.hidden = !calloutMenu.hidden; });

// Restore prior preference on load (re-consent already given previously).
if (SOCIAL.enabled && localStorage.getItem(ONLINE_KEY) === '1') goOnline();
else setOnlineUI('off');

// Begin a run with the currently-selected difficulty (music start owned by afterFrame).
function startRun() { gs.startSelected(); cam.bounds = gs.world.getBounds(); }

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

// Whole-screen TAP advances non-gameplay states on touch (mirrors metaKey for keyboard):
// title/game-over/win -> difficulty select; difficulty select -> start with current pick.
// Taps on the on-screen control buttons or the mute button are handled by their own listeners.
window.addEventListener('pointerdown', (e) => {
  audio.unlock();
  const t = e.target;
  if (t && t.closest && (t.closest('#touch-controls') || t.closest('#mute'))) return;
  const st = gs.state;
  if (st === STATES.title || st === STATES.gameOver || st === STATES.win) gs.toDifficultySelect();
  else if (st === STATES.difficultySelect) startRun();
});

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
let prevFacing = 1;
const loop = createLoop({
  beforeFrame() { input.beginFrame(); },           // open input frame BEFORE any fixed steps
  step() {
    if (hitstop.step()) { effects.tick(1 / 60); return; }   // freeze sim; keep particles alive; keep intent pending
    const intent = input.consumeIntent();
    gs.update(1 / 60, intent);
    if (gs.world) cam.bounds = gs.world.getBounds();
    effects.tick(1 / 60);
  },
  afterFrame() {                                   // once per frame, after ALL steps
    if (gs.state !== prevState && (gs.state === STATES.intro || gs.state === STATES.title)) effects.clear();
    if (gs.world) for (const ev of gs.world.drainEvents()) {
      if (ev.type === 'flag-reached') { audio.stopMusic(); audio.fanfare(); }   // duck music for the fanfare
      else audio.playEvent(ev.type);
      haptic(EVENT_HAPTIC[ev.type]);
      if (ev.type === 'flag-reached') social.publishMilestone('level-clear', gs.session.levelIndex + 1);
      else if (ev.type === 'one-up') social.publishMilestone('one-up');
      effects.handle(ev);
      if (ev.type === 'enemy-stomped') hitstop.trigger(4);
      else if (ev.type === 'brick-broken') hitstop.trigger(3);
      else if (ev.type === 'player-hit') hitstop.trigger(6);
    }
    if (gs.world && gs.state === STATES.playing) {
      const pl = gs.world.getRenderView().player;
      if (pl.onGround && Math.abs(pl.vx) > 60 && pl.facing !== prevFacing) {
        effects.spawn('dust', pl.x + pl.w / 2, pl.y + pl.h);   // skid kick
      }
      prevFacing = pl.facing;
    }
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
    else if (st === STATES.intro) renderer.drawIntro(gs.world.getRenderView(), gs.session);
    else if (st === STATES.gameOver) renderer.drawGameOver(gs.session);
    else if (st === STATES.win) renderer.drawWin(gs.session);
    else if (gs.world) renderer.draw(gs.world.getRenderView(), cam, alpha, gs.session, st);  // playing/paused/dying/level-clear
    else renderer.drawTitle();
    if (st !== STATES.title && st !== STATES.difficultySelect && st !== STATES.gameOver && st !== STATES.win && st !== STATES.intro)
      fxOverlay.draw(effects.list(), cam, effects.flash());   // particles over the world only
    socialOverlay.draw(social.getState(), (typeof performance !== 'undefined' ? performance.now() : 0), st);
    crt.draw();                                                // final post-pass over everything
  },
});
loop.start();
