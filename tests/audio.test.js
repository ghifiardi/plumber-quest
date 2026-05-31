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
