import { BookOpen, CircleHelp, FileText, Home, LayoutDashboard, Settings } from 'lucide-react';
import type { ReactNode } from 'react';

type UtilityPageProps = {
  kind: 'reports' | 'settings' | 'help' | 'not-found';
  onNavigate: (href: string) => void;
};

const copy = {
  reports: {
    icon: FileText,
    eyebrow: 'Reports',
    title: 'Reports Center',
    body: 'Ringkasan ekspor lokal dan bukti audit tersedia tanpa cloud call, live scraping, atau retraining.',
  },
  settings: {
    icon: Settings,
    eyebrow: 'Settings',
    title: 'Local Demo Settings',
    body: 'Konfigurasi demo menjaga mode offline, artefak model tunggal, dan guardrail human-review tetap terlihat.',
  },
  help: {
    icon: CircleHelp,
    eyebrow: 'Help',
    title: 'Help & Guardrails',
    body: 'Gunakan dashboard untuk triase risiko dan prioritas review; hasil bukan tuduhan pelanggaran dan wajib ditinjau manusia.',
  },
  'not-found': {
    icon: BookOpen,
    eyebrow: 'Not Found',
    title: 'Halaman tidak ditemukan',
    body: 'Rute frontend ini tidak tersedia. Pilih Home atau Dashboard untuk kembali ke demo lokal.',
  },
} as const;

export function UtilityPage({ kind, onNavigate }: UtilityPageProps) {
  const item = copy[kind];
  const Icon = item.icon;
  return (
    <main className="page-shell utility-page" aria-labelledby={`${kind}-title`}>
      <section className="card utility-page__card">
        <span className="badge"><Icon size={14} /> {item.eyebrow}</span>
        <h2 id={`${kind}-title`}>{item.title}</h2>
        <p>{item.body}</p>
        <p className="safe-copy">Output LPSE-X adalah triase risiko dan prioritas review; bukan tuduhan pelanggaran.</p>
        <div className="utility-page__actions">
          <RouteButton href="/home" onNavigate={onNavigate}><Home size={16} /> Home</RouteButton>
          <RouteButton href="/dashboard/overview" onNavigate={onNavigate}><LayoutDashboard size={16} /> Dashboard</RouteButton>
        </div>
      </section>
    </main>
  );
}

function RouteButton({ href, onNavigate, children }: { href: string; onNavigate: (href: string) => void; children: ReactNode }) {
  return <a className="btn-secondary" href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }}>{children}</a>;
}
