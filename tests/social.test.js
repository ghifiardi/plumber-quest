// tests/social.test.js
import { test, assert, assertEqual } from './harness.js';
import { createSocial } from '../src/net/social.js';
import { createFakeTransport } from '../src/net/fake-transport.js';

const IID = '123e4567-e89b-42d3-a456-426614174000';
const cfg = { room: 'lobby', maxBubbles: 5, maxTicker: 20, bubbleTtlMs: 4000,
  perSenderMinGapMs: 1500, globalMaxPerSec: 12, reconnectBaseMs: 1000, reconnectMaxMs: 30000 };

function make() {
  const transport = createFakeTransport();
  let now = 0;
  const social = createSocial({
    config: cfg, transport,
    identity: { installationId: () => IID, resetIdentity: () => {} },
    handles:  { loadHandle: () => 'RedKoopa', rerollHandle: () => 'SwiftPipe' },
    now: () => now,
  });
  return { transport, social, setNow: (n) => { now = n; }, };
}

// Distinct, valid (8-hex-first-group) UUIDs for synthetic senders.
const uid = (i) => i.toString(16).padStart(8, '0') + '-e89b-42d3-a456-426614174000';

test('presence count dedupes by installation id', async () => {
  const { transport, social } = make();
  await social.enable();
  transport.__setPresence([{ iid: 'a' }, { iid: 'a' }, { iid: 'b' }]);
  assertEqual(social.getState().count, 2, 'two distinct iids');
});

test('sendCallout publishes a well-formed payload', async () => {
  const { transport, social } = make();
  await social.enable();
  const sent = [];
  transport.subscribe('callout', (p) => sent.push(p));
  social.sendCallout('GG');
  assertEqual(sent.length, 1);
  assertEqual(sent[0].t, 'callout'); assertEqual(sent[0].c, 'GG');
  assertEqual(sent[0].iid, IID); assertEqual(sent[0].h, 'RedKoopa'); assertEqual(sent[0].v, 1);
});

test('inbound callout enqueues a bubble, bounded to maxBubbles (drop oldest)', async () => {
  const { transport, social, setNow } = make();
  await social.enable();
  for (let i = 0; i < 8; i++) {
    setNow(i * 2000);  // distinct senders, spread across seconds (global cap resets)
    transport.__emit('callout', { v: 1, t: 'callout', iid: uid(i), h: 'P', c: 'GG' });
  }
  assertEqual(social.getState().bubbles.length, 5, 'capped at 5');
});

test('per-sender throttle drops rapid repeats from one iid', async () => {
  const { transport, social, setNow } = make();
  await social.enable();
  const p = { v: 1, t: 'callout', iid: IID, h: 'P', c: 'GG' };
  setNow(0);    transport.__emit('callout', p);
  setNow(100);  transport.__emit('callout', p);   // within 1500ms gap -> dropped
  assertEqual(social.getState().bubbles.length, 1, 'second dropped by per-sender gap');
});

test('global cap bounds inbound even with 30 distinct (rotated) iids in one second', async () => {
  const { transport, social, setNow } = make();
  await social.enable();
  setNow(0);   // all within the same 1s window
  for (let i = 0; i < 30; i++) {
    transport.__emit('callout', { v: 1, t: 'callout', iid: uid(i), h: 'P', c: 'GG' });  // distinct iids
  }
  // Per-sender gap can't catch distinct iids; only the global cap can.
  assertEqual(social.getDiag().accepted, cfg.globalMaxPerSec, 'accepted exactly the global cap');
  assert(social.getDiag().dropped >= 30 - cfg.globalMaxPerSec, 'the rest were dropped');
});

test('milestone publish + inbound appends to bounded ticker', async () => {
  const { transport, social, setNow } = make();
  await social.enable();
  const sent = [];
  transport.subscribe('milestone', (p) => sent.push(p));
  social.publishMilestone('level-clear', 3);
  assertEqual(sent[0].k, 'level-clear'); assertEqual(sent[0].lvl, 3);
  for (let i = 0; i < 25; i++) {
    setNow(i * 2000);   // distinct senders, spread across seconds
    transport.__emit('milestone', { v: 1, t: 'milestone', iid: uid(i), h: 'P', k: 'one-up' });
  }
  assertEqual(social.getState().ticker.length, 20, 'ticker capped at 20');
});

test('getDiag counts published and dropped events', async () => {
  const { transport, social, setNow } = make();
  await social.enable();
  social.sendCallout('GG');                                   // published++
  setNow(0);
  const bad = { v: 9, t: 'callout', iid: IID, h: 'P', c: 'GG' };  // wrong version -> dropped
  transport.__emit('callout', bad);
  const d = social.getDiag();
  assert(d.published >= 1, 'counted a publish');
  assert(d.dropped >= 1, 'counted a drop');
});

test('disable is a kill switch: clears state, stops I/O, disconnects, keeps session', async () => {
  const { transport, social } = make();
  await social.enable();
  transport.__setPresence([{ iid: 'a' }]);
  await social.disable();
  const s = social.getState();
  assertEqual(s.online, false); assertEqual(s.count, 0);
  assertEqual(s.bubbles.length, 0); assertEqual(s.ticker.length, 0);
  assertEqual(transport.disconnectCount, 1, 'transport.disconnect called');
  // After disable, further inbound is ignored:
  transport.__emit('callout', { v: 1, t: 'callout', iid: 'a0000000-e89b-42d3-a456-426614174000', h: 'P', c: 'GG' });
  assertEqual(social.getState().bubbles.length, 0, 'no inbound processed while disabled');
});
