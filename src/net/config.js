// src/net/config.js
// Central config for the social layer. The publishable key is intended for
// client-side use (Supabase), so it is safe to ship in the bundle.

export const SOCIAL = {
  // Hard feature flag: when false, the app never loads any network code.
  enabled: true,

  // From Task 0 — this project's real values:
  supabaseUrl: 'https://incarccrilbeslpympwr.supabase.co',
  supabasePublishableKey: 'sb_publishable_j7xFEURK3h0LQ6chdTZOCg_8VwmvGLY',

  // Self-contained supabase-js bundle (esbuild, pinned 2.107.0), shipped in the
  // app. Loaded lazily only after opt-in. Local (not a CDN) so online mode needs
  // no third-party runtime fetch — required for App Store review + works offline.
  // Rebuild: npx esbuild src/net/_supabase-entry.mjs --bundle --format=esm
  //   --platform=browser --target=es2020 --outfile=assets/vendor/supabase-js.js
  sdkUrl: 'assets/vendor/supabase-js.js',

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
