export function createCamera({ viewW, viewH, bounds }) {
  const cam = { x: 0, y: 0, viewW, viewH, bounds };
  cam.follow = (target) => {
    const b = cam.bounds;                      // read live so reassigning cam.bounds takes effect
    const x = target.x + target.w/2 - viewW/2;
    cam.x = Math.max(b.left, Math.min(x, Math.max(b.left, b.right - viewW)));
    cam.y = 0;
  };
  return cam;
}
