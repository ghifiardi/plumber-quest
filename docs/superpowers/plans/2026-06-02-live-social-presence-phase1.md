# Live Social Presence — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in live social presence to Plumber Quest — a players-online counter, tap-to-send preset callouts, and an activity ticker — over Supabase Realtime, without touching the deterministic game sim.

**Architecture:** A `src/net/` layer behind a `RealtimeTransport` adapter interface (Supabase concrete adapter + a no-op + an in-memory fake for tests). A `social.js` hub owns all ephemeral social state, validates every inbound payload, and exposes read-only state. A `src/ui/social-overlay.js` draws the counter/bubbles/ticker on the canvas *after* the world frame. `main.js` wires consent, controls, and forwards existing game events as milestones. The sim (`world.js`) and its renderer never see network state.

**Tech Stack:** Vanilla ES modules (zero-build), Supabase Realtime (`@supabase/supabase-js`, pinned, lazily imported from CDN after opt-in), anonymous auth + private channels + RLS, the repo's in-browser test harness (`tests/harness.js`).

**Spec:** `docs/superpowers/specs/2026-06-02-live-social-presence-design.md` (rev 3).

---

## Running tests (this repo has no CLI test runner)

Tests are ES modules using `tests/harness.js`, registered in `tests/index.html`, executed in a browser via `runAll()`.

- **Run:** from the project root, `python3 -m http.server 8000`, then open `http://localhost:8000/tests/index.html`. The page renders `PASS <n> / FAIL <m>` plus one ✅/❌ line per test.
- **Expected FAIL (red step):** the new test's line shows `❌ …` and the `FAIL` count is ≥ 1.
- **Expected PASS (green step):** the new test's line shows `✅ …` and `FAIL 0`.

All net/social logic is tested with the in-memory `FakeTransport` and `localStorage` (both available in the browser harness) — **no real network in tests**.

---

## File structure

```
src/net/
  config.js             # Supabase URL + publishable key + pinned SDK URL + flags/limits
  schema.js             # SCHEMA_VERSION, CALLOUTS, MILESTONES, isUuid, escape, validateInbound
  handles.js            # adjective+noun lists, generate/load/save/reroll (localStorage)
  identity.js           # persisted installationId (UUID) + reset
  transport.js          # RealtimeTransport contract (JSDoc only)
  noop-transport.js     # createNoopTransport(): all no-ops (disabled/offline)
  fake-transport.js     # createFakeTransport(): in-memory loopback for tests
  supabase-transport.js # createSupabaseTransport(config): lazy pinned SDK, anon auth, private channel
  social.js             # createSocial({...}): the hub (state, validation, throttle, queues, lifecycle)
src/ui/
  social-overlay.js     # createSocialOverlay(ctx): draws counter/bubbles/ticker after the world
tests/
  schema.test.js  handles.test.js  identity.test.js
  transport.test.js  social.test.js  social-overlay.test.js
docs/
  privacy-policy.html   # MODIFY: disclose opt-in online data sharing
  PLAY_STORE.md         # MODIFY: data-safety guidance for online mode
index.html              # MODIFY: add social DOM controls + styles
src/main.js             # MODIFY: wire social (consent, controls, milestone forwarding, overlay draw)
```

---

## Task 0: Supabase project & backend setup (operational, no code)

**Files:** none (produces values used by `src/net/config.js` in Task 1).

- [ ] **Step 1: Create the project & get client credentials**

In the Supabase dashboard: create a project. From **Project Settings → API keys**, copy the project **URL** and the **publishable key** (the current client-side key; not the legacy `anon` key terminology). Record both for Task 1.

- [ ] **Step 2: Enable anonymous sign-ins**

Dashboard → **Authentication → Sign In / Providers → Anonymous sign-ins → Enable**. (Turnstile/CAPTCHA stays off in dev; §7.3 of the spec requires enabling invisible Turnstile here before public launch.)

- [ ] **Step 3: Add RLS policies for private Realtime channels**

Dashboard → **SQL Editor**, run (this authorizes the `authenticated` role to read/write Broadcast + Presence on the `lobby` topic only — join-time capability control, per spec §7.1):

```sql
-- Authenticated (incl. anonymous) users may read broadcast/presence on `lobby`.
create policy "social read lobby"
on "realtime"."messages"
for select
to authenticated
using ( realtime.topic() = 'lobby' );

-- Authenticated users may send broadcast/presence on `lobby`.
create policy "social write lobby"
on "realtime"."messages"
for insert
to authenticated
with check ( realtime.topic() = 'lobby' );
```

- [ ] **Step 4: Schedule anonymous-user cleanup (age-based)**

Dashboard → **SQL Editor**. Enable `pg_cron` (Database → Extensions) then schedule a daily age-based delete (spec §12 — no `last_seen` exists, so delete by creation age):

```sql
select cron.schedule(
  'cleanup-anon-users',
  '0 3 * * *',
  $$ delete from auth.users
     where is_anonymous = true
       and created_at < now() - interval '30 days'; $$
);
```

- [ ] **Step 5: Record values**

Write the URL + publishable key into a scratch note for Task 1. Do **not** commit secrets anywhere except `config.js` in Task 1 (the publishable key is designed to be client-public).

---

## Task 1: Network config

**Files:**
- Create: `src/net/config.js`

- [ ] **Step 1: Write the config module**

```js
// src/net/config.js
// Central config for the social layer. The publishable key is intended for
// client-side use (Supabase), so it is safe to ship in the bundle.

export const SOCIAL = {
  // Hard feature flag: when false, the app never loads any network code.
  enabled: true,

  // From Task 0 — replace with this project's real values:
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_REPLACE_ME',

  // Exact-pinned supabase-js, dynamically imported only after opt-in.
  sdkUrl: 'https://esm.sh/@supabase/supabase-js@2.45.4',

  // Single Phase-1 channel.
  room: 'lobby',

  // Limits / tuning.
  maxBubbles: 5,         // concurrent on-screen callout bubbles (drop oldest)
  maxTicker: 20,         // ring buffer of recent milestones
  bubbleTtlMs: 4000,     // how long a callout bubble shows
  perSenderMinGapMs: 1500, // min gap between accepted events from one iid
  globalMaxPerSec: 12,   // global inbound cap across all senders
  reconnectBaseMs: 1000, // backoff base
  reconnectMaxMs: 30000, // backoff ceiling
};
```

- [ ] **Step 2: Commit**

```bash
git add src/net/config.js
git commit -m "feat(net): social config (Supabase creds, limits, pinned SDK)"
```

---

## Task 2: Payload schema & validators

**Files:**
- Create: `src/net/schema.js`
- Test: `tests/schema.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/schema.test.js
import { test, assert, assertEqual } from './harness.js';
import { CALLOUTS, MILESTONES, isUuid, escapeText, validateInbound } from '../src/net/schema.js';

const IID = '123e4567-e89b-42d3-a456-426614174000';
const HANDLE = 'SwiftKoopa';

test('isUuid accepts a v4-shaped id and rejects junk', () => {
  assert(isUuid(IID), 'valid uuid accepted');
  assert(!isUuid('nope'), 'junk rejected');
  assert(!isUuid(''), 'empty rejected');
});

test('escapeText strips angle brackets and caps length', () => {
  assertEqual(escapeText('<b>hi</b>'), '&lt;b&gt;hi&lt;/b&gt;');
  assertEqual(escapeText('x'.repeat(50)).length, 16, 'capped to 16');
});

test('validateInbound accepts a well-formed callout', () => {
  const ok = validateInbound({ v: 1, t: 'callout', iid: IID, h: HANDLE, c: 'GG' });
  assert(ok, 'returned a normalized object');
  assertEqual(ok.t, 'callout'); assertEqual(ok.c, 'GG'); assertEqual(ok.iid, IID);
});

test('validateInbound rejects wrong version, unknown enum, bad iid, bad handle', () => {
  assertEqual(validateInbound({ v: 2, t: 'callout', iid: IID, h: HANDLE, c: 'GG' }), null, 'bad version');
  assertEqual(validateInbound({ v: 1, t: 'callout', iid: IID, h: HANDLE, c: 'ZZZ' }), null, 'unknown callout');
  assertEqual(validateInbound({ v: 1, t: 'callout', iid: 'x', h: HANDLE, c: 'GG' }), null, 'bad iid');
  assertEqual(validateInbound({ v: 1, t: 'callout', iid: IID, h: '<script>', c: 'GG' }), null, 'bad handle shape');
});

test('validateInbound accepts a milestone and clamps lvl', () => {
  const ok = validateInbound({ v: 1, t: 'milestone', iid: IID, h: HANDLE, k: 'level-clear', lvl: 3 });
  assert(ok && ok.k === 'level-clear' && ok.lvl === 3);
  assertEqual(validateInbound({ v: 1, t: 'milestone', iid: IID, h: HANDLE, k: 'one-up', lvl: 99 }), null, 'lvl out of range');
  assertEqual(validateInbound({ v: 1, t: 'milestone', iid: IID, h: HANDLE, k: 'high-score' }), null, 'kind not allowed in P1');
});

assert(CALLOUTS.length === 6 && MILESTONES.length === 2, 'enum sizes fixed');
```

- [ ] **Step 2: Run test to verify it fails**

Run the suite (see "Running tests"). Expected: the `schema.test.js` lines show `❌ … schema.js` (module not found) — FAIL ≥ 1.

- [ ] **Step 3: Write the implementation**

```js
// src/net/schema.js
export const SCHEMA_VERSION = 1;
export const CALLOUTS   = ['GG', 'NICE', 'LETSGO', 'OOPS', 'WAVE', 'COIN'];
export const MILESTONES = ['level-clear', 'one-up'];

const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE_RE = /^[A-Za-z0-9 _-]{1,16}$/;

export function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }

export function escapeText(s) {
  return String(s ?? '')
    .slice(0, 16)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Returns a normalized, trusted-shape object, or null if anything is off.
// This is UI safety (defense-in-depth), NOT the abuse boundary (spec §7).
export function validateInbound(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.v !== SCHEMA_VERSION) return null;
  if (!isUuid(p.iid)) return null;
  if (typeof p.h !== 'string' || !HANDLE_RE.test(p.h)) return null;

  if (p.t === 'callout') {
    if (!CALLOUTS.includes(p.c)) return null;
    return { v: 1, t: 'callout', iid: p.iid, h: p.h, c: p.c };
  }
  if (p.t === 'milestone') {
    if (!MILESTONES.includes(p.k)) return null;
    let lvl;
    if (p.lvl !== undefined) {
      if (!Number.isInteger(p.lvl) || p.lvl < 1 || p.lvl > 6) return null;
      lvl = p.lvl;
    }
    return { v: 1, t: 'milestone', iid: p.iid, h: p.h, k: p.k, ...(lvl ? { lvl } : {}) };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the suite. Expected: all `schema.test.js` lines ✅, `FAIL 0`.

- [ ] **Step 5: Commit**

```bash
git add src/net/schema.js tests/schema.test.js
git commit -m "feat(net): versioned payload schema + inbound validators"
```

---

## Task 3: Player handles

**Files:**
- Create: `src/net/handles.js`
- Test: `tests/handles.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/handles.test.js
import { test, assert, assertEqual } from './harness.js';
import { loadHandle, rerollHandle, HANDLE_KEY } from '../src/net/handles.js';

function clear() { localStorage.removeItem(HANDLE_KEY); }

test('loadHandle generates + persists a valid handle', () => {
  clear();
  const h = loadHandle();
  assert(/^[A-Za-z0-9]{1,16}$/.test(h), `valid: ${h}`);
  assertEqual(localStorage.getItem(HANDLE_KEY), h, 'persisted');
  assertEqual(loadHandle(), h, 'stable across calls');
});

test('rerollHandle changes and persists', () => {
  clear();
  const a = loadHandle();
  let b = a, tries = 0;
  while (b === a && tries++ < 20) b = rerollHandle();
  assert(b !== a, 'reroll produced a different handle');
  assertEqual(localStorage.getItem(HANDLE_KEY), b, 'persisted new handle');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run the suite. Expected: `handles.test.js` lines ❌ (module missing).

- [ ] **Step 3: Write the implementation**

```js
// src/net/handles.js
export const HANDLE_KEY = 'pq.handle';

const ADJ  = ['Swift', 'Red', 'Brave', 'Lucky', 'Turbo', 'Pixel', 'Mighty', 'Sneaky', 'Golden', 'Cosmic'];
const NOUN = ['Koopa', 'Pipe', 'Shell', 'Coin', 'Plumber', 'Goomba', 'Flower', 'Star', 'Block', 'Dash'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function generate() { return (pick(ADJ) + pick(NOUN)).slice(0, 16); }

export function loadHandle() {
  let h = localStorage.getItem(HANDLE_KEY);
  if (!h) { h = generate(); localStorage.setItem(HANDLE_KEY, h); }
  return h;
}

export function rerollHandle() {
  const h = generate();
  localStorage.setItem(HANDLE_KEY, h);
  return h;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the suite. Expected: `handles.test.js` ✅, `FAIL 0`.

- [ ] **Step 5: Commit**

```bash
git add src/net/handles.js tests/handles.test.js
git commit -m "feat(net): auto handle generation + reroll (localStorage)"
```

---

## Task 4: Installation identity

**Files:**
- Create: `src/net/identity.js`
- Test: `tests/identity.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/identity.test.js
import { test, assert, assertEqual } from './harness.js';
import { installationId, resetIdentity, IID_KEY } from '../src/net/identity.js';
import { isUuid } from '../src/net/schema.js';
import { HANDLE_KEY } from '../src/net/handles.js';

test('installationId is a persisted uuid, stable across calls', () => {
  localStorage.removeItem(IID_KEY);
  const a = installationId();
  assert(isUuid(a), `uuid: ${a}`);
  assertEqual(installationId(), a, 'stable');
  assertEqual(localStorage.getItem(IID_KEY), a, 'persisted');
});

test('resetIdentity clears iid + handle (auth session handled elsewhere)', () => {
  installationId(); localStorage.setItem(HANDLE_KEY, 'RedKoopa');
  resetIdentity();
  assertEqual(localStorage.getItem(IID_KEY), null, 'iid cleared');
  assertEqual(localStorage.getItem(HANDLE_KEY), null, 'handle cleared');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run the suite. Expected: `identity.test.js` ❌ (module missing).

- [ ] **Step 3: Write the implementation**

```js
// src/net/identity.js
import { HANDLE_KEY } from './handles.js';

export const IID_KEY = 'pq.iid';

function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  // Fallback (older webviews): RFC-4122-ish v4 from crypto.getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
}

export function installationId() {
  let id = localStorage.getItem(IID_KEY);
  if (!id) { id = uuid(); localStorage.setItem(IID_KEY, id); }
  return id;
}

// Drops the local pseudonymous identity. The Supabase auth session is rotated
// separately by the transport on next enable (spec §12).
export function resetIdentity() {
  localStorage.removeItem(IID_KEY);
  localStorage.removeItem(HANDLE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the suite. Expected: `identity.test.js` ✅, `FAIL 0`.

- [ ] **Step 5: Commit**

```bash
git add src/net/identity.js tests/identity.test.js
git commit -m "feat(net): persisted installation id + identity reset"
```

---

## Task 5: Transport contract, no-op, and fake (test) adapters

**Files:**
- Create: `src/net/transport.js`
- Create: `src/net/noop-transport.js`
- Create: `src/net/fake-transport.js`
- Test: `tests/transport.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/transport.test.js
import { test, assert, assertEqual } from './harness.js';
import { createNoopTransport } from '../src/net/noop-transport.js';
import { createFakeTransport } from '../src/net/fake-transport.js';

test('noop transport satisfies the contract and does nothing', async () => {
  const t = createNoopTransport();
  await t.connect('lobby');
  let got = 0;
  const un = t.subscribe('callout', () => got++);
  t.status(() => {}); t.presence(() => {});
  await t.publish('callout', { x: 1 });
  un();
  await t.disconnect();
  assertEqual(got, 0, 'noop never delivers');
});

test('fake transport loops published messages back to subscribers', async () => {
  const t = createFakeTransport();
  await t.connect('lobby');
  const seen = [];
  t.subscribe('callout', (p) => seen.push(p));
  await t.publish('callout', { hi: 1 });
  assertEqual(seen.length, 1); assertEqual(seen[0].hi, 1);
});

test('fake transport injects inbound + presence snapshots, records disconnect', async () => {
  const t = createFakeTransport();
  const statuses = [], members = [];
  t.status((s) => statuses.push(s));
  t.presence((m) => members.push(m));
  await t.connect('lobby');
  t.__emit('callout', { a: 1 });           // test-only inbound injection
  t.__setPresence([{ iid: 'a' }, { iid: 'a' }, { iid: 'b' }]);
  assert(statuses.includes('connected'), 'status emitted connected');
  assertEqual(members.at(-1).length, 3, 'raw members include dupes (hub dedupes)');
  await t.disconnect();
  assertEqual(t.disconnectCount, 1, 'disconnect recorded');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run the suite. Expected: `transport.test.js` ❌ (modules missing).

- [ ] **Step 3: Write the contract doc**

```js
// src/net/transport.js
/**
 * @typedef {'connecting'|'connected'|'disconnected'|'error'} ConnStatus
 *
 * RealtimeTransport — provider-agnostic realtime contract. All subscribe-style
 * methods return an unsubscribe function.
 *
 * @typedef {Object} RealtimeTransport
 * @property {(room: string) => Promise<void>} connect
 * @property {(handler: (s: ConnStatus) => void) => (() => void)} status
 * @property {(topic: string, handler: (payload: any) => void) => (() => void)} subscribe
 * @property {(handler: (members: Array<{iid:string}>) => void) => (() => void)} presence
 * @property {(topic: string, payload: any) => Promise<void>} publish
 * @property {() => Promise<void>} disconnect
 */
export {};
```

- [ ] **Step 4: Write the no-op adapter**

```js
// src/net/noop-transport.js
// Used when social is disabled or offline. Implements the contract; does nothing.
export function createNoopTransport() {
  const noop = () => () => {};
  return {
    connect: async () => {},
    status: noop,
    subscribe: noop,
    presence: noop,
    publish: async () => {},
    disconnect: async () => {},
  };
}
```

- [ ] **Step 5: Write the fake (test) adapter**

```js
// src/net/fake-transport.js
// In-memory loopback for tests. publish() echoes to subscribers of that topic.
// __emit/__setPresence let tests inject inbound traffic and presence snapshots.
export function createFakeTransport() {
  const subs = new Map();     // topic -> Set(handler)
  const statusHandlers = new Set();
  const presenceHandlers = new Set();
  const t = {
    disconnectCount: 0,
    async connect() { statusHandlers.forEach((h) => h('connected')); },
    status(h) { statusHandlers.add(h); return () => statusHandlers.delete(h); },
    subscribe(topic, h) {
      if (!subs.has(topic)) subs.set(topic, new Set());
      subs.get(topic).add(h);
      return () => subs.get(topic)?.delete(h);
    },
    presence(h) { presenceHandlers.add(h); return () => presenceHandlers.delete(h); },
    async publish(topic, payload) { (subs.get(topic) || []).forEach((h) => h(payload)); },
    async disconnect() { t.disconnectCount++; statusHandlers.forEach((h) => h('disconnected')); },
    // test-only:
    __emit(topic, payload) { (subs.get(topic) || []).forEach((h) => h(payload)); },
    __setPresence(members) { presenceHandlers.forEach((h) => h(members)); },
  };
  return t;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run the suite. Expected: `transport.test.js` ✅, `FAIL 0`.

- [ ] **Step 7: Commit**

```bash
git add src/net/transport.js src/net/noop-transport.js src/net/fake-transport.js tests/transport.test.js
git commit -m "feat(net): transport contract + noop + in-memory fake adapter"
```

---

## Task 6: Social hub (state, validation, throttle, queues, lifecycle)

**Files:**
- Create: `src/net/social.js`
- Test: `tests/social.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run the suite. Expected: `social.test.js` ❌ (module missing).

- [ ] **Step 3: Write the implementation**

```js
// src/net/social.js
import { validateInbound, SCHEMA_VERSION } from './schema.js';

// The social hub. Owns ALL ephemeral social state; validates every inbound
// payload; never touches the game sim. State is read-only via getState().
export function createSocial({ config, transport, identity, handles, now = () => Date.now() }) {
  const state = { online: false, status: 'disconnected', count: 0, bubbles: [], ticker: [] };
  const listeners = new Set();
  const unsubs = [];
  let lastBySender = new Map();   // iid -> last accepted ts
  let windowStart = 0, windowCount = 0;
  let reconnectTimer = null, backoff = config.reconnectBaseMs;
  // §10 local diagnostics — console/dev only, NOT collected anywhere.
  const diag = { published: 0, accepted: 0, dropped: 0, reconnects: 0 };

  const emit = () => listeners.forEach((fn) => fn(getState()));
  function getState() {
    return { online: state.online, status: state.status, count: state.count,
      bubbles: state.bubbles.slice(), ticker: state.ticker.slice() };
  }
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // --- inbound rate gates (UI safety; NOT the abuse boundary) ---
  function rateOk(iid) {
    const t = now();
    if (t - windowStart >= 1000) { windowStart = t; windowCount = 0; }   // 1s window
    if (windowCount >= config.globalMaxPerSec) { diag.dropped++; return false; }   // global cap
    const last = lastBySender.get(iid) ?? -Infinity;   // ?? not || (a stored ts of 0 is valid)
    if (t - last < config.perSenderMinGapMs) { diag.dropped++; return false; }     // per-sender gap
    lastBySender.set(iid, t); windowCount++;
    return true;
  }

  function ingest(raw) {
    if (!state.online) return;
    const p = validateInbound(raw);
    if (!p) { diag.dropped++; return; }
    if (!rateOk(p.iid)) return;
    if (p.t === 'callout') {
      state.bubbles.push({ handle: p.h, code: p.c, born: now() });
      if (state.bubbles.length > config.maxBubbles) state.bubbles.shift();
    } else if (p.t === 'milestone') {
      state.ticker.push({ text: tickerText(p), born: now() });
      if (state.ticker.length > config.maxTicker) state.ticker.shift();
    }
    diag.accepted++;
    emit();
  }

  function tickerText(p) {
    if (p.k === 'level-clear') return `${p.h} cleared 1-${p.lvl ?? '?'}!`;
    if (p.k === 'one-up') return `${p.h} got a 1-UP!`;
    return `${p.h}`;
  }

  function setPresence(members) {
    const ids = new Set((members || []).map((m) => m.iid));
    state.count = ids.size;
    emit();
  }

  function setStatus(s) {
    state.status = s; emit();
    if (!state.online) return;
    if (s === 'disconnected' || s === 'error') scheduleReconnect();
    else if (s === 'connected') backoff = config.reconnectBaseMs;
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = backoff + Math.floor(Math.random() * 250);   // jitter
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      backoff = Math.min(config.reconnectMaxMs, backoff * 2);
      diag.reconnects++;
      if (state.online) { try { await transport.connect(config.room); } catch {} }
    }, delay);
  }

  async function enable() {
    if (state.online) return;
    state.online = true;
    unsubs.push(transport.status(setStatus));
    unsubs.push(transport.subscribe('callout', ingest));
    unsubs.push(transport.subscribe('milestone', ingest));
    unsubs.push(transport.presence(setPresence));
    try { await transport.connect(config.room); } catch { setStatus('error'); }
    emit();
  }

  async function disable() {
    state.online = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    while (unsubs.length) { try { unsubs.pop()(); } catch {} }
    state.count = 0; state.bubbles = []; state.ticker = [];
    lastBySender = new Map(); windowCount = 0;
    try { await transport.disconnect(); } catch {}
    state.status = 'disconnected';
    if (typeof console !== 'undefined' && console.debug) console.debug('[social] diag', getDiag());
    emit();
  }

  function sendCallout(code) {
    if (!state.online) return;
    diag.published++;
    transport.publish('callout', { v: SCHEMA_VERSION, t: 'callout',
      iid: identity.installationId(), h: handles.loadHandle(), c: code }).catch(() => {});
  }

  function publishMilestone(kind, lvl) {
    if (!state.online) return;
    diag.published++;
    const payload = { v: SCHEMA_VERSION, t: 'milestone',
      iid: identity.installationId(), h: handles.loadHandle(), k: kind };
    if (lvl) payload.lvl = lvl;
    transport.publish('milestone', payload).catch(() => {});
  }

  // §10 local diagnostics snapshot (dev only; not collected/sent).
  const getDiag = () => ({ ...diag, count: state.count, status: state.status });

  return { getState, subscribe, enable, disable, sendCallout, publishMilestone, getDiag };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the suite. Expected: `social.test.js` ✅, `FAIL 0`.

- [ ] **Step 5: Commit**

```bash
git add src/net/social.js tests/social.test.js
git commit -m "feat(net): social hub — validation, throttle, bounded queues, kill switch"
```

---

## Task 7: Supabase transport adapter (manual/integration — no unit test)

**Files:**
- Create: `src/net/supabase-transport.js`

> This adapter performs real network + auth and cannot run in the unit harness; it is exercised by the manual smoke checklist in Task 14. The hub is fully unit-tested via `FakeTransport`. Keeping it a thin, side-effect-only adapter keeps the untested surface minimal.

- [ ] **Step 1: Write the implementation**

```js
// src/net/supabase-transport.js
// Lazily imports a PINNED supabase-js only after opt-in. Anonymous auth +
// private channel with presence keyed by installation id. disconnect() stops
// auth auto-refresh and leaves the channel but KEEPS the persisted session.
import { installationId } from './identity.js';

export function createSupabaseTransport(config) {
  let supa = null, channel = null;
  const statusHandlers = new Set();
  const presenceHandlers = new Set();
  const subs = new Map();           // topic -> Set(handler)
  const emitStatus = (s) => statusHandlers.forEach((h) => h(s));

  async function client() {
    if (supa) return supa;
    const { createClient } = await import(config.sdkUrl);   // pinned URL (config)
    supa = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pq.supabase.auth' },
    });
    return supa;
  }

  async function ensureSession(s) {
    const { data } = await s.auth.getSession();
    if (data.session) return data.session;
    const { data: signed, error } = await s.auth.signInAnonymously();
    if (error) throw error;
    return signed.session;
  }

  return {
    async connect(room) {
      emitStatus('connecting');
      const s = await client();
      s.auth.startAutoRefresh();
      const session = await ensureSession(s);
      await s.realtime.setAuth(session.access_token);
      const iid = installationId();
      channel = s.channel(room, { config: { private: true, presence: { key: iid } } });

      channel.on('broadcast', { event: 'callout' },  (m) => (subs.get('callout')  || []).forEach((h) => h(m.payload)));
      channel.on('broadcast', { event: 'milestone' },(m) => (subs.get('milestone')|| []).forEach((h) => h(m.payload)));
      channel.on('presence', { event: 'sync' }, () => {
        const ids = Object.keys(channel.presenceState());          // already deduped by key
        presenceHandlers.forEach((h) => h(ids.map((id) => ({ iid: id }))));
      });

      await new Promise((resolve) => {
        channel.subscribe(async (st) => {
          if (st === 'SUBSCRIBED') { await channel.track({ iid, h: '' }); emitStatus('connected'); resolve(); }
          else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') emitStatus('error');
          else if (st === 'CLOSED') emitStatus('disconnected');
        });
      });
    },
    status(h) { statusHandlers.add(h); return () => statusHandlers.delete(h); },
    subscribe(topic, h) {
      if (!subs.has(topic)) subs.set(topic, new Set());
      subs.get(topic).add(h);
      return () => subs.get(topic)?.delete(h);
    },
    presence(h) { presenceHandlers.add(h); return () => presenceHandlers.delete(h); },
    async publish(topic, payload) {
      if (!channel) return;
      await channel.send({ type: 'broadcast', event: topic, payload });
    },
    async disconnect() {
      try { if (channel) { await channel.untrack(); await supa.removeChannel(channel); } }
      finally {
        channel = null;
        if (supa) supa.auth.stopAutoRefresh();   // KEEP the session; just stop background refresh
        emitStatus('disconnected');
      }
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/net/supabase-transport.js
git commit -m "feat(net): supabase realtime adapter (lazy pinned SDK, anon auth, private channel)"
```

---

## Task 8: Social overlay renderer

**Files:**
- Create: `src/ui/social-overlay.js`
- Test: `tests/social-overlay.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/social-overlay.test.js
import { test, assert } from './harness.js';
import { createSocialOverlay } from '../src/ui/social-overlay.js';

// Minimal 2D-context stub: records nothing, just must not throw.
function stubCtx() {
  const noop = () => {};
  return new Proxy({ canvas: { width: 256, height: 240 } }, {
    get: (t, k) => {
      if (k === 'canvas') return t.canvas;
      if (k === 'measureText') return () => ({ width: 10 });   // canvas API returns a TextMetrics
      return noop;                                             // any drawing call / property
    },
    set: () => true,
  });
}

test('overlay draws counter/bubbles/ticker without throwing and mutates no input', () => {
  const overlay = createSocialOverlay(stubCtx());
  const state = Object.freeze({
    online: true, status: 'connected', count: 14,
    bubbles: Object.freeze([Object.freeze({ handle: 'RedKoopa', code: 'GG', born: 0 })]),
    ticker: Object.freeze([Object.freeze({ text: 'P cleared 1-3!', born: 0 })]),
  });
  overlay.draw(state, 1000, 'title');   // frozen state would throw on mutation
  overlay.draw(state, 1000, 'playing');
  assert(true, 'no throw, no mutation');
});

test('overlay draws nothing when offline (still no throw)', () => {
  const overlay = createSocialOverlay(stubCtx());
  overlay.draw(Object.freeze({ online: false, status: 'disconnected', count: 0, bubbles: [], ticker: [] }), 0, 'title');
  assert(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run the suite. Expected: `social-overlay.test.js` ❌ (module missing).

- [ ] **Step 3: Write the implementation**

```js
// src/ui/social-overlay.js
// Draws the social layer on top of the finished world frame. READ-ONLY of the
// social state; never touches world.js. Styling matches the retro HUD.
export function createSocialOverlay(ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;

  function text(str, x, y, color, size = 8, align = 'left') {
    ctx.font = `${size}px monospace`; ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.fillStyle = '#0008'; ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.textAlign = 'left';
  }

  function draw(state, nowMs, gameState) {
    if (!state.online) return;

    // Counter: top-right on the title, tiny corner badge in-game.
    const onTitle = gameState === 'title' || gameState === 'difficultySelect';
    text(`▸ ~${state.count} PLAYING`, onTitle ? W / 2 : W - 4, onTitle ? 4 : 22,
      '#7fe6c8', 8, onTitle ? 'center' : 'right');

    // Callout bubbles: stack up the right edge, fade near end of life.
    let by = 90;
    for (const b of state.bubbles) {
      const age = nowMs - b.born, a = Math.max(0, Math.min(1, 1 - age / 4000));
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      text(`${b.handle}: ${b.code}`, W - 4, by, '#ffd23f', 7, 'right');
      ctx.globalAlpha = 1; by += 11;
    }

    // Ticker: scrolling marquee along the bottom of the title screen.
    if (onTitle && state.ticker.length) {
      const line = state.ticker.map((t) => t.text).join('   •   ');
      ctx.font = '7px monospace'; ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(line).width + 40;
      const x = W - ((nowMs / 30) % tw);
      ctx.fillStyle = '#0007'; ctx.fillRect(0, H - 12, W, 12);
      ctx.fillStyle = '#bcd'; ctx.textAlign = 'left';
      ctx.fillText(line, x, H - 3); ctx.fillText(line, x + tw, H - 3);
    }
  }

  return { draw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the suite. Expected: `social-overlay.test.js` ✅, `FAIL 0`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/social-overlay.js tests/social-overlay.test.js
git commit -m "feat(ui): social overlay — counter, callout bubbles, ticker (read-only)"
```

---

## Task 9: Register new tests in the harness

**Files:**
- Modify: `tests/index.html`

- [ ] **Step 1: Add the imports**

In `tests/index.html`, after the existing `await import('./levels-load.test.js');` line and before `await runAll(...)`, add:

```js
  await import('./schema.test.js');
  await import('./handles.test.js');
  await import('./identity.test.js');
  await import('./transport.test.js');
  await import('./social.test.js');
  await import('./social-overlay.test.js');
```

- [ ] **Step 2: Run the full suite**

Run the suite. Expected: the original 94 plus the new tests, all ✅, `FAIL 0`.

- [ ] **Step 3: Commit**

```bash
git add tests/index.html
git commit -m "test: register social/net test modules in the harness"
```

---

## Task 10: DOM controls + styles

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the social controls markup**

In `index.html`, immediately after the `<button id="mute" …>` line, add:

```html
  <button id="social-toggle" aria-label="Toggle online play">GO ONLINE ▸</button>
  <button id="callout-btn" aria-label="Send a callout" hidden>📣</button>
  <div id="social-handle" hidden><span id="handle-name"></span><button id="reroll" aria-label="New name">⟳</button><button id="reset-id" aria-label="Reset online identity">⌫</button></div>
  <div id="callout-menu" hidden></div>
  <div id="social-notice" hidden>
    <p>Online mode shares a random player ID and handle, your online status, preset callouts, and level-clear or one-up events. No email or free-text chat. Turn it off anytime.</p>
    <button id="notice-ok">Go online</button><button id="notice-cancel">Not now</button>
  </div>
```

- [ ] **Step 2: Add styles**

Styles live in `style.css` (linked from `index.html`), not an inline block. Append to `style.css` (same place `#mute` is styled, `z-index:60` to sit above the canvas):

```css
/* ID rules set display, which overrides the bare [hidden] UA rule; this keeps `hidden` working. */
#social-notice[hidden],#callout-menu[hidden]{display:none}
#social-toggle{position:absolute;top:6px;left:6px;font:8px monospace;background:#16213e;color:#7fe6c8;border:1px solid #3a4a6a;border-radius:6px;padding:4px 6px;z-index:5}
#social-toggle.on{color:#ffd23f;border-color:#ffd23f}
#callout-btn{position:absolute;bottom:6px;right:6px;font-size:18px;background:#16213e;border:1px solid #3a4a6a;border-radius:8px;padding:4px 8px;z-index:5}
#social-handle{position:absolute;top:6px;left:90px;font:8px monospace;color:#bcd;z-index:5}
#social-handle button{font:8px monospace;margin-left:4px}
#callout-menu{position:absolute;bottom:40px;right:6px;display:flex;flex-wrap:wrap;gap:4px;max-width:160px;z-index:6}
#callout-menu button{font:9px monospace;background:#16213e;color:#fff;border:1px solid #3a4a6a;border-radius:6px;padding:4px 6px}
#social-notice{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;background:#000c;color:#fff;font:10px monospace;text-align:center;padding:16px;z-index:10}
#social-notice button{font:10px monospace;padding:6px 10px;margin:0 4px}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): social DOM controls (toggle, callout, handle, consent notice)"
```

---

## Task 11: Wire social into main.js

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add imports + lazy transport factory**

At the top of `src/main.js`, after the existing imports, add:

```js
import { SOCIAL } from './net/config.js';
import { createSocial } from './net/social.js';
import { createNoopTransport } from './net/noop-transport.js';
import { createSocialOverlay } from './ui/social-overlay.js';
import * as handles from './net/handles.js';
import { installationId, resetIdentity } from './net/identity.js';
import { CALLOUTS } from './net/schema.js';
```

- [ ] **Step 2: Initialize social with a swappable transport (default no-op)**

After the `renderer`/`input`/`audio` are created in `src/main.js`, add:

```js
// --- social layer (opt-in; no network until enabled) ---
const identity = { installationId, resetIdentity };
let social = createSocial({ config: SOCIAL, transport: createNoopTransport(), identity, handles });
const socialOverlay = createSocialOverlay(canvas.getContext('2d'));
const ONLINE_KEY = 'pq.online', NOTICE_KEY = 'pq.online.noticed';

async function buildSupabaseSocial() {
  const { createSupabaseTransport } = await import('./net/supabase-transport.js');  // lazy
  return createSocial({ config: SOCIAL, transport: createSupabaseTransport(SOCIAL), identity, handles });
}

async function goOnline() {
  if (!SOCIAL.enabled) return;
  social = await buildSupabaseSocial();
  await social.enable();
  localStorage.setItem(ONLINE_KEY, '1');
  refreshSocialUI(true);
}
async function goOffline() {
  await social.disable();
  social = createSocial({ config: SOCIAL, transport: createNoopTransport(), identity, handles });
  localStorage.setItem(ONLINE_KEY, '0');
  refreshSocialUI(false);
}
```

- [ ] **Step 3: Wire the DOM controls**

Further down in `src/main.js` (near the `#mute` listener), add:

```js
const $ = (id) => document.getElementById(id);
const socialToggle = $('social-toggle'), calloutBtn = $('callout-btn'),
  handleBox = $('social-handle'), handleName = $('handle-name'),
  calloutMenu = $('callout-menu'), notice = $('social-notice');

function refreshSocialUI(on) {
  socialToggle.textContent = on ? 'ONLINE ◂' : 'GO ONLINE ▸';
  socialToggle.classList.toggle('on', on);
  calloutBtn.hidden = !on; handleBox.hidden = !on;
  handleName.textContent = on ? handles.loadHandle() : '';
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
else refreshSocialUI(false);
```

- [ ] **Step 4: Forward existing game events as milestones**

In the `afterFrame()` hook of `src/main.js`, inside the existing `for (const ev of gs.world.drainEvents())` loop, after the existing audio/haptic handling for an event, add:

```js
      if (ev.type === 'flag-reached') social.publishMilestone('level-clear', gs.session.levelIndex + 1);
      else if (ev.type === 'one-up') social.publishMilestone('one-up');
```

- [ ] **Step 5: Draw the overlay after the world**

At the very end of the `render(alpha)` hook in `src/main.js` (after the existing `if/else` that calls the renderer), add:

```js
    socialOverlay.draw(social.getState(), (typeof performance !== 'undefined' ? performance.now() : 0), st);
```

- [ ] **Step 6: Run the full suite + manual sanity**

Run the suite. Expected: `FAIL 0` (wiring adds no unit tests but must not break imports). Then open `http://localhost:8000/` and confirm: title renders, `GO ONLINE ▸` is visible, clicking it shows the consent notice, and the game still plays with social off.

- [ ] **Step 7: Commit**

```bash
git add src/main.js
git commit -m "feat: wire social — consent toggle, callouts, milestone forwarding, overlay draw"
```

---

## Task 12: Update the privacy policy

**Files:**
- Modify: `docs/privacy-policy.html`

- [ ] **Step 1: Replace the "no data" claims**

Replace the summary sentence "it does not collect, store, or share any personal information." and the "Information we collect → None." paragraph with:

```html
  <p>
    Plumber Quest is a single-player game that works fully offline. It has an
    <strong>optional online mode that is OFF by default.</strong> While online
    mode is off, the app collects, stores, and shares nothing.
  </p>

  <h2>Information shared in optional online mode</h2>
  <p>
    If you turn on online mode, the app shares a <strong>random pseudonymous
    player ID and nickname</strong>, your <strong>online status</strong>, the
    <strong>preset callouts</strong> you send, and <strong>level-clear / 1-UP
    events</strong> with other players, via <strong>Supabase</strong> (our
    realtime provider). Supabase processes this plus standard network metadata
    such as your IP address. We do not collect your email, and there is no
    free-text chat. You can turn online mode off at any time from the title
    screen; doing so stops all sharing. Anonymous identifiers are deleted after
    about 30 days of inactivity.
  </p>
```

- [ ] **Step 2: Commit**

```bash
git add docs/privacy-policy.html
git commit -m "docs(privacy): disclose optional online-mode data sharing"
```

---

## Task 13: Update the Play Store data-safety guidance

**Files:**
- Modify: `docs/PLAY_STORE.md`

- [ ] **Step 1: Replace the data-safety line**

Replace the bullet that reads "**Data safety** form (this app collects no data and uses only the INTERNET permission for Capacitor's local server)" with:

```markdown
   - **Data safety** form: the base game collects no data. The **optional,
     default-OFF online mode** shares, only when enabled, a pseudonymous player
     ID + nickname, online status, preset callouts, and level-clear/1-UP events
     via Supabase (which also processes IP/network metadata) — declare these as
     "App activity" and "Device or other IDs," shared with a third party, not
     used for tracking. The INTERNET permission is used both for Capacitor's
     local server and for Supabase Realtime when online mode is on.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PLAY_STORE.md
git commit -m "docs(play-store): data-safety guidance for optional online mode"
```

---

## Task 14: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite green**

Run the suite. Expected: `FAIL 0`, original 94 tests still present, plus all new social/net tests ✅.

- [ ] **Step 2: Determinism unaffected**

Confirm the `determinism: fingerprint matches the recorded golden master` test is still ✅ (social never touches `world.js`).

- [ ] **Step 3: Manual online smoke (two browser tabs)**

With Task 0 values in `config.js`, serve the repo and open `http://localhost:8000/` in two tabs:
- Enable online in both → counter shows `~2` in each (dedupe means same tab twice from one browser may show 1 — open a second browser/profile to see 2).
- Send a callout in tab A → a bubble appears in tab B.
- Clear a level / hit a 1-UP in tab A → its milestone scrolls in tab B's ticker.
- Toggle offline in tab A → its presence drops from tab B's counter; no console network activity continues in tab A (verify in DevTools Network tab: no further requests).
- Reload tab A with online previously on → reconnects with the same handle (session preserved).

- [ ] **Step 4: Offline/degradation sanity**

In `config.js` set `enabled:false`, reload `/` → no social UI network, game identical. Restore `enabled:true`. Then with online OFF, throttle network to offline in DevTools → game still fully playable; toggling online retries with backoff and never blocks gameplay.

- [ ] **Step 5: Commit any config flips back**

```bash
git add -A && git commit -m "chore: finalize social Phase 1 verification" || echo "nothing to commit"
```

---

## Notes for the implementer
- **Do not** import anything from `src/net/*` or `src/ui/social-overlay.js` into `src/game/world.js` or `src/render/renderer.js`. The overlay is drawn from `main.js` only, after the renderer. This preserves determinism and the read-only-render contract.
- The publishable key is safe to commit; never commit a Supabase **secret** key.
- `supabase-transport.js` is the only module without unit tests by design (real network/auth). Keep it thin; put any logic worth testing in `social.js`/`schema.js`.
