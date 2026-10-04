/**
 * Web approximations of a few M3 Expressive library shapes (the shape library isn't shipped for web).
 * Every shape is a polar function r(θ) sampled at the same number of points, so any two shapes
 * can be morphed by interpolating radii point-by-point.
 */

export const SAMPLES = 120;

const cookie = (n, depth, phase = -Math.PI / 2) => (t) => (1 + depth * Math.cos(n * (t - phase))) / (1 + depth);
const ellipse = (a, b) => (t) => (a * b) / Math.sqrt((b * Math.cos(t)) ** 2 + (a * Math.sin(t)) ** 2);
// Rounded polygon via superellipse-like sharpening of a cosine lobe.
const softPolygon = (n, depth) => (t) => {
  const c = Math.cos(n * (t + Math.PI / 2)) * 0.5 + 0.5; // 0..1, peak at the vertex
  return (1 - depth) + depth * c ** 3;
};

export const SHAPES = {
  circle: () => 1,
  softBurst: cookie(10, 0.07),
  cookie9: cookie(9, 0.1),
  pentagon: softPolygon(5, 0.16),
  pill: ellipse(1, 0.66),
  sunny: cookie(8, 0.12),
  cookie4: cookie(4, 0.14),
  oval: ellipse(0.8, 1),
  clover4: cookie(4, 0.3),
  flower: cookie(8, 0.2),
  cookie12: cookie(12, 0.06),
};

/** Sequence used by the expressive loading indicator. */
export const LOADING_SEQUENCE = ['softBurst', 'cookie9', 'pentagon', 'pill', 'sunny', 'cookie4', 'oval'];

export function sampleShape(name) {
  const fn = SHAPES[name] || SHAPES.circle;
  const radii = new Float32Array(SAMPLES);
  let max = 0;
  for (let i = 0; i < SAMPLES; i++) {
    radii[i] = fn((i / SAMPLES) * Math.PI * 2);
    if (radii[i] > max) max = radii[i];
  }
  // Normalise so every shape fills the same bounding circle (consistent optical size).
  for (let i = 0; i < SAMPLES; i++) radii[i] /= max;
  return radii;
}

/** Smooth closed SVG path through the polar points (Catmull-Rom → cubic Bézier). */
export function pathFromRadii(radii, size, rotation = 0) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2;
  const n = radii.length;
  const pts = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + rotation;
    pts[i] = [cx + Math.cos(t) * radii[i] * R, cy + Math.sin(t) * radii[i] * R];
  }
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Evaluates a CSS cubic-bezier(x1,y1,x2,y2) at progress x (Newton + bisection). */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sx(t) - x;
      const d = dx(t);
      if (Math.abs(err) < 1e-5) return sy(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi && hi - lo > 1e-5) {
      const v = sx(t);
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}
