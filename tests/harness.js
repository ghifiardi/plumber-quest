const cases = [];
export function test(name, fn) { cases.push({ name, fn }); }

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}
export function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg || `expected ${expected}, got ${actual}`);
}
export function assertClose(actual, expected, eps = 1e-6, msg) {
  if (Math.abs(actual - expected) > eps) throw new Error(msg || `expected ~${expected}, got ${actual}`);
}
export function assertThrows(fn, msg = 'expected throw') {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg);
}
export function assertDeepEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(msg || `not deep-equal:\n  ${JSON.stringify(a)}\n  ${JSON.stringify(b)}`);
  }
}

export async function runAll(rootEl) {
  let pass = 0, fail = 0;
  const lines = [];
  for (const c of cases) {
    try { await c.fn(); pass++; lines.push(`  ✅ ${c.name}`); }
    catch (e) { fail++; lines.push(`  ❌ ${c.name} — ${e.message}`); }
  }
  const summary = `PASS ${pass} / FAIL ${fail}`;
  const out = `${summary}\n${lines.join('\n')}`;
  if (rootEl) rootEl.textContent = out;
  console.log(out);
  return { pass, fail };
}
