import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import {
  Archive,
  ChartBar,
  BookOpen,
  CheckCircle,
  ClipboardText,
  Database,
  Eye,
  Gauge,
  MagnifyingGlass,
  ShieldCheck,
  XCircle,
} from '@phosphor-icons/react';
import type { DemoState } from '../types/api';
import { GuardrailBanner } from '../components/shared/GuardrailBanner';
import { StaticBundleStatus } from '../components/shared/StaticBundleStatus';
import aiConnectLogo from '../assets/brand/AiConnect.png';
import dtetiLogo from '../assets/brand/DTETI.png';
import findItLogo from '../assets/brand/FINDIT.png';
import ugmLogo from '../assets/brand/ugm.png';

type LandingPageProps = {
  demoState: DemoState;
  onOpen: () => void;
  onOpenCasebook?: () => void;
  onNavigate?: (href: string) => void;
};

const stakes = [
  'Rp 1.214 T belanja pengadaan/tahun',
  '1,1 juta jejak digital SPSE',
  '70% kasus KPK berasal dari celah pengadaan',
  '<1% tender yang sempat diaudit',
];

const scoreFactors = [
  'Deviasi harga +2.3σ vs. histori buyer',
  'Pasangan buyer-supplier berulang: 8 menang dari 10 tender',
  'Q4 + Desember: musiman risiko',
];

const trackConstraints = [
  { code: 'C-C1', claim: 'Explainability wajib', artifact: 'SHAP global + lokal' },
  { code: 'C-C2', claim: 'Human-readable', artifact: 'Narasi Bahasa Indonesia per prediksi' },
  { code: 'C-C3', claim: 'Anti-black-box', artifact: 'XGBoost tabular yang dapat diinspeksi' },
  { code: 'C-C4', claim: 'Anti-leakage', artifact: 'Raw split sebelum feature engineering' },
  { code: 'C-C5', claim: 'Offline total', artifact: 'Tidak ada API cloud, tidak ada generative AI' },
];

const proofBlocks = [
  {
    icon: <Database size={22} weight="fill" />,
    label: 'Skala Data',
    title: 'Cakupan benchmark',
    metric: '465.184',
    metricLabel: 'baris usable',
    items: [
      '465.184 baris usable',
      '372.150 train · 93.034 test',
      '618 buyer unik · 60.976 supplier unik',
      'Rentang data: Jul 2015 → Des 2023',
    ],
  },
  {
    icon: <Gauge size={22} weight="fill" />,
    label: 'Akurasi Model',
    title: 'Performa pada held-out test',
    metric: '0,9830',
    metricLabel: 'Macro-F1 held-out',
    items: [
      'Accuracy 0,9899 · Macro-F1 0,9830',
      'F1 High Risk 0,9639',
      'External validation lintas tahun: mean Macro-F1 0,9151',
    ],
  },
  {
    icon: <ClipboardText size={22} weight="fill" />,
    label: 'Nilai Operasional',
    title: 'Yang berbicara untuk auditor',
    metric: '1,00',
    metricLabel: 'Precision@50/100/500',
    items: [
      'Precision@50 = Precision@100 = Precision@500 = 1,00',
      'Manual review agreement: 95,8%',
      'Menjawab: paket mana yang perlu dibaca lebih dulu?',
    ],
  },
];

const honestyClaims = [
  {
    icon: <XCircle size={18} weight="fill" />,
    title: 'Bukan putusan akhir',
    body: 'Output adalah prioritas review, bukan tuduhan.',
  },
  {
    icon: <XCircle size={18} weight="fill" />,
    title: 'Bukan ground-truth fraud',
    body: 'Label adalah heuristic risk labels, bukan putusan pengadilan.',
  },
  {
    icon: <XCircle size={18} weight="fill" />,
    title: 'Bukan oracle',
    body: 'Saat fitur proksi dihapus, Macro-F1 turun dari 0,983 ke 0,505 dan kami laporkan apa adanya.',
  },
  {
    icon: <CheckCircle size={18} weight="fill" />,
    title: 'Yang kami janjikan',
    body: 'Ranking yang leakage-safe, explainable, dan dapat dipertanggungjawabkan.',
  },
];

const pipeline = [
  'Ingest OCDS',
  'Split raw anti-leakage',
  'Feature engineering split-aware',
  'Heuristic risk labels',
  'XGBoost + temperature scaling',
  'SHAP + narasi Bahasa Indonesia',
];

const userRoles = [
  {
    icon: <MagnifyingGlass size={22} weight="bold" />,
    title: 'Auditor / Reviewer',
    body: 'Daftar prioritas dan alasan ringkas tiap paket agar waktu review masuk ke kasus yang paling perlu dibaca.',
  },
  {
    icon: <Eye size={22} weight="bold" />,
    title: 'Supervisor',
    body: 'Backlog, status tindak lanjut, dan gambaran unit mana yang membutuhkan kapasitas review tambahan.',
  },
  {
    icon: <Archive size={22} weight="bold" />,
    title: 'Tim tata kelola data',
    body: 'Audit trail, manifest fitur, artefak model, dan batasan data yang jelas untuk pemeriksaan ulang.',
  },
  {
    icon: <ChartBar size={22} weight="bold" />,
    title: 'Pengambil keputusan',
    body: 'KPI operasional dan dampak agregat tanpa mengubah skor model menjadi putusan final.',
  },
];

const institutionLogos = [
  { src: findItLogo, alt: 'FIND IT 2026' },
  { src: aiConnectLogo, alt: 'Ai Connect' },
  { src: dtetiLogo, alt: 'DTETI' },
  { src: ugmLogo, alt: 'Universitas Gadjah Mada' },
];

const dataSourceFacts = [
  {
    label: 'Sumber publik',
    title: 'Publikasi data OCDS Indonesia',
    body: 'Benchmark dibangun dari artefak lokal hasil olahan publikasi data pengadaan Indonesia dalam format OCDS, bukan data simulasi buatan.',
  },
  {
    label: 'Jejak asal data',
    title: 'data/processed/data_provenance.json',
    body: 'Proposal menempatkan file ini sebagai sumber provenance utama untuk menelusuri asal artefak yang dipakai eksperimen.',
  },
  {
    label: 'Batas evaluasi',
    title: 'data/processed/split_metadata.json',
    body: 'Metadata split menjelaskan pemisahan raw train dan test sebelum feature engineering untuk menjaga evaluasi anti-leakage.',
  },
];

export function LandingPage({ demoState, onOpen, onOpenCasebook, onNavigate }: LandingPageProps) {
  const casebookAction = onOpenCasebook ?? onOpen;
  const goTo = (href: string) => (event: MouseEvent) => {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(href);
  };
  const openRobustness = () => document.getElementById('audit-robustness')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main className="landing-shell" style={styles.shell}>
      <section className="landing-hero" style={styles.hero}>
        <div style={styles.heroContent}>
          <h1 style={styles.title}>
            LPSE-X
            <span style={styles.titleAccent}>Command Center</span>
          </h1>
          <p style={styles.subtitle}>Triase Risiko Pengadaan yang Bisa Dijelaskan</p>
          <p style={styles.description}>
            Dari jejak digital SPSE menuju prioritas review yang transparan: model tetap, inferensi offline,
            SHAP lokal-global, dan narasi Bahasa Indonesia untuk reviewer manusia.
          </p>

          <section style={styles.stakesStrip} aria-label="Skala masalah pengadaan">
            <div className="landing-risk-grid" style={styles.stakesGrid}>
              {stakes.map((item) => <strong key={item} style={styles.stakeItem}>{item}</strong>)}
            </div>
            <p style={styles.stakesCaption}>Datanya sudah ada. Yang kurang adalah triase yang bisa dijelaskan.</p>
          </section>

          <div style={styles.actions}>
            <button onClick={onOpen} style={styles.primaryBtn}>
              <ShieldCheck size={20} weight="fill" />
              <span>
                <strong style={{ display: 'block' }}>Buka Command Center</strong>
                <small style={styles.primaryBtnHint}>Lihat antrian triase risiko</small>
              </span>
            </button>
            <button onClick={casebookAction} style={styles.secondaryBtn}>
              <BookOpen size={20} weight="fill" />
              <span>
                <strong style={{ display: 'block' }}>Lihat Casebook Demo</strong>
                <small style={styles.secondaryBtnHint}>Baca dossier explainable</small>
              </span>
            </button>
            <button onClick={openRobustness} style={styles.tertiaryBtn}>
              <Gauge size={20} weight="fill" />
              <span>
                <strong style={{ display: 'block' }}>Lihat Audit Robustness</strong>
                <small style={styles.secondaryBtnHint}>Trade-off 0,983 → 0,505</small>
              </span>
            </button>
          </div>
          {onNavigate && (
            <p style={styles.authRow}>
              <span style={styles.authRowLabel}>Sudah menjadi auditor?</span>
              <a href="/login" onClick={goTo('/login')} style={styles.authRowLink}>Masuk</a>
              <span style={styles.authRowDivider} aria-hidden="true">·</span>
              <a href="/register" onClick={goTo('/register')} style={styles.authRowLink}>Buat akun</a>
            </p>
          )}
        </div>
      </section>

      <section className="landing-score-section" style={styles.scoreSection}>
        <div style={styles.scoreSectionCopy}>
          <span style={styles.sectionEyebrow}>Output yang dilihat reviewer</span>
          <h2 style={styles.scoreSectionTitle}>Satu skor tidak cukup. Auditor perlu alasan yang bisa dibaca.</h2>
          <p style={styles.scoreSectionDesc}>
            Contoh ini menunjukkan format explain_single: skor, minimal tiga faktor utama, dan narasi singkat
            yang menjaga hasil sebagai prioritas review, bukan tuduhan pelanggaran.
          </p>
        </div>
        <aside style={styles.scoreCard} aria-label="Anatomi satu skor risiko">
          <div style={styles.scoreCardTop}>
            <span style={styles.scoreEyebrow}>Anatomi Satu Skor</span>
            <span style={styles.scorePackage}>PAKET #2381 · Pengadaan Konstruksi</span>
          </div>
          <div style={styles.scoreMetricRow}>
            <span style={styles.scoreMetricLabel}>Skor risiko</span>
            <strong style={styles.scoreMetric}>0,87</strong>
            <span style={styles.scoreRisk}>HIGH RISK</span>
          </div>
          <div style={styles.factorPanel}>
            <span style={styles.factorTitle}>Tiga faktor utama</span>
            {scoreFactors.map((factor) => (
              <p key={factor} style={styles.factorItem}>
                <span style={styles.factorArrow}>↑</span>
                {factor}
              </p>
            ))}
          </div>
          <blockquote style={styles.scoreNarrative}>
            “Paket ini diprioritaskan karena nilai jauh di atas histori buyer dan didominasi oleh supplier yang sama.”
          </blockquote>
          <p style={styles.scoreFootnote}>Output explain_single: minimal 3 faktor + narasi yang bisa dibaca reviewer.</p>
        </aside>
      </section>

      <section className="landing-source-section" style={styles.sourceSection}>
        <div style={styles.sourceCopy}>
          <span style={styles.sectionEyebrow}>Sumber data</span>
          <h2 style={styles.sourceTitle}>Benchmark berasal dari publikasi data OCDS Indonesia yang diproses lokal.</h2>
          <p style={styles.sourceDesc}>
            Landing page ini tidak memakai angka tanpa asal. Proposal menyatakan data kerja berasal dari artefak OCDS
            yang telah diproses lokal, dengan benchmark 465.184 baris usable dari rentang Juli 2015 sampai Desember 2023.
          </p>
        </div>
        <div style={styles.sourceLedger} aria-label="Rujukan sumber data LPSE-X">
          {dataSourceFacts.map((item, index) => (
            <article key={item.title} style={styles.sourceRow}>
              <span style={styles.sourceIndex}>{String(index + 1).padStart(2, '0')}</span>
              <div style={styles.sourceRowCopy}>
                <span style={styles.sourceLabel}>{item.label}</span>
                <strong style={styles.sourceRowTitle}>{item.title}</strong>
                <p style={styles.sourceRowBody}>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.capSection}>
        <SectionHeader
          eyebrow="Trust strip Track C"
          title="Lima constraint resmi yang mengunci produk ini agar tidak menjadi black box."
          desc="Auditor dan juri bisa membaca langsung klaim, kode constraint, dan artefak yang membuktikannya."
        />
        <div style={styles.constraintLedger} role="table" aria-label="Track C evidence constraints">
          <div className="landing-constraint-head" style={styles.constraintLedgerHead} role="row">
            <span role="columnheader">Kode</span>
            <span role="columnheader">Klaim</span>
            <span role="columnheader">Artefak</span>
          </div>
          {trackConstraints.map((item, index) => <ConstraintRow key={item.code} index={index} {...item} />)}
        </div>
      </section>

      <section id="audit-robustness" style={styles.section}>
        <SectionHeader
          eyebrow="Bukti angka"
          title="Benchmark riil untuk menjawab apakah model ini benar-benar membantu reviewer fokus."
          desc="Angka ditampilkan sebagai bukti operasional, bukan klaim hukum."
        />
        <div className="landing-value-grid" style={styles.proofGrid}>
          {proofBlocks.map((block) => <ProofCard key={block.label} {...block} />)}
        </div>
      </section>

      <section style={styles.section}>
        <SectionHeader
          eyebrow="Kejujuran ilmiah"
          title="Apa yang TIDAK kami klaim"
          desc="Bagian ini sengaja dibuat eksplisit agar pengguna memahami batas model sebelum memakai hasilnya."
        />
        <div className="landing-honesty-panel" style={styles.honestyPanel}>
          <aside style={styles.honestyManifesto} aria-label="Scientific honesty benchmark">
            <span style={styles.manifestoLabel}>Ablation disclosure</span>
            <strong style={styles.manifestoMetric}>0,505</strong>
            <p style={styles.manifestoCopy}>
              Macro-F1 saat fitur proksi dihapus. Angka ini sengaja ditampilkan karena model yang dipercaya harus
              berani menunjukkan batasnya.
            </p>
          </aside>
          <div style={styles.honestyStack}>
            {honestyClaims.map((claim) => <HonestyCard key={claim.title} {...claim} />)}
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <SectionHeader
          eyebrow="Bagaimana ini bekerja"
          title="Pipeline enam tahap dari data mentah sampai narasi Bahasa Indonesia."
          desc="Setiap tahap menjaga pemisahan data, keterbacaan hasil, dan bukti yang dapat diaudit ulang."
        />
        <ol className="landing-pipeline" style={styles.pipeline} aria-label="Pipeline LPSE-X">
          {pipeline.map((step, index) => (
            <li key={step} style={stepStyle(index)}>
              <span style={styles.pipelineNumber}>{String(index + 1).padStart(2, '0')}</span>
              <span style={styles.pipelineDot} aria-hidden="true" />
              <strong style={styles.pipelineText}>{step}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section style={styles.section}>
        <SectionHeader
          eyebrow="Untuk siapa"
          title="Satu sistem, empat cara membaca nilai operasionalnya."
          desc="Landing page ini berbicara ke reviewer harian, supervisor, tata kelola data, dan pengambil keputusan."
        />
        <div className="landing-value-grid" style={styles.roleGrid}>
          {userRoles.map((role, index) => <RoleCard key={role.title} index={index} {...role} />)}
        </div>
      </section>

      <footer style={styles.footer}>
        <section className="landing-credibility-band" style={styles.credibilityBand} aria-label="Kredibilitas institusional">
          <div style={styles.credibilityCopy}>
            <span style={styles.sectionEyebrow}>Kredibilitas institusional</span>
            <strong style={styles.credibilityTitle}>FindIT 2026 · Track C: Smart Governance & Public Service</strong>
            <p style={styles.credibilityText}>
              Dibangun sebagai proyek triase risiko pengadaan untuk konteks layanan publik, dengan rujukan akademik
              Universitas Negeri Semarang dan ekosistem penyelenggara kompetisi.
            </p>
          </div>
          <div style={styles.logoGrid}>
            {institutionLogos.map((logo) => (
              <span key={logo.alt} style={styles.logoCell}>
                <img src={logo.src} alt={logo.alt} style={styles.logoImage} draggable={false} />
              </span>
            ))}
          </div>
        </section>
        <GuardrailBanner guardrail={demoState.guardrail} />
        <div style={styles.statusRow}>
          <StaticBundleStatus demoState={demoState} />
          <span className="badge">Feature source: {demoState.feature_source ?? 'local split artifact'}</span>
          <a href="https://deerflow.tech" target="_blank" rel="noreferrer" style={styles.deerflowLink}>Created By Deerflow</a>
        </div>
      </footer>
    </main>
  );
}

function SectionHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <header style={styles.sectionHeader}>
      <span style={styles.sectionEyebrow}>{eyebrow}</span>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <p style={styles.sectionDesc}>{desc}</p>
    </header>
  );
}

function ConstraintRow({ code, claim, artifact, index }: { code: string; claim: string; artifact: string; index: number }) {
  return (
    <article className="landing-constraint-row" style={{ ...styles.constraintRow, background: index % 2 === 0 ? 'rgba(235, 230, 201, .045)' : 'rgba(17, 16, 15, .18)' }} role="row">
      <span style={styles.constraintCode} role="cell">{code}</span>
      <strong style={styles.constraintClaim} role="cell">{claim}</strong>
      <p style={styles.constraintArtifact} role="cell">{artifact}</p>
    </article>
  );
}

function ProofCard({ icon, label, title, metric, metricLabel, items }: { icon: ReactNode; label: string; title: string; metric: string; metricLabel: string; items: string[] }) {
  return (
    <article style={styles.proofCard}>
      <div style={styles.proofTopline}>
        <span style={styles.proofIcon}>{icon}</span>
        <span style={styles.proofLabel}>{label}</span>
      </div>
      <div style={styles.proofMetricBlock}>
        <strong style={styles.proofMetric}>{metric}</strong>
        <span style={styles.proofMetricLabel}>{metricLabel}</span>
      </div>
      <h3 style={styles.proofTitle}>{title}</h3>
      <ul style={styles.cleanList}>
        {items.map((item) => <li key={item} style={styles.listItem}>{item}</li>)}
      </ul>
    </article>
  );
}

function HonestyCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article style={styles.honestyCard}>
      <span style={styles.honestyIcon}>{icon}</span>
      <div>
        <h3 style={styles.honestyTitle}>{title}</h3>
        <p style={styles.honestyBody}>{body}</p>
      </div>
    </article>
  );
}

function RoleCard({ icon, title, body, index }: { icon: ReactNode; title: string; body: string; index: number }) {
  return (
    <article className="landing-role-card" style={{ ...styles.roleCard, transform: roleTransforms[index] }}>
      <span style={styles.roleIndex}>{String(index + 1).padStart(2, '0')}</span>
      <span style={styles.roleIcon}>{icon}</span>
      <h3 style={styles.roleTitle}>{title}</h3>
      <p style={styles.roleBody}>{body}</p>
    </article>
  );
}

function stepStyle(index: number): CSSProperties {
  return {
    ...styles.pipelineItem,
    marginTop: index % 2 === 0 ? 0 : 28,
  };
}

const roleTransforms = ['translateY(0)', 'translateY(26px)', 'translateY(8px)', 'translateY(34px)'];

const styles: Record<string, CSSProperties> = {
  shell: {
    width: '100%',
    padding: '0 clamp(20px, 3vw, 40px) 48px',
    minHeight: '100dvh',
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1060px)',
    justifyContent: 'center',
    justifyItems: 'center',
    alignItems: 'center',
    minHeight: 'clamp(620px, 58vw, 760px)',
    padding: 'clamp(32px, 4vw, 56px) 0',
    marginBottom: 34,
  },
  heroContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    textAlign: 'center',
  },
  title: {
    margin: '0 0 16px',
    fontSize: 'clamp(3.2rem, 6vw, 5.5rem)',
    lineHeight: 0.92,
    letterSpacing: '-.06em',
    fontWeight: 900,
    fontFamily: 'var(--lp-font-display)',
    color: 'var(--lp-cream-soft)',
  },
  titleAccent: {
    display: 'block',
    background: 'linear-gradient(135deg, var(--lp-cream) 0%, var(--lp-gold) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 'clamp(1.2rem, 2vw, 1.6rem)',
    margin: '0 0 16px',
    color: 'var(--lp-text-soft)',
    letterSpacing: '-.03em',
    fontWeight: 700,
  },
  description: {
    maxWidth: '62ch',
    color: 'var(--lp-muted)',
    fontSize: 'clamp(0.95rem, 1.4vw, 1.1rem)',
    lineHeight: 1.75,
    margin: '0 auto 26px',
  },
  stakesStrip: {
    width: 'min(100%, 1040px)',
    margin: '0 auto 30px',
    padding: '16px 18px',
    border: '1px solid rgba(235, 230, 201, .22)',
    borderRadius: 20,
    background: 'linear-gradient(180deg, rgba(32, 31, 30, .54), rgba(17, 16, 15, .36))',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, .08)',
    backdropFilter: 'blur(12px)',
  },
  stakesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 0,
    alignItems: 'stretch',
  },
  stakeItem: {
    display: 'grid',
    placeItems: 'center',
    minHeight: 58,
    padding: '0 13px',
    borderRight: '1px solid rgba(235, 230, 201, .18)',
    color: 'var(--lp-cream-soft)',
    fontSize: 'clamp(.83rem, 1.05vw, 1rem)',
    lineHeight: 1.28,
    letterSpacing: '-.02em',
  },
  stakesCaption: {
    margin: '13px 0 0',
    color: 'var(--lp-gold)',
    fontSize: 13,
    fontWeight: 760,
    letterSpacing: '-.01em',
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  authRow: {
    margin: '20px 0 0',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid var(--lp-line)',
    background: 'rgba(17, 16, 15, .42)',
    color: 'var(--lp-muted)',
    fontSize: 13,
    fontWeight: 600,
  },
  authRowLabel: {
    color: 'var(--lp-muted)',
  },
  authRowLink: {
    color: 'var(--lp-cream)',
    textDecoration: 'none',
    fontWeight: 800,
    letterSpacing: '-.01em',
    padding: '4px 8px',
    borderRadius: 999,
    transition: 'background .15s ease',
  },
  authRowDivider: {
    color: 'rgba(215, 209, 176, .35)',
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    border: 'none',
    borderRadius: 15,
    padding: '14px 20px',
    background: 'var(--lp-cream)',
    color: 'var(--lp-bg-deep)',
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    boxShadow: '0 4px 24px rgba(235, 230, 201, .2), 0 1px 3px rgba(235, 230, 201, .3)',
    transition: 'transform .15s, box-shadow .15s',
    textAlign: 'left',
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    border: '1px solid rgba(215, 209, 176, .22)',
    borderRadius: 15,
    padding: '14px 20px',
    background: 'rgba(215, 209, 176, .06)',
    color: 'var(--lp-text)',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'border-color .2s, background .2s',
    textAlign: 'left',
  },
  tertiaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    border: '1px solid rgba(215, 209, 176, .18)',
    borderRadius: 15,
    padding: '14px 20px',
    background: 'rgba(17, 16, 15, .38)',
    color: 'var(--lp-cream)',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'border-color .2s, background .2s',
    textAlign: 'left',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
  },
  primaryBtnHint: {
    display: 'block',
    marginTop: 3,
    fontSize: 12,
    fontWeight: 680,
    color: 'rgba(17, 16, 15, .68)',
  },
  secondaryBtnHint: {
    display: 'block',
    marginTop: 3,
    fontSize: 12,
    fontWeight: 580,
    color: 'rgba(235, 230, 201, .62)',
  },
  scoreSection: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: 'minmax(300px, .72fr) minmax(360px, 1fr)',
    gap: 'clamp(22px, 4vw, 56px)',
    alignItems: 'center',
    margin: '0 0 70px',
    padding: 'clamp(24px, 4vw, 40px)',
    border: '1px solid rgba(235, 230, 201, .16)',
    borderRadius: 34,
    background:
      'linear-gradient(135deg, rgba(42,41,39,.44), rgba(17,16,15,.3)), radial-gradient(circle at 96% 10%, rgba(215,209,176,.12), transparent 20rem)',
    boxShadow: '0 28px 76px rgba(17, 16, 15, .16), inset 0 1px 0 rgba(255,255,255,.06)',
    overflow: 'hidden',
  },
  scoreSectionCopy: {
    display: 'grid',
    alignContent: 'center',
    gap: 12,
    maxWidth: 560,
  },
  scoreSectionTitle: {
    margin: 0,
    color: 'var(--lp-cream-soft)',
    fontFamily: 'var(--lp-font-display)',
    fontSize: 'clamp(2.2rem, 4.4vw, 4.35rem)',
    lineHeight: .94,
    letterSpacing: '-.055em',
    fontWeight: 920,
  },
  scoreSectionDesc: {
    maxWidth: '54ch',
    margin: 0,
    color: 'var(--lp-muted)',
    fontSize: 15,
    lineHeight: 1.7,
  },
  scoreCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 640,
    justifySelf: 'end',
    display: 'grid',
    gap: 18,
    padding: '24px',
    border: '1px solid rgba(235, 230, 201, .24)',
    borderRadius: 30,
    background: 'radial-gradient(circle at 14% 12%, rgba(215, 209, 176, .16), transparent 15rem), linear-gradient(180deg, rgba(32,31,30,.68), rgba(17,16,15,.48))',
    boxShadow: '0 34px 76px rgba(17,16,15,.28), inset 0 1px 0 rgba(255,255,255,.1)',
    backdropFilter: 'blur(16px) saturate(1.06)',
  },
  scoreCardTop: {
    display: 'grid',
    gap: 8,
    paddingBottom: 16,
    borderBottom: '1px solid rgba(235, 230, 201, .16)',
  },
  scoreEyebrow: {
    color: 'var(--lp-gold)',
    fontSize: 11,
    fontWeight: 880,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
  },
  scorePackage: {
    color: 'rgba(235, 230, 201, .72)',
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 12,
    fontWeight: 760,
    lineHeight: 1.4,
  },
  scoreMetricRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '4px 14px',
    alignItems: 'end',
  },
  scoreMetricLabel: {
    gridColumn: '1 / -1',
    color: 'rgba(255,255,255,.56)',
    fontSize: 12,
    fontWeight: 760,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  },
  scoreMetric: {
    color: 'var(--lp-cream-soft)',
    fontFamily: 'var(--lp-font-display)',
    fontSize: 'clamp(4.2rem, 8vw, 6.8rem)',
    lineHeight: .82,
    letterSpacing: '-.08em',
  },
  scoreRisk: {
    alignSelf: 'center',
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid rgba(215, 209, 176, .28)',
    background: 'rgba(215, 209, 176, .08)',
    color: 'var(--lp-gold)',
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: '.06em',
  },
  factorPanel: {
    display: 'grid',
    gap: 9,
    padding: '16px',
    border: '1px solid rgba(235, 230, 201, .14)',
    borderRadius: 20,
    background: 'rgba(17,16,15,.26)',
  },
  factorTitle: {
    color: 'var(--lp-cream)',
    fontSize: 13,
    fontWeight: 840,
    letterSpacing: '-.01em',
  },
  factorItem: {
    display: 'grid',
    gridTemplateColumns: '20px minmax(0, 1fr)',
    gap: 8,
    margin: 0,
    color: 'rgba(255,255,255,.72)',
    fontSize: 13,
    lineHeight: 1.45,
  },
  factorArrow: {
    color: 'var(--lp-gold)',
    fontWeight: 900,
  },
  scoreNarrative: {
    margin: 0,
    padding: '0 0 0 16px',
    borderLeft: '2px solid rgba(215, 209, 176, .38)',
    color: 'var(--lp-cream-soft)',
    fontSize: 15,
    lineHeight: 1.55,
    letterSpacing: '-.015em',
  },
  scoreFootnote: {
    margin: 0,
    color: 'rgba(235, 230, 201, .5)',
    fontSize: 12,
    lineHeight: 1.45,
  },
  sourceSection: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, .82fr) minmax(420px, 1fr)',
    gap: 'clamp(20px, 4vw, 46px)',
    alignItems: 'stretch',
    marginBottom: 70,
    padding: 'clamp(22px, 3.2vw, 34px)',
    border: '1px solid rgba(235, 230, 201, .16)',
    borderRadius: 30,
    background: 'linear-gradient(135deg, rgba(17,16,15,.34), rgba(42,41,39,.44))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
  },
  sourceCopy: {
    display: 'grid',
    alignContent: 'center',
    gap: 12,
    maxWidth: 620,
  },
  sourceTitle: {
    margin: 0,
    color: 'var(--lp-cream-soft)',
    fontFamily: 'var(--lp-font-display)',
    fontSize: 'clamp(2rem, 3.7vw, 3.8rem)',
    lineHeight: .96,
    letterSpacing: '-.052em',
    fontWeight: 920,
  },
  sourceDesc: {
    maxWidth: '60ch',
    margin: 0,
    color: 'var(--lp-muted)',
    fontSize: 14.5,
    lineHeight: 1.72,
  },
  sourceLedger: {
    display: 'grid',
    gap: 10,
  },
  sourceRow: {
    display: 'grid',
    gridTemplateColumns: '54px minmax(0, 1fr)',
    gap: 14,
    alignItems: 'start',
    padding: '17px 18px',
    border: '1px solid rgba(235, 230, 201, .14)',
    borderRadius: 20,
    background: 'linear-gradient(90deg, rgba(32,31,30,.58), rgba(17,16,15,.28))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
  },
  sourceIndex: {
    width: 42,
    height: 42,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 14,
    border: '1px solid rgba(215, 209, 176, .26)',
    color: 'var(--lp-gold)',
    background: 'rgba(215, 209, 176, .08)',
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 12,
    fontWeight: 900,
  },
  sourceRowCopy: {
    display: 'grid',
    gap: 6,
  },
  sourceLabel: {
    color: 'var(--lp-gold)',
    fontSize: 11,
    fontWeight: 820,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  },
  sourceRowTitle: {
    color: 'var(--lp-cream)',
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 13.5,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  sourceRowBody: {
    margin: 0,
    color: 'rgba(255,255,255,.64)',
    fontSize: 13,
    lineHeight: 1.55,
  },
  capSection: {
    marginBottom: 70,
  },
  section: {
    marginBottom: 70,
  },
  sectionHeader: {
    maxWidth: 860,
    margin: '0 0 24px',
  },
  sectionEyebrow: {
    display: 'inline-flex',
    width: 'fit-content',
    marginBottom: 12,
    padding: '7px 11px',
    border: '1px solid rgba(215, 209, 176, .2)',
    borderRadius: 999,
    color: 'var(--lp-gold)',
    background: 'rgba(215, 209, 176, .06)',
    fontSize: 11,
    fontWeight: 820,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    margin: '0 0 10px',
    maxWidth: 840,
    color: 'var(--lp-cream-soft)',
    fontSize: 'clamp(2rem, 4vw, 3.7rem)',
    lineHeight: 0.98,
    letterSpacing: '-.05em',
    fontWeight: 900,
  },
  sectionDesc: {
    maxWidth: '68ch',
    margin: 0,
    color: 'var(--lp-muted)',
    fontSize: 15,
    lineHeight: 1.65,
  },
  constraintLedger: {
    overflow: 'hidden',
    border: '1px solid rgba(235, 230, 201, .2)',
    borderRadius: 24,
    background: 'linear-gradient(135deg, rgba(42, 41, 39, .58), rgba(17, 16, 15, .42))',
    boxShadow: '0 26px 70px rgba(17, 16, 15, .18), inset 0 1px 0 rgba(255, 255, 255, .09)',
    backdropFilter: 'blur(14px) saturate(1.06)',
  },
  constraintLedgerHead: {
    display: 'grid',
    gridTemplateColumns: '110px minmax(180px, .7fr) minmax(260px, 1fr)',
    gap: 0,
    padding: '13px 18px',
    borderBottom: '1px solid rgba(235, 230, 201, .18)',
    color: 'rgba(235, 230, 201, .56)',
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 11,
    fontWeight: 850,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  },
  constraintRow: {
    display: 'grid',
    gridTemplateColumns: '110px minmax(180px, .7fr) minmax(260px, 1fr)',
    gap: 0,
    alignItems: 'center',
    minHeight: 76,
    padding: '14px 18px',
    borderBottom: '1px solid rgba(235, 230, 201, .12)',
  },
  constraintCode: {
    width: 'fit-content',
    padding: '6px 9px',
    borderRadius: 10,
    border: '1px solid rgba(215, 209, 176, .28)',
    color: 'var(--lp-gold)',
    background: 'rgba(17, 16, 15, .34)',
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 12,
    fontWeight: 850,
  },
  constraintClaim: {
    color: 'var(--lp-cream)',
    fontSize: 17,
    lineHeight: 1.14,
    letterSpacing: '-.025em',
  },
  constraintArtifact: {
    margin: 0,
    color: 'rgba(255, 255, 255, .68)',
    fontSize: 13,
    lineHeight: 1.45,
  },
  proofGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.08fr) minmax(0, .92fr) minmax(0, 1fr)',
    gap: 18,
    alignItems: 'stretch',
  },
  proofCard: {
    minHeight: 336,
    display: 'grid',
    alignContent: 'start',
    gap: 16,
    padding: '28px 25px',
    border: '1px solid rgba(215, 209, 176, .24)',
    borderRadius: 28,
    background: 'radial-gradient(circle at 18% 12%, rgba(215, 209, 176, .13), transparent 18rem), linear-gradient(180deg, rgba(32,31,30,.62), rgba(17,16,15,.42))',
    boxShadow: '0 24px 58px rgba(17, 16, 15, .2), inset 0 1px 0 rgba(255, 255, 255, .08)',
    backdropFilter: 'blur(12px) saturate(1.06)',
  },
  proofTopline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  proofIcon: {
    width: 44,
    height: 44,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 15,
    border: '1px solid rgba(215, 209, 176, .34)',
    color: 'var(--lp-gold)',
    background: 'rgba(215, 209, 176, .1)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, .08)',
  },
  proofLabel: {
    color: 'var(--lp-gold)',
    fontSize: 11,
    fontWeight: 820,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  },
  proofMetricBlock: {
    display: 'grid',
    gap: 4,
    padding: '12px 0 16px',
    borderBottom: '1px solid rgba(235, 230, 201, .16)',
  },
  proofMetric: {
    color: 'var(--lp-cream-soft)',
    fontFamily: 'var(--lp-font-display)',
    fontSize: 'clamp(2.7rem, 5vw, 4.7rem)',
    lineHeight: .82,
    letterSpacing: '-.07em',
    fontWeight: 920,
  },
  proofMetricLabel: {
    color: 'rgba(235, 230, 201, .58)',
    fontSize: 12,
    fontWeight: 780,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
  },
  proofTitle: {
    margin: 0,
    color: 'var(--lp-cream-soft)',
    fontSize: 22,
    lineHeight: 1.08,
    letterSpacing: '-.035em',
  },
  cleanList: {
    display: 'grid',
    gap: 10,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  listItem: {
    paddingTop: 10,
    borderTop: '1px solid rgba(215, 209, 176, .14)',
    color: 'var(--lp-text-soft)',
    fontSize: 14,
    lineHeight: 1.5,
  },
  honestyPanel: {
    display: 'grid',
    gridTemplateColumns: 'minmax(300px, .72fr) minmax(0, 1fr)',
    gap: 18,
    alignItems: 'stretch',
  },
  honestyManifesto: {
    display: 'grid',
    alignContent: 'end',
    gap: 16,
    minHeight: 344,
    padding: 28,
    border: '1px solid rgba(215, 209, 176, .26)',
    borderRadius: 30,
    background: 'radial-gradient(circle at 20% 18%, rgba(215,209,176,.18), transparent 17rem), linear-gradient(180deg, rgba(32,31,30,.62), rgba(17,16,15,.46))',
    boxShadow: '0 30px 70px rgba(17, 16, 15, .22), inset 0 1px 0 rgba(255, 255, 255, .08)',
  },
  manifestoLabel: {
    color: 'var(--lp-gold)',
    fontSize: 11,
    fontWeight: 880,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
  },
  manifestoMetric: {
    color: 'var(--lp-cream-soft)',
    fontFamily: 'var(--lp-font-display)',
    fontSize: 'clamp(4.8rem, 9vw, 8.5rem)',
    lineHeight: .78,
    letterSpacing: '-.08em',
  },
  manifestoCopy: {
    maxWidth: '34ch',
    margin: 0,
    color: 'rgba(255, 255, 255, .68)',
    fontSize: 14,
    lineHeight: 1.58,
  },
  honestyStack: {
    display: 'grid',
    gap: 10,
  },
  honestyCard: {
    display: 'grid',
    gridTemplateColumns: '38px minmax(0, 1fr)',
    gap: 14,
    alignItems: 'start',
    padding: '19px 20px',
    border: '1px solid var(--lp-line)',
    borderRadius: 18,
    background: 'linear-gradient(90deg, rgba(32,31,30,.56), rgba(17,16,15,.34))',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, .06)',
  },
  honestyIcon: {
    width: 38,
    height: 38,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid rgba(215, 209, 176, .28)',
    borderRadius: 13,
    color: 'var(--lp-gold)',
    background: 'rgba(215, 209, 176, .08)',
  },
  honestyTitle: {
    margin: '0 0 7px',
    color: 'var(--lp-cream)',
    fontSize: 15,
    lineHeight: 1.18,
    letterSpacing: '-.02em',
  },
  honestyBody: {
    margin: 0,
    color: 'var(--lp-muted)',
    fontSize: 13,
    lineHeight: 1.55,
  },
  pipeline: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(168px, 1fr))',
    gap: 12,
    margin: 0,
    padding: '4px 0 32px',
    listStyle: 'none',
    overflowX: 'auto',
    alignItems: 'start',
    background:
      'linear-gradient(90deg, rgba(215,209,176,0) 0%, rgba(215,209,176,.3) 10%, rgba(215,209,176,.3) 90%, rgba(215,209,176,0) 100%) 0 66px / 100% 1px no-repeat',
  },
  pipelineItem: {
    position: 'relative',
    minHeight: 156,
    display: 'grid',
    alignContent: 'space-between',
    gap: 18,
    padding: '18px 16px',
    border: '1px solid rgba(235, 230, 201, .18)',
    borderRadius: 22,
    background: 'linear-gradient(180deg, rgba(32,31,30,.58), rgba(17,16,15,.36))',
    boxShadow: '0 18px 38px rgba(17, 16, 15, .16), inset 0 1px 0 rgba(255, 255, 255, .07)',
  },
  pipelineNumber: {
    color: 'rgba(215, 209, 176, .56)',
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 12,
    fontWeight: 900,
  },
  pipelineDot: {
    width: 13,
    height: 13,
    borderRadius: '50%',
    border: '2px solid rgba(235, 230, 201, .68)',
    background: 'var(--lp-bg-deep)',
    boxShadow: '0 0 0 5px rgba(215, 209, 176, .08)',
  },
  pipelineText: {
    color: 'var(--lp-cream-soft)',
    fontSize: 14,
    lineHeight: 1.22,
    letterSpacing: '-.02em',
  },
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 16,
    paddingBottom: 36,
  },
  roleCard: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 232,
    display: 'grid',
    alignContent: 'start',
    gap: 12,
    padding: '48px 22px 22px',
    border: '1px solid rgba(235, 230, 201, .18)',
    borderRadius: 28,
    background: 'radial-gradient(circle at 80% 0%, rgba(215,209,176,.16), transparent 12rem), linear-gradient(180deg, rgba(32,31,30,.54), rgba(17,16,15,.4))',
    boxShadow: '0 22px 54px rgba(17, 16, 15, .18), inset 0 1px 0 rgba(255, 255, 255, .07)',
  },
  roleIndex: {
    position: 'absolute',
    top: 17,
    right: 18,
    color: 'rgba(235, 230, 201, .28)',
    fontFamily: 'var(--lp-font-mono)',
    fontSize: 22,
    fontWeight: 920,
    letterSpacing: '-.04em',
  },
  roleIcon: {
    width: 46,
    height: 46,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 16,
    border: '1px solid rgba(215, 209, 176, .18)',
    color: 'var(--lp-gold)',
    background: 'rgba(215, 209, 176, .08)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)',
  },
  roleTitle: {
    margin: 0,
    color: 'var(--lp-cream)',
    fontSize: 18,
    lineHeight: 1.1,
    letterSpacing: '-.03em',
  },
  roleBody: {
    margin: 0,
    color: 'var(--lp-muted)',
    fontSize: 13.5,
    lineHeight: 1.55,
  },
  footer: {
    marginTop: 24,
    paddingTop: 24,
    borderTop: '1px solid var(--lp-line)',
  },
  credibilityBand: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, .9fr) minmax(360px, 1fr)',
    gap: 22,
    alignItems: 'center',
    marginBottom: 22,
    padding: '22px',
    border: '1px solid rgba(235, 230, 201, .18)',
    borderRadius: 26,
    background: 'linear-gradient(135deg, rgba(42,41,39,.52), rgba(17,16,15,.36))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)',
  },
  credibilityCopy: {
    display: 'grid',
    gap: 9,
  },
  credibilityTitle: {
    color: 'var(--lp-cream-soft)',
    fontSize: 'clamp(1.15rem, 2vw, 1.65rem)',
    lineHeight: 1.08,
    letterSpacing: '-.035em',
  },
  credibilityText: {
    maxWidth: '64ch',
    margin: 0,
    color: 'rgba(255,255,255,.62)',
    fontSize: 13.5,
    lineHeight: 1.6,
  },
  logoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 10,
  },
  logoCell: {
    minHeight: 72,
    display: 'grid',
    placeItems: 'center',
    padding: 12,
    border: '1px solid rgba(235, 230, 201, .14)',
    borderRadius: 18,
    background: 'rgba(235, 230, 201, .06)',
  },
  logoImage: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: 42,
    objectFit: 'contain',
    filter: 'saturate(.86) contrast(1.04)',
  },
  statusRow: {
    marginTop: 14,
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  deerflowLink: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 28,
    padding: '0 10px',
    borderRadius: 999,
    border: '1px solid rgba(215, 209, 176, .16)',
    color: 'rgba(235, 230, 201, .52)',
    background: 'rgba(17, 16, 15, .24)',
    fontSize: 11,
    fontWeight: 720,
    textDecoration: 'none',
    letterSpacing: '.02em',
  },
};
