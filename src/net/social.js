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
