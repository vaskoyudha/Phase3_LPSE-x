export type OperatorProfile = {
  name: string;
  role: string;
  email: string;
  agency: string;
  unit: string;
  auditorId: string;
  region: string;
  guardrailScope: string;
  joinedAt: string;
};

export const operatorProfile: OperatorProfile = {
  name: 'Vasco Yudha',
  role: 'LPSE-X Risk Analyst',
  email: 'vasco.yudha@lpse.go.id',
  agency: 'LKPP · LPSE-X',
  unit: 'Risk Triage & Explainability',
  auditorId: 'AUD-024',
  region: 'Indonesia · National coverage',
  guardrailScope: 'Triase risiko · prioritas review · bukan tuduhan pelanggaran',
  joinedAt: '2024-08-12',
};

export function operatorInitials(profile: OperatorProfile = operatorProfile): string {
  const parts = profile.name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
