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
    // Resolve a relative bundle path against the document base (works on web
    // subpaths and in the Capacitor app); pass absolute URLs through as-is.
    const sdk = /^https?:\/\//.test(config.sdkUrl)
      ? config.sdkUrl : new URL(config.sdkUrl, document.baseURI).href;
    const { createClient } = await import(sdk);
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
