// Pure output-resolution logic for Ditherland's export size selector.
// Anchors the LONGER side to the target (2K = 2560, 4K = 3840), aspect preserved.
// 'native' keeps the source dims untouched (current behavior). No DOM here → unit-testable.

export const RES_LONG_EDGE = { '2k': 2560, '4k': 3840 };

export function outputSize(srcW, srcH, mode = 'native') {
  if (!(srcW > 0) || !(srcH > 0)) return [0, 0];
  const target = RES_LONG_EDGE[mode];
  if (!target) return [srcW, srcH]; // native / unknown
  const s = target / Math.max(srcW, srcH);
  return [Math.max(1, Math.round(srcW * s)), Math.max(1, Math.round(srcH * s))];
}
