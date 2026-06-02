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
