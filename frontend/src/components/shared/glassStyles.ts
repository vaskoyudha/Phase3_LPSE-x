import type { CSSProperties } from 'react';

export const glassBlur = 'blur(14px) saturate(1.08)';

export const glassControlSurface: CSSProperties = {
  border: '1px solid var(--lp-glass-control-border)',
  background: 'var(--lp-glass-control)',
  boxShadow: 'var(--lp-glass-shadow)',
  backdropFilter: glassBlur,
  WebkitBackdropFilter: glassBlur,
};

export const glassSubtleSurface: CSSProperties = {
  border: '1px solid var(--lp-glass-control-border-subtle)',
  background: 'var(--lp-glass-control-subtle)',
  boxShadow: 'var(--lp-glass-shadow-soft)',
  backdropFilter: glassBlur,
  WebkitBackdropFilter: glassBlur,
};

export const glassCreamSurface: CSSProperties = {
  border: '1px solid var(--lp-glass-cream-border)',
  background: 'var(--lp-glass-cream)',
  boxShadow: 'var(--lp-glass-shadow)',
  backdropFilter: glassBlur,
  WebkitBackdropFilter: glassBlur,
};

export const glassWhiteSurface: CSSProperties = {
  border: '1px solid var(--lp-glass-white-border)',
  background: 'var(--lp-glass-white)',
  boxShadow: 'var(--lp-glass-shadow)',
  backdropFilter: glassBlur,
  WebkitBackdropFilter: glassBlur,
};

export const glassCreamIcon: CSSProperties = {
  ...glassCreamSurface,
  color: 'var(--lp-bg-deep)',
};

export const glassSoftIcon: CSSProperties = {
  ...glassControlSurface,
  color: 'var(--lp-text-soft)',
};
