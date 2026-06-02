import { FIXED_DT } from './constants.js';

// beforeFrame() runs once per rendered frame BEFORE any fixed steps (e.g. input.beginFrame()).
// afterFrame(stepCount) runs once AFTER all fixed steps (e.g. drain world events → audio).
// render(alpha) runs last with the true interpolation alpha in [0,1).
export function createLoop({ beforeFrame, step, afterFrame, render, maxSteps = 5, dt = FIXED_DT }) {
  let acc = 0;
  function advance(realDt) {
    acc += realDt;
    if (beforeFrame) beforeFrame();            // before stepping, even on 0-step frames
    let n = 0;
    while (acc >= dt && n < maxSteps) { step(); acc -= dt; n++; }
    if (n === maxSteps) acc = 0;               // drop backlog after clamp
    if (afterFrame) afterFrame(n);             // after all steps, even on 0-step frames
    render(acc / dt);                          // real interpolation alpha
  }
  function start(rafProvider = requestAnimationFrame) {
    let last = null;
    const frame = (t) => {
      // Guard the per-frame work so a single error can never permanently freeze the
      // game: log it and keep scheduling frames (rafProvider always runs).
      try { if (last != null) advance(Math.min((t - last) / 1000, 0.25)); }
      catch (err) { try { console.error('[loop] frame error (continuing):', err); } catch {} }
      last = t;
      rafProvider(frame);
    };
    rafProvider(frame);
  }
  return { advance, start };
}
