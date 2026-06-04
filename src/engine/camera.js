// src/engine/camera.js
// Display-time camera: eases toward the player with directional look-ahead.
// follow() is called per RENDERED frame (in renderer.draw), so easing is a fixed
// factor PER CALL (deterministic for a given sequence of calls, not frame-rate
// independent). Never mutates the world. Vertical scroll is unused (levels are
// 240 tall = view height), so cam.y stays 0.
export function createCamera({ viewW, viewH, bounds, lookAhead = 28, ease = 0.12 }) {
  const cam = { x: 0, y: 0, viewW, viewH, bounds };
  function clampX(x) {
    const b = cam.bounds;
    return Math.max(b.left, Math.min(x, Math.max(b.left, b.right - viewW)));
  }
  cam.follow = (target) => {
    const facing = target.facing || 1;
    const desired = clampX(target.x + target.w / 2 - viewW / 2 + facing * lookAhead);
    cam.x = clampX(cam.x + (desired - cam.x) * ease);   // ease, then keep clamped
    cam.y = 0;
  };
  return cam;
}
