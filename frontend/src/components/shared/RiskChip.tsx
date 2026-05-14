import { normalizeRiskTone, riskToneLabel, type RiskTone } from './riskTone';

type RiskChipProps = {
  label?: string | null;
  tone?: RiskTone;
  className?: string;
};

export function RiskChip({ label, tone, className }: RiskChipProps) {
  const risk = tone ?? normalizeRiskTone(label);
  return (
    <span className={["risk-chip", className].filter(Boolean).join(' ')} data-risk={risk}>
      {label ?? riskToneLabel(risk)}
    </span>
  );
}
