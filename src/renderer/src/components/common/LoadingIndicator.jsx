import React, { useEffect, useMemo, useRef } from 'react';
import { Box, useTheme } from '@mui/material';
import { LOADING_SEQUENCE, SAMPLES, sampleShape, pathFromRadii, cubicBezier } from './shapes';

const MORPH_MS = 650; // Expressive slow spatial spring duration (web fallback).
const HOLD_MS = 200; // My design decision: brief rest on each shape so the morph reads.
const ease = cubicBezier(0.39, 1.29, 0.35, 0.98);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * M3 Expressive loading indicator: a shape that morphs through the library sequence while rotating.
 * 48dp container / 38dp active indicator by default (scales with `size`).
 * `contained` puts it on a primary-container circle.
 */
export default function LoadingIndicator({ size = 48, contained = false, color, label = 'Loading' }) {
  const theme = useTheme();
  const c = theme.palette.m3;
  const pathRef = useRef(null);
  const shapes = useMemo(() => LOADING_SEQUENCE.map(sampleShape), []);
  const active = size * (38 / 48);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return undefined;
    if (prefersReducedMotion()) {
      el.setAttribute('d', pathFromRadii(shapes[0], 100));
      return undefined;
    }
    const buffer = new Float32Array(SAMPLES);
    const step = MORPH_MS + HOLD_MS;
    let raf = 0;
    const start = performance.now();
    const frame = (now) => {
      // rAF timestamps can precede the performance.now() captured at setup; clamp to avoid index -1.
      const t = Math.max(0, now - start);
      const index = Math.floor(t / step);
      const local = Math.min(1, (t - index * step) / MORPH_MS);
      const p = ease(local);
      const from = shapes[index % shapes.length];
      const to = shapes[(index + 1) % shapes.length];
      for (let i = 0; i < SAMPLES; i++) buffer[i] = from[i] + (to[i] - from[i]) * p;
      // Constant spin plus an extra quarter-turn that rides on each morph.
      const rotation = (t / 4000) * Math.PI * 2 + (index + p) * (Math.PI / 2);
      el.setAttribute('d', pathFromRadii(buffer, 100, rotation));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [shapes]);

  const fill = color || (contained ? c.onPrimaryContainer : c.primary);

  return (
    <Box
      role="progressbar"
      aria-label={label}
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: contained ? c.primaryContainer : 'transparent',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={contained ? active * 0.78 : active} height={contained ? active * 0.78 : active} viewBox="0 0 100 100" aria-hidden>
        <path ref={pathRef} fill={fill} />
      </svg>
    </Box>
  );
}
