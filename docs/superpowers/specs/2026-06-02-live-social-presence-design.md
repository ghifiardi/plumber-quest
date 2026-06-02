# Live Social Presence — Design Spec

- **Date:** 2026-06-02
- **Status:** Rev 3 — final review incorporated (Android offline-capable not offline-only, disable stops auth auto-refresh, project-wide ghost budget, privacy/Play-Store doc updates as plan items, Edge-Function revokes direct write, cleanup rotates auth only, pinned/lazy SDK, explicit `noop-transport.js`). Ready for the Phase-1 implementation plan on sign-off.
- **Author:** Ghifi + Claude (brainstorming session)
- **Feature branch:** `feat/live-social-presence`

## 1. Summary

Add lightweight, *moderation-minimized* social presence to Plumber Quest so the
world feels inhabited and players can react to each other — while preserving
the game's defining properties: a deterministic, fully offline-capable,
client-only static site (also shipped as an offline Android app).

(*Moderation-minimized*, not moderation-free: presets remove the **text**
moderation surface, but abuse handling — quota/availability, spoofing,
sign-up abuse — still exists and is addressed in §7.)

We add **presence + preset callouts**, never free-text chat. Identity is an
auto-generated retro handle. The realtime backend is **Supabase Realtime**,
reached directly from the client and wrapped behind a swappable transport
adapter so the game stays provider-agnostic.

### Goals
- Make the game feel alive (others are here now) and reactive (tap to cheer).
- No free-text moderation surface: no arbitrary user text on the wire or on
  screen (abuse handling still exists — see §7).
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
  Phase 1 Supabase-dashboard usage confirms headroom.

## 4. Architecture

Clean adapter-based modules. The game depends only on the `social` hub and the
`RealtimeTransport` interface — never on a concrete provider.

```
src/net/
  transport.js          # RealtimeTransport interface (contract + JSDoc types)
  supabase-transport.js # concrete adapter; LAZILY loads a PINNED supabase-js (only after opt-in)
  noop-transport.js     # does nothing; used when social is disabled or offline
  fake-transport.js     # in-memory loopback adapter for tests only
  handles.js            # auto handle gen + preset reroll lists; localStorage
  identity.js           # persisted installation ID + anon Supabase session
  social.js             # the hub: connect/teardown, validate, queue, expose state
  config.js             # SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY + pinned SDK ver + feature flag
  schema.js             # payload schemas, version constant, enums, validators
src/ui/
  social-overlay.js     # draws counter, callout bubbles, ticker AFTER the world
```

The SDK is **not** in the initial bundle: `supabase-transport.js` dynamically
imports a **version-pinned** supabase-js from CDN only when the player opts in,
so the default offline/solo load stays lean and ships no network code paths.

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
  disconnect(): Promise<void>,             // untrack presence, unsubscribe, remove channel, drop channel auth — KEEP the anon session (§8)
};
```

`fake-transport.js` implements the same contract in-memory (loopback +
scriptable inbound) for tests; `social.js` is written against the interface
only.

## 5. Data model & channels

### 5.1 Channel
- **Phase 1:** one **private** channel `lobby`, with presence keyed by the
  installation ID so multi-tab/reconnect overlap collapses to one member:
  ```js
  supabase.channel('lobby', { config: { private: true, presence: { key: installationId } } })
  ```
  "Playing now" = `Object.keys(channel.presenceState()).length` (distinct
  presence **keys**, not metadata rows).
- **Phase 2:** per-level sharded private channels `ghosts:<level>:<shard>`.

### 5.2 Payload schemas (versioned)
Every payload carries a version so we can evolve safely. Unknown/older versions
are dropped on receive.

```js
const SCHEMA_VERSION = 1;

// callout (broadcast) — iid included for per-sender UI throttling (§7.2)
{ v: 1, t: 'callout', iid: <installationId>, h: <handle>, c: <CalloutCode> }
// milestone (broadcast) — cosmetic only, untrusted
{ v: 1, t: 'milestone', iid: <installationId>, h: <handle>, k: <MilestoneKind>, lvl?: 1..6 }
// presence (tracked state, NOT a broadcast)
{ iid: <installationId>, h: <handle> }
// ghost (Phase 2, broadcast) — designed now, not built
{ v: 1, t: 'ghost', iid: <installationId>, h: <handle>, x: int, y: int, p: <pose>, f: -1|1 }
```

### 5.3 Enums
```js
CALLOUTS      = ['GG', 'NICE', 'LETSGO', 'OOPS', 'WAVE', 'COIN'];
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

**What Phase 1 provides:** server-enforced **authentication** and **topic
access control**, plus client-side UI defenses. **What it does NOT provide:** a
server-side payload-validation or per-user rate-limit boundary. RLS on Realtime
authorizes *channel capabilities at join time* (can this session read/write
broadcast/presence on this topic); it does **not** inspect each broadcast
payload or rate-limit each sender. So an authenticated, modified client can
still send schema-valid spoofed payloads and can still pressure quota/
availability. **Phase 1 accepts that residual quota/availability-abuse risk.**

A hardened version (post-Phase-1, if abuse appears) routes broadcasts through a
**Supabase Edge Function** that validates payloads and enforces **per-user rate
limits**, rather than letting clients broadcast directly.

### 7.1 Server-side authentication & access control (not a payload/rate boundary)
- **Anonymous auth:** `supabase.auth.signInAnonymously()` issues a JWT with no
  PII. The client calls `supabase.realtime.setAuth(token)` before joining.
- **Private channels:** `{ config: { private: true } }` — only authenticated
  sessions may join; gates out anonymous-of-the-internet access.
- **RLS on `realtime.messages`:** policies authorize the `authenticated` role to
  read/write broadcast + presence on the allowed topics (`lobby`, later
  `ghosts:*`). This is **join-time capability control**, not per-message
  validation or rate-limiting.
- **Persisted anonymous session + installation ID:** the supabase-js session is
  persisted in `localStorage` and reused across visits so we mint at most one
  anon user per device (see §12). A separate persisted `installationId` (UUID)
  is the presence key and the per-sender throttle key.

### 7.2 Client-side defense-in-depth (UI safety only)
- Inbound validation: drop payloads whose `v` ≠ supported, whose `t`/enum is
  unknown, whose `iid` is not a valid UUID, whose fields fail type/range checks,
  or whose handle fails the `^[A-Za-z0-9 _-]{1,16}$` shape.
- Escape all displayed strings; hard length caps on everything rendered.
- **Per-sender (by `iid`) UI throttle AND a global inbound rate cap.** Because a
  malicious client can rotate spoofed `iid`s, per-sender throttling alone is
  insufficient — the global cap (drop/coalesce inbound beyond N events/sec
  across all senders) bounds overlay load regardless of ID rotation.
- Bounded queues (§9) so no peer can grow memory or flood the overlay.

These protect the **UI**; they are not the abuse boundary (see the §7 preamble).

### 7.3 Residual risk (accepted, documented)
A determined attacker with a valid anonymous session can publish schema-valid
spoofed callouts/milestones and can pressure Realtime quota; RLS does not stop
this. For a hobby game this is acceptable for Phase 1. Mitigations, in order of
escalation if abuse appears:
1. **Enable invisible Cloudflare Turnstile on anonymous sign-in before public
   launch** — Supabase strongly recommends CAPTCHA for anonymous sign-ins; this
   raises the cost of mass session minting.
2. Move broadcasts behind an **Edge Function** with payload validation +
   per-user rate limits (the real server-side boundary) — and **revoke clients'
   direct broadcast-write RLS permission** so the function is the *only* writer;
   otherwise a modified client just bypasses it.
3. Tighten/segment channels and lean on Supabase dashboard usage + logs (§10) to
   detect and respond.

## 8. Privacy & consent

- **Default OFF on first launch.** No connection, no presence, no sign-in until
  the player opts in.
- The title screen shows a `GO ONLINE ▸` toggle (next to mute). The **first**
  time it is enabled, a one-time notice appears:
  > "Online mode shares a random player ID and handle, your online status,
  > preset callouts, and level-clear or one-up events. No email or free-text
  > chat. Turn it off anytime."
- Preference persisted in `localStorage`.
- **Disable = kill switch (session preserved, zero network):** untrack presence,
  unsubscribe, remove the channel + its auth, and clear all social UI state
  (counter, bubbles, ticker); stop all publishing and receiving. Also **cancel
  reconnect timers and stop Supabase auth auto-refresh**
  (`supabase.auth.stopAutoRefresh()`) so "online off" means *no* background
  network activity. **Keep the persisted anonymous session** — signing out here
  would mint a new anonymous user on every re-enable (§12). Re-enabling
  **restarts auto-refresh before joining** and reconnects cleanly with the same
  identity.
- A separate **"Reset online identity"** action exists for users who want a
  fresh identity: it deletes the local session + handle + installation ID (a new
  anon user is created on the next enable).
- **Identifiers are pseudonymous, not absent.** The handle, player ID, and
  installation ID are random (no email, no free text), but Supabase processes
  these plus network metadata (e.g. IP). The Play Store data-safety disclosure
  must reflect this (see §16).

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

## 10. Local diagnostics (not collected telemetry)

Lightweight counters surfaced **only** to the console and an optional on-screen
debug overlay — they are **not** collected or sent anywhere in Phase 1, so they
cannot themselves verify behavior "in the wild":
- connection count / current `ConnStatus`, reconnect attempts;
- inbound dropped-by-validator, inbound rate-limited (per-sender + global);
- outbound published; current presence size.

**Phase-2 gating uses the Supabase dashboard** (Realtime usage graphs + logs),
not these local counters. Free-tier ceilings to stay under: **100 messages/sec**
and **200 concurrent connections**.

## 11. Phase 2 — Ghost runners (designed, NOT in Phase 1 build)

Kept separate because the cost is quadratic, not linear.

### 11.1 Cost model
Supabase counts one message per **sent** broadcast **plus one per delivery**.
So each sender at `f` Hz in a room of `N` costs `f · (1 + (N−1)) = f · N`
messages/sec (its own send + delivery to `N−1` peers); across all `N` senders
that is **≈ `f · N²` messages/sec** for the room. The free-tier ceiling of
**100 messages/sec is a PROJECT-WIDE cap**, shared across the `lobby` channel,
Presence, **and every ghost shard at once** — not a per-room allowance. Two
shards at 75/s each (150/s) already blow the cap before any lobby/presence
traffic.

| f (Hz) | Players (N) | msgs/sec ≈ |
|---|---|---|
| 10 | 10 | 1000 ❌ |
| 3 | 8 | 192 ❌ |
| 3 | 5 | 75 ✅ |
| 2 | 6 | 72 ✅ |

### 11.2 Required constraints before building ghosts
- **Sampling 2–3 Hz** (not 10), with **client interpolation** to smooth motion.
- **Room cap ≤ 5–6 per shard** and **sharding**: join the least-full shard of
  `ghosts:<level>:<shard>` up to the cap. A single shard at 3 Hz × 5 = 75/s fits,
  but only *one* shard's worth of headroom exists on the free tier.
- **Project-wide message budget**, not per-room: sum `lobby` + Presence + **all
  active ghost shards** and keep the total under the 100 msgs/sec project cap,
  with client-side backpressure (drop frames before exceeding budget). Concurrent
  shards must share the single budget — so shard **discovery and capacity
  allocation across the whole project** is an explicit Phase-2 design item (a paid
  tier or an Edge-Function fan-out is likely required for real concurrency).
- Ghosts ride a **separate channel** from the Phase-1 `lobby` channel.
- Gate the build on Phase-1 Supabase **dashboard usage** showing headroom.

## 12. Anonymous-user cleanup

Supabase creates a user row per `signInAnonymously()` and does **not** delete
them automatically. Mitigations:
- **Reuse** the persisted anon session across visits (don't sign in again if a
  valid session exists) so we mint at most one anon user per device.
- **Age-based cleanup, not activity-based.** Phase 1 keeps no `last_seen`
  column, so the scheduled cleanup (SQL cron / Edge Function) deletes anonymous
  users by creation age — `created_at < now() - interval '30 days'` (the
  Supabase-documented approach) — not by "recent activity."
- **Transparent recovery (rotate auth only):** if a client's persisted session
  belongs to a since-deleted user, it creates a **fresh anonymous session** on
  the next enable. Only the **Supabase auth session** rotates — the local
  **handle and `installationId` are preserved** (so the player keeps their
  identity), unless they explicitly use "Reset online identity." No error
  surfaces to the player.

## 13. Offline-first / graceful degradation

- When the feature flag is off, social is disabled, or there is no network:
  `social.js` uses the **`NoopTransport`**; the game runs identically with no
  errors and the social UI is hidden.
- **Android is offline-capable, not offline-only.** The app keeps working with
  no network exactly as today; online mode functions when the player explicitly
  enables it *and* a network is available. (So the Play Store data-safety
  disclosure is accurate: data is shared only in that opted-in + online state.)
- All transport calls are guarded; connection failures trigger **exponential
  reconnect backoff (1s → 30s, jittered)** and never block or affect gameplay.

## 14. Configuration

`src/net/config.js` (committed):
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` — Supabase's current **publishable key**
  (intended for client-side use; not the legacy `anon` key terminology).
- `SUPABASE_JS_VERSION` + `SUPABASE_JS_URL` — an **exact pinned** supabase-js
  version (no `@latest`), dynamically imported only after opt-in.
- `SOCIAL_ENABLED` feature flag (hard off-switch independent of consent).

## 15. Testing

Via `fake-transport.js` (no real network in tests):
- validator: wrong `v` dropped; unknown callout/milestone enum dropped; invalid
  `iid` (non-UUID) dropped; bad handle shape dropped; oversized fields dropped.
- rate limiting: per-`iid` throttle trips; **global inbound cap** trips even
  when `iid`s are rotated (defeats ID-rotation flooding).
- handle gen/persist + reroll; installation ID persistence; **"reset online
  identity"** clears session + handle + installation ID.
- presence dedupe: two presences sharing one installation-ID key count as one.
- social hub teardown clears all UI state and stops publish/receive (kill
  switch), **cancels reconnect timers, stops auth auto-refresh**, and **retains
  the persisted anon session** (verified via spies on the fake transport).
- `NoopTransport` (the disabled/offline adapter, distinct from the test-only
  `FakeTransport`): the game produces an **identical** determinism fingerprint
  (social never perturbs the sim).
- All existing 94 tests remain green; determinism golden unchanged.

## 16. Decisions resolved in review (was: open items)
- **Callouts:** ship `GG, NICE, LETSGO, OOPS, WAVE, COIN` (dropped `COOL`,
  `ONMYWAY`). (§5.3)
- **Consent copy:** finalized in §8; the same disclosure feeds the **Play Store
  data-safety** section, which must list Supabase processing of pseudonymous
  IDs + network metadata (IP).
- **Diagnostics:** local/console only in Phase 1, **not** collected; Phase-2
  gating uses the Supabase dashboard. (§10)
- **Turnstile:** enable **invisible Cloudflare Turnstile on anonymous sign-in
  before public launch** (Supabase strongly recommends CAPTCHA for anonymous
  sign-ins). (§7.3)
- **Terminology:** "moderation-minimized," not "moderation-free." (§1)

## 17. Documentation & store-listing updates (ship WITH social, not before)

Two existing docs currently assert the app collects/transmits nothing; both
become inaccurate the moment online mode can be enabled. The implementation plan
**must** include updating them in the same change that ships social:

- **`docs/privacy-policy.html`** — today states "it does not collect, store, or
  share any personal information" and "We do not have servers that receive data
  from the app." Revise to disclose: when the player **opts into online mode**,
  the app shares a **pseudonymous player ID + handle, online status, preset
  callouts, and level-clear/one-up events** via **Supabase (a third-party
  processor)**, which also processes connection metadata including **IP
  address**; nothing is shared while online mode is off; how to turn it off; and
  the ~30-day anonymous-user cleanup.
- **`docs/PLAY_STORE.md`** — today says the Data-safety form should declare the
  app "collects no data and uses only the INTERNET permission for Capacitor's
  local server." Update the guidance: the **Data safety form must disclose
  conditional data sharing** (app activity + device/other IDs) when online mode
  is enabled, and that INTERNET is **also** used for Supabase Realtime.

These edits are gated to land **only** alongside the feature (not while the app
still ships without social).

## References
- Realtime getting started / publishable key + private channels:
  https://supabase.com/docs/guides/realtime/getting_started
- Anonymous auth: https://supabase.com/docs/guides/auth/auth-anonymous
- Realtime authorization (RLS authorizes channel capabilities at join time):
  https://supabase.com/docs/guides/realtime/authorization
- Realtime usage accounting (send + per-delivery):
  https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages
- Realtime limits / rate limits (100 msgs/sec, 200 concurrent connections):
  https://supabase.com/docs/guides/realtime/rate-limits
- Google Play data safety form:
  https://support.google.com/googleplay/android-developer/answer/10787469
