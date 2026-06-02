// tests/transport.test.js
import { test, assert, assertEqual } from './harness.js';
import { createNoopTransport } from '../src/net/noop-transport.js';
import { createFakeTransport } from '../src/net/fake-transport.js';

test('noop transport satisfies the contract and does nothing', async () => {
  const t = createNoopTransport();
  await t.connect('lobby');
  let got = 0;
  const un = t.subscribe('callout', () => got++);
  t.status(() => {}); t.presence(() => {});
  await t.publish('callout', { x: 1 });
  un();
  await t.disconnect();
  assertEqual(got, 0, 'noop never delivers');
});

test('fake transport loops published messages back to subscribers', async () => {
  const t = createFakeTransport();
  await t.connect('lobby');
  const seen = [];
  t.subscribe('callout', (p) => seen.push(p));
  await t.publish('callout', { hi: 1 });
  assertEqual(seen.length, 1); assertEqual(seen[0].hi, 1);
});

test('fake transport injects inbound + presence snapshots, records disconnect', async () => {
  const t = createFakeTransport();
  const statuses = [], members = [];
  t.status((s) => statuses.push(s));
  t.presence((m) => members.push(m));
  await t.connect('lobby');
  t.__emit('callout', { a: 1 });           // test-only inbound injection
  t.__setPresence([{ iid: 'a' }, { iid: 'a' }, { iid: 'b' }]);
  assert(statuses.includes('connected'), 'status emitted connected');
  assertEqual(members.at(-1).length, 3, 'raw members include dupes (hub dedupes)');
  await t.disconnect();
  assertEqual(t.disconnectCount, 1, 'disconnect recorded');
});
