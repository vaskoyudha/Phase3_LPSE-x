export type RiskTone = 'high' | 'medium' | 'low' | 'unknown';
export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export const RISK_SOLID_COLORS: Record<Exclude<RiskTone, 'unknown'>, string> = {
  high: '#E05A4F',
  medium: '#D8A42F',
  low: '#4FA66A',
};

export const RISK_SOLID_RGB: Record<Exclude<RiskTone, 'unknown'>, string> = {
  high: '224, 90, 79',
  medium: '216, 164, 47',
  low: '79, 166, 106',
};

const NEUTRAL_RGB = '215, 209, 176';

export function normalizeRiskTone(label?: string | null): RiskTone {
  const normalized = (label ?? '').toLowerCase();
  if (normalized.includes('tinggi') || normalized.includes('high')) return 'high';
  if (normalized.includes('sedang') || normalized.includes('medium')) return 'medium';
  if (normalized.includes('rendah') || normalized.includes('low')) return 'low';
  return 'unknown';
}

export function riskToneColor(tone: RiskTone): string {
  if (tone === 'high') return RISK_SOLID_COLORS.high;
  if (tone === 'medium') return RISK_SOLID_COLORS.medium;
  if (tone === 'low') return RISK_SOLID_COLORS.low;
  return 'var(--lp-gold)';
}

export function riskToneAlpha(tone: RiskTone, alpha: number): string {
  const rgb = tone === 'unknown' ? NEUTRAL_RGB : RISK_SOLID_RGB[tone];
  return `rgba(${rgb}, ${alpha})`;
}

export function riskToneLabel(tone: RiskTone): string {
  if (tone === 'high') return 'Risiko Tinggi';
  if (tone === 'medium') return 'Risiko Sedang';
  if (tone === 'low') return 'Risiko Rendah';
  return 'Perlu Review';
}
