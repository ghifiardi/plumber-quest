// tests/schema.test.js
import { test, assert, assertEqual } from './harness.js';
import { CALLOUTS, MILESTONES, isUuid, escapeText, validateInbound } from '../src/net/schema.js';

const IID = '123e4567-e89b-42d3-a456-426614174000';
const HANDLE = 'SwiftKoopa';

test('isUuid accepts a v4-shaped id and rejects junk', () => {
  assert(isUuid(IID), 'valid uuid accepted');
  assert(!isUuid('nope'), 'junk rejected');
  assert(!isUuid(''), 'empty rejected');
});

test('escapeText strips angle brackets and caps length', () => {
  assertEqual(escapeText('<b>hi</b>'), '&lt;b&gt;hi&lt;/b&gt;');
  assertEqual(escapeText('x'.repeat(50)).length, 16, 'capped to 16');
});

test('validateInbound accepts a well-formed callout', () => {
  const ok = validateInbound({ v: 1, t: 'callout', iid: IID, h: HANDLE, c: 'GG' });
  assert(ok, 'returned a normalized object');
  assertEqual(ok.t, 'callout'); assertEqual(ok.c, 'GG'); assertEqual(ok.iid, IID);
});

test('validateInbound rejects wrong version, unknown enum, bad iid, bad handle', () => {
  assertEqual(validateInbound({ v: 2, t: 'callout', iid: IID, h: HANDLE, c: 'GG' }), null, 'bad version');
  assertEqual(validateInbound({ v: 1, t: 'callout', iid: IID, h: HANDLE, c: 'ZZZ' }), null, 'unknown callout');
  assertEqual(validateInbound({ v: 1, t: 'callout', iid: 'x', h: HANDLE, c: 'GG' }), null, 'bad iid');
  assertEqual(validateInbound({ v: 1, t: 'callout', iid: IID, h: '<script>', c: 'GG' }), null, 'bad handle shape');
});

test('validateInbound accepts a milestone and clamps lvl', () => {
  const ok = validateInbound({ v: 1, t: 'milestone', iid: IID, h: HANDLE, k: 'level-clear', lvl: 3 });
  assert(ok && ok.k === 'level-clear' && ok.lvl === 3);
  assertEqual(validateInbound({ v: 1, t: 'milestone', iid: IID, h: HANDLE, k: 'one-up', lvl: 99 }), null, 'lvl out of range');
  assertEqual(validateInbound({ v: 1, t: 'milestone', iid: IID, h: HANDLE, k: 'high-score' }), null, 'kind not allowed in P1');
});

assert(CALLOUTS.length === 6 && MILESTONES.length === 2, 'enum sizes fixed');
