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
