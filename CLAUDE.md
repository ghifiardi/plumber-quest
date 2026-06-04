# Plumber Quest — project guide & session handoff

Original retro 8-bit side-scrolling platformer (Mario-inspired, **100% original assets — never reference "Mario"/Nintendo** in code, copy, or store metadata). Vanilla ES modules, HTML5 Canvas 2D, **zero build step**. Wrapped as a Capacitor app (Android + iOS). Repo root: `~/2026/Project/GAME`.

## How to run things
- **Tests** (in-browser harness, no CLI runner): `bash tools/run-tests.sh` → prints `PASS n / FAIL m` + any `❌`. Needs the shot server on `:8011` (`python3 /tmp/shotsrv.py &` if down). Current baseline: **PASS 138 / FAIL 0**.
- **Web bundle for native:** `npm run sync` (Android) / `npm run sync:ios` (iOS) — assembles `www` then `cap sync`.
- **Open native:** `npm run open:ios` (Capacitor 8 = SPM, opens `App.xcodeproj`, no CocoaPods/workspace). Android Studio for `android/`.
- **Deploy web:** push to `main` → GitHub Pages auto-builds (poll `gh api repos/ghifiardi/plumber-quest/pages/builds/latest`). Live: https://ghifiardi.github.io/plumber-quest/ (short: https://tinyurl.com/plumberquest).
- **Android release:** push tag `v*` → `.github/workflows/android-release.yml` builds signed AAB+APK (artifacts on the run). Watch: `gh run watch <id> --exit-status`.

## Architecture rules (do not break)
- **Deterministic sim** lives in `src/game/*.js` (`world.js`, `tiles.js`, `pickups.js`, `enemies*.js`, `projectiles.js`). It is fixed-timestep (1/60) and has a **golden-master fingerprint test** that must stay green. Never change sim behavior casually; cosmetic event payloads may gain additive fields (e.g. `x,y`) — that doesn't affect the fingerprint.
- **Renderer is read-only of `world`** (`src/render/renderer.js`) — enforced by the `renderer.draw mutates nothing` test. Display-only state (anim clocks, squash, transitions) lives inside the renderer.
- **Cosmetic/overlay layers are event-driven and separate** from the sim: `src/fx/` (particles), `src/ui/social-overlay.js`, `src/net/` (social). Wired only from `src/main.js`.
- **Canvas backbuffer stays 256×240** — only CSS size changes (`src/engine/display.js`, DPR-aware integer scaling). A large backbuffer once froze mobile GPUs; never reintroduce one.
- Workflow process for features: brainstorming → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven implementation → finishing-a-development-branch. The user reviews specs/plans rigorously.

## Backend / infra
- **Online social mode** (opt-in, default OFF): Supabase Realtime (project `incarccrilbeslpympwr`), anon auth + private channels + RLS. `supabase-js` is **bundled locally** at `assets/vendor/supabase-js.js` (esbuild; rebuild cmd in `src/net/config.js`) — not a CDN (App-Store-safe). Publishable key is in `src/net/config.js` (safe to commit).
- iOS bundle id / Android applicationId: `io.github.ghifiardi.plumberquest`. iOS signing team: `GG2FFU8XWF`.

---

## CURRENT STATUS (2026-06-04) — session handoff

**Everything is on `main`** (HEAD `c7dde13`), tests **138/0**. Versions: Android **versionCode 5 / 1.4.0**, iOS **1.4.0 / build 5**. Tag `v1.4.0` pushed.

**Done & shipped:**
- Full game built (6 levels, 3 difficulties, power-ups, koopa/shell, flagpole, fireworks, music, touch controls, haptics).
- Poster-style **animated intro** (running hero, PLAY button, feature pills).
- **Social presence** (opt-in): players-online counter, preset callouts, activity ticker, join/leave notices — live & verified vs real Supabase.
- **Track A — crisp & feel** (just merged): DPR-aware integer crisp rendering + juice (particles, hero squash/stretch, camera look-ahead/ease, hit-stop, transition wipes, optional CRT toggle).
- Web v1.4.0 **deployed live**. Android **v1.4.0 AAB+APK built** (run 26963880941). iOS project **synced with Track A + bumped to 1.4.0/5** on disk.
- CI workflow actions bumped to **Node-24-native** versions (deprecation resolved).
- Social media: 9:16 video at `media/plumber-quest-social.mp4` + bilingual captions (TinyURL + Discord https://discord.gg/AShezFxmB).

**PENDING (next session):**
1. **iOS:** user archives in Xcode (`npm run open:ios` → Product ▸ Archive ▸ Distribute) and uploads v1.4.0. Not yet on App Store.
2. **Play Store:** app not yet published (was mid "Create app"). Needs: upload v1.4.0 AAB, **Data safety form** (per `docs/PLAY_STORE.md` — online mode shares pseudonymous ID + handle + callouts/milestones via Supabase incl. IP; not for tracking), store listing, content rating, privacy-policy URL (host `docs/privacy-policy.html`).
3. **Store listings:** App Store listing drafted in chat; **Play Store short(≤80)/full(≤4000) descriptions NOT yet drafted** (offered). First-release "What's new" (EN+ID) drafted in chat.
4. ⚠️ **`kids-games` app category vs online mode CONFLICT** (set in iOS pbxproj): Apple Kids category bans sharing IDs with third parties (Supabase). Reconsider category or gate online mode before App Store submission.
5. **Closed testing:** Play needs ≥12 testers opted-in 14 days before production (newer personal dev accounts). WhatsApp tester-invite (EN+ID) drafted in chat.

**ROADMAP — remaining "make it more interesting" tracks** (Track A done):
- **B — detail & world themes** (animated tiles, deeper parallax, themed worlds: overworld/underground/sky/castle).
- **C — new mechanics** (moving platforms, springs, checkpoints, conveyors, new enemies/power-ups, maybe a boss).
- **D — more levels & progression** (built from B/C; world-map).
Each gets its own spec → plan → build cycle.
