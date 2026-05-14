import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

type AppTopbarProps = {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  chips?: ReactNode;
};

export function AppTopbar({
  title = 'LPSE-X Command Center',
  subtitle,
  eyebrow = 'LPSE-X',
  actions,
  chips,
}: AppTopbarProps) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <BrandMark size={42} compact />
        <div>
          <p className="brand-subtitle" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{eyebrow}</p>
          <h1 className="brand-title">{title}</h1>
          {subtitle && <p className="brand-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="topbar-actions">
        {chips}
        {actions}
      </div>
    </header>
  );
}
