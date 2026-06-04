// src/engine/display.js
// Pure DPR-aware integer display sizing. The canvas BACKBUFFER stays 256x240
// (set elsewhere); this only computes the CSS size so the backbuffer composites
// to an EXACT integer number of device pixels => crisp, no shimmer, no large buffer.
export function computeDisplay(vw, vh, dpr, isTouch, logicalW = 256, logicalH = 240) {
  const d = Math.max(1, Math.min(4, dpr || 1));            // cap dpr for perf
  const band = isTouch ? Math.min(170, Math.round(vh * 0.26)) : 0;
  const availH = Math.max(1, vh - band);
  const scaleDevice = Math.max(1, Math.floor(Math.min((vw * d) / logicalW, (availH * d) / logicalH)));
  return { scaleDevice, band, cssW: (logicalW * scaleDevice) / d, cssH: (logicalH * scaleDevice) / d };
}
