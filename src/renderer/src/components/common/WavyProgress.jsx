import React, { useEffect, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * M3 Expressive linear progress indicator, wavy shape, determinate.
 * Active indicator = primary, track = secondary container, 4dp stop indicator at the end.
 * Thickness 4dp; amplitude/wavelength are my design decisions (M3 publishes no values).
 */
export default function WavyProgress({ value = 0, thickness = 4, amplitude = 3, wavelength = 40, label = 'Progress', sx }) {
  const theme = useTheme();
  const c = theme.palette.m3;
  const wrapRef = useRef(null);
  const pathRef = useRef(null);
  const [width, setWidth] = useState(0);
  const height = thickness + amplitude * 2 + 2;
  const gap = 4; // gap between active indicator and track (Expressive style)
  const clamped = Math.max(0, Math.min(100, value));
  const valueRef = useRef(clamped);
  const shownRef = useRef(clamped);
  valueRef.current = clamped;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return undefined;
    const reduced = prefersReducedMotion();
    let raf = 0;
    let last = performance.now();
    const mid = height / 2;
    const frame = (now) => {
      const dt = Math.min(64, now - last);
      last = now;
      // Ease the displayed value toward the target (effects-style, no overshoot).
      shownRef.current += (valueRef.current - shownRef.current) * Math.min(1, dt / 160);
      const end = (shownRef.current / 100) * width;
      const phase = reduced ? 0 : (now / 1000) * wavelength * 0.9;
      const amp = reduced ? 0 : amplitude;
      let d = '';
      const startX = thickness / 2;
      if (end > startX) {
        for (let x = startX; x <= end; x += 2) {
          const y = mid + Math.sin(((x - phase) / wavelength) * Math.PI * 2) * amp;
          d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(2)}`;
        }
      }
      pathRef.current?.setAttribute('d', d);
      const track = pathRef.current?.nextSibling;
      if (track) {
        const trackStart = Math.min(width - thickness / 2, end + gap + thickness);
        track.setAttribute('x1', String(trackStart));
        track.setAttribute('x2', String(width - thickness / 2 - 6));
        track.setAttribute('opacity', trackStart >= width - thickness - 6 ? '0' : '1');
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, amplitude, wavelength, thickness]);

  return (
    <Box
      ref={wrapRef}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      sx={{ width: '100%', height, ...sx }}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
          <path ref={pathRef} fill="none" stroke={c.primary} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" />
          <line y1={height / 2} y2={height / 2} stroke={c.secondaryContainer} strokeWidth={thickness} strokeLinecap="round" />
          <circle cx={width - 2} cy={height / 2} r={2} fill={c.primary} />
        </svg>
      )}
    </Box>
  );
}
