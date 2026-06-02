import { test, assert, assertEqual } from './harness.js';
import { createAudio } from '../src/engine/audio.js';

function fakeCtx() {
  const nodes = [];
  return {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    resume(){ this.state='running'; return Promise.resolve(); },
    createOscillator(){ const o={ type:'square', frequency:{ value:0, setValueAtTime(){} }, connect(){}, start(){}, stop(){ o.stopped=true; } }; nodes.push(o); return o; },
    createGain(){ return { gain:{ value:1, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){} }; },
    _nodes: nodes,
  };
}

test('mute works before init', () => {
  const a = createAudio({ ctxFactory: fakeCtx });
  a.setMuted(true);                 // before unlock
  a.unlock();
  a.play('coin');                   // should no-op while muted
  assert(a.isMuted());
});

test('unlock resumes a suspended context', async () => {
  const ctx = fakeCtx();
  const a = createAudio({ ctxFactory: () => ctx });
  a.unlock();
  await Promise.resolve();
  assertEqual(ctx.state, 'running');
});

test('stopMusic stops EVERY scheduled music node', () => {
  const ctx = fakeCtx();
  const a = createAudio({ ctxFactory: () => ctx });
  a.unlock();
  ctx._nodes.length = 0;                 // ignore any nodes created before music starts
  a.startMusic();                        // schedules at least the first note synchronously
  assert(ctx._nodes.length > 0, 'music scheduled at least one node');
  a.stopMusic();
  assert(ctx._nodes.every(n => n.stopped === true), 'every scheduled music node was stopped');
});

test('mute mid-music stops it too', () => {
  const ctx = fakeCtx();
  const a = createAudio({ ctxFactory: () => ctx });
  a.unlock(); ctx._nodes.length = 0; a.startMusic();
  a.setMuted(true);
  assert(ctx._nodes.every(n => n.stopped === true), 'muting stopped the music nodes');
});

function fakeTrack() {
  return {
    loop:false, volume:1, preload:'', played:0, paused:false,
    addEventListener(){}, play(){ this.played++; this.paused=false; return Promise.resolve(); }, pause(){ this.paused=true; },
  };
}

test('startMusic plays the provided track instead of the synth', () => {
  const ctx = fakeCtx(); const t = fakeTrack();
  const a = createAudio({ ctxFactory: () => ctx, musicUrl: 'x.mp3', audioFactory: () => t });
  a.unlock(); ctx._nodes.length = 0;
  a.startMusic();
  assertEqual(t.played, 1, 'track was played');
  assert(t.loop === true, 'track loops');
  assertEqual(ctx._nodes.length, 0, 'no synth oscillators when a real track is used');
});

test('fanfare schedules ascending notes and respects mute', () => {
  const ctx = fakeCtx();
  const a = createAudio({ ctxFactory: () => ctx });
  a.unlock(); ctx._nodes.length = 0;
  a.fanfare();
  assert(ctx._nodes.length >= 5, 'fanfare scheduled multiple notes');
  const m = fakeCtx();
  const b = createAudio({ ctxFactory: () => m });
  b.setMuted(true); m._nodes.length = 0; b.fanfare();
  assertEqual(m._nodes.length, 0, 'muted fanfare is silent');
});

test('stopMusic and mute pause the track', () => {
  const ctx = fakeCtx(); const t = fakeTrack();
  const a = createAudio({ ctxFactory: () => ctx, musicUrl: 'x.mp3', audioFactory: () => t });
  a.unlock(); a.startMusic();
  a.stopMusic(); assert(t.paused, 'stopMusic paused the track');
  t.paused = false; a.startMusic(); a.setMuted(true); assert(t.paused, 'mute paused the track');
});
