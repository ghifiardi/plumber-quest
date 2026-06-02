// tests/handles.test.js
import { test, assert, assertEqual } from './harness.js';
import { loadHandle, rerollHandle, HANDLE_KEY } from '../src/net/handles.js';

function clear() { localStorage.removeItem(HANDLE_KEY); }

test('loadHandle generates + persists a valid handle', () => {
  clear();
  const h = loadHandle();
  assert(/^[A-Za-z0-9]{1,16}$/.test(h), `valid: ${h}`);
  assertEqual(localStorage.getItem(HANDLE_KEY), h, 'persisted');
  assertEqual(loadHandle(), h, 'stable across calls');
});

test('rerollHandle changes and persists', () => {
  clear();
  const a = loadHandle();
  let b = a, tries = 0;
  while (b === a && tries++ < 20) b = rerollHandle();
  assert(b !== a, 'reroll produced a different handle');
  assertEqual(localStorage.getItem(HANDLE_KEY), b, 'persisted new handle');
});
