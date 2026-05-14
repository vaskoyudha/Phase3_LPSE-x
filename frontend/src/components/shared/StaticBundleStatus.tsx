import type { DemoState } from '../../types/api';

export function StaticBundleStatus({ demoState }: { demoState: DemoState }) {
  return <span className="badge">Static bundle: {demoState.production_build_status.dist_present ? 'FastAPI served' : 'build pending'}</span>;
}
