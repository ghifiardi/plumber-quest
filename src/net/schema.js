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
