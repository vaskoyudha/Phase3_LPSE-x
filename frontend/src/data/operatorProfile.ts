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

export const defaultOperatorProfile: OperatorProfile = {
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

type StoredRegistration = {
  fullName?: string;
  email?: string;
  agency?: string;
  auditorId?: string;
  createdAt?: string;
};

type StoredAuth = {
  email?: string;
};

function readStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getOperatorProfile(): OperatorProfile {
  const registration = readStorage<StoredRegistration>('lpse-x:registration');
  const auth = readStorage<StoredAuth>('lpse-x:auth');

  const merged: OperatorProfile = { ...defaultOperatorProfile };
  if (registration?.fullName?.trim()) merged.name = registration.fullName.trim();
  if (registration?.email?.trim()) merged.email = registration.email.trim();
  if (registration?.agency?.trim()) merged.agency = registration.agency.trim();
  if (registration?.auditorId?.trim()) merged.auditorId = registration.auditorId.trim();
  if (registration?.createdAt) merged.joinedAt = registration.createdAt;
  if (auth?.email?.trim()) merged.email = auth.email.trim();
  return merged;
}

/**
 * Convenience accessor mirroring the previous static export. Re-evaluates on every
 * access so consumers always see the latest registration data.
 */
export const operatorProfile: OperatorProfile = new Proxy(defaultOperatorProfile, {
  get(_target, prop: keyof OperatorProfile) {
    const live = getOperatorProfile();
    return live[prop];
  },
}) as OperatorProfile;

export function operatorInitials(profile: OperatorProfile = getOperatorProfile()): string {
  const parts = profile.name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
