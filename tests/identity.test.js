// tests/identity.test.js
import { test, assert, assertEqual } from './harness.js';
import { installationId, resetIdentity, IID_KEY } from '../src/net/identity.js';
import { isUuid } from '../src/net/schema.js';
import { HANDLE_KEY } from '../src/net/handles.js';

test('installationId is a persisted uuid, stable across calls', () => {
  localStorage.removeItem(IID_KEY);
  const a = installationId();
  assert(isUuid(a), `uuid: ${a}`);
  assertEqual(installationId(), a, 'stable');
  assertEqual(localStorage.getItem(IID_KEY), a, 'persisted');
});

test('resetIdentity clears iid + handle (auth session handled elsewhere)', () => {
  installationId(); localStorage.setItem(HANDLE_KEY, 'RedKoopa');
  resetIdentity();
  assertEqual(localStorage.getItem(IID_KEY), null, 'iid cleared');
  assertEqual(localStorage.getItem(HANDLE_KEY), null, 'handle cleared');
});
