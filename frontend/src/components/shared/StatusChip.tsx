import type { ReactNode } from 'react';
import type { StatusTone } from './riskTone';

type StatusChipProps = {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
};

export function StatusChip({ children, tone = 'info', className }: StatusChipProps) {
  const dataTone = tone === 'info' ? undefined : tone;
  return (
    <span className={["status-chip", className].filter(Boolean).join(' ')} data-tone={dataTone}>
      {children}
    </span>
  );
}
