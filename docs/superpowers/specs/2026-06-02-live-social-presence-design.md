# Live Social Presence — Design Spec

- **Date:** 2026-06-02
- **Status:** Approved in shape; Phase 1 approved pending the security/cost tightenings captured here.
- **Author:** Ghifi + Claude (brainstorming session)
- **Feature branch:** `feat/live-social-presence`

## 1. Summary

Add lightweight, *moderation-free* social presence to Plumber Quest so the
world feels inhabited and players can react to each other — while preserving
the game's defining properties: a deterministic, fully offline-capable,
client-only static site (also shipped as an offline Android app).

We add **presence + preset callouts**, never free-text chat. Identity is an
auto-generated retro handle. The realtime backend is **Supabase Realtime**,
reached directly from the client and wrapped behind a swappable transport
adapter so the game stays provider-agnostic.

### Goals
- Make the game feel alive (others are here now) and reactive (tap to cheer).
- Zero moderation surface: no arbitrary user text on the wire or on screen.
- Strictly additive: with social off or offline, the game is byte-for-byte the
  experience it is today. Determinism and the existing 94-test suite are
  untouched.

### Non-goals (Phase 1)
- Free-text chat or free-text nicknames.
- Trusted scores / leaderboards (no server to validate them — see §6).
- Ghost runners (Phase 2, gated on a measured Phase-1 baseline — see §11).
- Accounts, friends, profiles, or any PII.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Interaction model | Presence + preset callouts (no free text) |
| Feature set | Counter, callouts, activity ticker (Phase 1); ghost runners (Phase 2) |
| Backend | Managed pub/sub → **Supabase Realtime**, behind a swappable adapter |
| Identity | Auto retro handle + preset reroll, persisted locally (no login) |
| Consent | **Default OFF**, explicit first-run opt-in, full teardown on disable |
| "Playing now" | Distinct **installation IDs** present (dedupe multi-tab/reconnect) |

## 3. Scope & phasing

- **Phase 1 (this spec, ship first):** players-online counter, tap-to-send
  callouts, activity ticker. All three are low-frequency events on a single
  private channel (`lobby`).
- **Phase 2 (separate spec/plan):** ghost runners on per-level sharded
  channels. Data model is designed now so nothing blocks it; build only after
  Phase 1 telemetry confirms headroom.

## 4. Architecture

Clean adapter-based modules. The game depends only on the `social` hub and the
`RealtimeTransport` interface — never on a concrete provider.

```
src/net/
  transport.js          # RealtimeTransport interface (contract + JSDoc types)
  supabase-transport.js # concrete adapter (loads supabase-js from CDN)
  fake-transport.js     # in-memory adapter for tests + offline/no-op
  handles.js            # auto handle gen + preset reroll lists; localStorage
  identity.js           # persisted installation ID + anon Supabase session
  social.js             # the hub: connect/teardown, validate, queue, expose state
  config.js             # SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY + feature flag
  schema.js             # payload schemas, version constant, enums, validators
src/ui/
  social-overlay.js     # draws counter, callout bubbles, ticker AFTER the world
```

**Critical invariant — determinism isolation.** `world.js` (the sim) and its
renderer never read or write network state. The social overlay maintains its
own ephemeral state and renders on top of the finished frame. The determinism
golden and read-only-render tests stay green by construction.

### 4.1 Transport adapter contract

Explicit lifecycle so reconnect, teardown, and the consent kill-switch are
unambiguous. Subscriptions return their own unsubscribe.

```js
/**
 * @typedef {'connecting'|'connected'|'disconnected'|'error'} ConnStatus
 */
const RealtimeTransport = {
  connect(room): Promise<void>,            // sign in (anon) + setAuth + join private channel
  status(handler): () => void,             // handler(ConnStatus); returns unsubscribe
  subscribe(topic, handler): () => void,   // handler(payload); returns unsubscribe
  presence(handler): () => void,           // handler(members[]) snapshot on change; returns unsubscribe
  publish(topic, payload): Promise<void>,  // broadcast on the joined private channel
  disconnect(): Promise<void>,             // untrack presence, leave channel, sign out/teardown
};
```

`fake-transport.js` implements the same contract in-memory (loopback +
scriptable inbound) for tests; `social.js` is written against the interface
only.

## 5. Data model & channels

### 5.1 Channel
- **Phase 1:** one **private** channel `lobby`
  (`supabase.channel('lobby', { config: { private: true } })`).
- **Phase 2:** per-level sharded private channels `ghosts:<level>:<shard>`.

### 5.2 Payload schemas (versioned)
Every payload carries a version so we can evolve safely. Unknown/older versions
are dropped on receive.

```js
const SCHEMA_VERSION = 1;

// callout (broadcast)
{ v: 1, t: 'callout', h: <handle>, c: <CalloutCode> }
// milestone (broadcast) — cosmetic only, untrusted
{ v: 1, t: 'milestone', h: <handle>, k: <MilestoneKind>, lvl?: 1..6 }
// presence (tracked state, NOT a broadcast)
{ iid: <installationId>, h: <handle> }
// ghost (Phase 2, broadcast) — designed now, not built
{ v: 1, t: 'ghost', h: <handle>, x: int, y: int, p: <pose>, f: -1|1 }
```

### 5.3 Enums
```js
CALLOUTS      = ['GG', 'NICE', 'LETSGO', 'ONMYWAY', 'COOL', 'COIN', 'OOPS', 'WAVE'];
MILESTONES    = ['level-clear', 'one-up'];   // score & high-score intentionally excluded — see §6
```

Callouts and milestones are fed from events the game **already emits** in
`main.js`'s `afterFrame` drain (`flag-reached`/level-clear, `one-up`), so the
publisher is a thin tap on the existing event stream.

## 6. Milestones are cosmetic and untrusted

There is no server to validate gameplay, so any milestone is spoofable. We
therefore treat milestones as pure social flavor:

- **Phase 1 milestones are limited to `level-clear` and `one-up`.**
- **`score` and `high-score` are excluded from Phase 1.** A forged "new high
  score: 999999" is both misleading and a griefing vector; surfacing scores
  requires a server (or Supabase Edge Function + RLS-guarded table) to validate
  and is deferred.
- The ticker copy is phrased as ambient flavor ("PLUMBER-A37 cleared 1-3!"),
  never as an authoritative record.

## 7. Security & abuse model

**The abuse boundary is server-enforced, not client-enforced.** Client
validation is defense-in-depth for the *UI*, explicitly *not* the quota/abuse
boundary.

### 7.1 Server-side boundary (the real one)
- **Anonymous auth:** `supabase.auth.signInAnonymously()` issues a JWT with no
  PII. The client calls `supabase.realtime.setAuth(token)` before joining.
- **Private channels:** `{ config: { private: true } }` — only authenticated
  sessions may join.
- **RLS on `realtime.messages`:** policies restrict read/write of broadcast +
  presence to the `authenticated` role and to the allowed topics
  (`lobby`, later `ghosts:*`). This stops anonymous-of-the-internet writes and
  forces every publisher through an auth'd session.
- **Persisted anonymous session + installation ID:** the supabase-js session is
  persisted in `localStorage` and reused across visits so we do **not** mint a
  fresh anonymous user every load (see §12 cleanup). A separate persisted
  `installationId` (UUID) is the presence key and the per-sender throttle key.

### 7.2 Client-side defense-in-depth (UI safety)
- Inbound validation: drop payloads whose `v` ≠ supported, whose `t`/enum is
  unknown, whose fields fail type/range checks, or whose handle fails the
  `^[A-Za-z0-9 _-]{1,16}$` shape.
- Escape all displayed strings; hard length caps on everything rendered.
- Per-sender (by `iid`) UI rate-limiting + bounded queues (§9) so a misbehaving
  peer cannot flood the overlay.

### 7.3 Residual risk (accepted, documented)
A determined attacker holding a valid anonymous session can still publish
schema-valid spoofed callouts/milestones within RLS limits. For a hobby game
this is acceptable. Mitigations if abuse appears: tighten RLS/rate context, add
**Cloudflare Turnstile to anonymous sign-in** (Supabase-supported), and lean on
telemetry (§10) to detect it.

## 8. Privacy & consent

- **Default OFF on first launch.** No connection, no presence, no sign-in until
  the player opts in.
- The title screen shows a `GO ONLINE ▸` toggle (next to mute). The **first**
  time it is enabled, a one-time notice appears:
  > "Online play shares a random nickname and level milestones with other
  > players. No account, no personal data. You can turn this off anytime."
- Preference persisted in `localStorage`.
- **Disable = full kill switch:** `disconnect()` (untrack presence, leave
  channel, sign out / drop session auth), clear all social UI state (counter,
  bubbles, ticker), and stop all publishing and receiving. Re-enabling
  reconnects cleanly.
- No PII anywhere: handle is random, IDs are random UUIDs, all local.

## 9. UX & retro styling

All social UI is rendered by `social-overlay.js` **after** the world frame, in
the game's existing pixel/monospace aesthetic.

- **Counter:** `▸ ~14 PLAYING NOW` on the title (and a tiny corner badge
  in-game). "~" signals it is approximate (distinct installation IDs).
- **Callouts:** a small 📣 touch button + desktop key `C` open a one-tap row of
  the preset callouts. Incoming callouts float in as pixel **speech-bubble
  banners** that fade — same cosmetic spirit as existing score popups.
- **Ticker:** a thin scrolling marquee along the bottom of the title screen.
- **Handle:** shown on the title with a reroll `⟳` button + preset picker
  (adjective+noun lists from `handles.js`).
- **Bounded queues:** ticker = ring buffer of last **20**; on-screen callout
  bubbles = max **5** concurrent (drop oldest). Prevents unbounded growth and
  flooding.

## 10. Telemetry (privacy-safe, client-side)

Lightweight counters surfaced to console and an optional debug overlay (no
PII, no network beacon in Phase 1):
- connection count / current `ConnStatus`, reconnect attempts;
- inbound dropped-by-validator, inbound rate-limited;
- outbound published; current presence size.

These verify the cost model in the wild and are the trigger data for enabling
Phase 2.

## 11. Phase 2 — Ghost runners (designed, NOT in Phase 1 build)

Kept separate because the cost is quadratic, not linear.

### 11.1 Cost model
Supabase counts one message per **sent** broadcast **plus one per delivery**.
In a room of `N` players each sampling at `f` Hz, throughput ≈ `f · N · (N−1)`
messages/sec. The current free-tier ceiling is **100 messages/sec**.

| f (Hz) | N | msgs/sec ≈ |
|---|---|---|
| 10 | 10 | 900 ❌ |
| 3 | 8 | 168 ❌ |
| 3 | 5 | 60 ✅ |
| 2 | 6 | 60 ✅ |

### 11.2 Required constraints before building ghosts
- **Sampling 2–4 Hz** (not 10), with **client interpolation** to smooth motion.
- **Room cap** (~5–6 per shard) and **sharding**: join the least-full shard of
  `ghosts:<level>:<shard>` up to the cap.
- **Explicit per-room message budget** kept under the tier ceiling, with
  client-side backpressure (drop frames before exceeding budget).
- Ghosts ride a **separate channel** from the Phase-1 `lobby` channel.
- Gate the build on Phase-1 telemetry showing headroom.

## 12. Anonymous-user cleanup

Supabase creates a user row per `signInAnonymously()` and does **not** delete
them automatically. Mitigations:
- **Reuse** the persisted anon session across visits (don't sign in again if a
  valid session exists) so we mint at most one anon user per device.
- Provide a **scheduled cleanup** (SQL cron / Edge Function) deleting anonymous
  users with no recent activity older than ~30 days (configurable). Documented
  as an operational task, included in the implementation plan.

## 13. Offline-first / graceful degradation

- With the feature flag off, social disabled, no network, or in the offline
  Android app: `social.js` uses a no-op path; the game runs identically with no
  errors and the social UI is hidden.
- All transport calls are guarded; connection failures trigger **exponential
  reconnect backoff (1s → 30s, jittered)** and never block or affect gameplay.

## 14. Configuration

`src/net/config.js` (committed):
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` — Supabase's current **publishable key**
  (intended for client-side use; not the legacy `anon` key terminology).
- `SOCIAL_ENABLED` feature flag (hard off-switch independent of consent).

## 15. Testing

Via `fake-transport.js` (no real network in tests):
- validator: wrong `v` dropped; unknown callout/milestone enum dropped;
  bad handle shape dropped; oversized fields dropped; per-`iid` rate-limit trips.
- handle gen/persist + reroll; installation ID persistence.
- social hub teardown clears all UI state and stops publish/receive (kill
  switch).
- NoopTransport path: the game produces an **identical** determinism
  fingerprint (social never perturbs the sim).
- All existing 94 tests remain green; determinism golden unchanged.

## 16. Open items for spec review
1. Callout enum contents/wording (§5.3) — final list OK?
2. Consent copy (§8) — wording OK for the Play Store listing too?
3. Telemetry: console-only in Phase 1 (no beacon) — acceptable?

## References
- Realtime getting started / publishable key + private channels:
  https://supabase.com/docs/guides/realtime/getting_started
- Anonymous auth: https://supabase.com/docs/guides/auth/auth-anonymous
- Realtime authorization (RLS on `realtime.messages`):
  https://supabase.com/docs/guides/realtime/authorization
- Realtime usage accounting:
  https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages
- Realtime limits: https://supabase.com/docs/guides/realtime/limits
