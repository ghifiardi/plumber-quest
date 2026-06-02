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
