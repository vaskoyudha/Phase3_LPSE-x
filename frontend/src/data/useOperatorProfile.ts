import { useEffect, useState } from 'react';
import { getOperatorProfile, type OperatorProfile } from './operatorProfile';

const PROFILE_EVENT = 'lpse-x:profile-changed';

export function emitOperatorProfileChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PROFILE_EVENT));
}

export function useOperatorProfile(): OperatorProfile {
  const [profile, setProfile] = useState<OperatorProfile>(() => getOperatorProfile());

  useEffect(() => {
    const refresh = () => setProfile(getOperatorProfile());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener(PROFILE_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(PROFILE_EVENT, refresh);
    };
  }, []);

  return profile;
}
