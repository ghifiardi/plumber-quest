// src/engine/hitstop.js
// Real-time-only freeze for impact. NOT part of the sim (the golden master calls
// gs.update directly, so this can never affect determinism).
export function createHitstop() {
  let frames = 0;
  return {
    trigger(n) { if (n > frames) frames = n; },     // take the max; don't stack
    step() { if (frames > 0) { frames--; return true; } return false; },  // true => SKIP this sim step
    active() { return frames > 0; },
  };
}
