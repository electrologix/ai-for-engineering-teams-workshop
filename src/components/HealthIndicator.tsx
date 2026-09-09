export interface HealthIndicatorProps {
  healthScore: number;
}

function normalizeScore(healthScore: number): number {
  if (!Number.isFinite(healthScore)) {
    return 0;
  }
  return Math.min(100, Math.max(0, healthScore));
}

export function getHealthColorClasses(healthScore: number): string {
  const score = normalizeScore(healthScore);
  if (score <= 30) {
    return 'bg-red-100 text-red-800 border-red-300';
  }
  if (score <= 70) {
    return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  }
  return 'bg-green-100 text-green-800 border-green-300';
}

export function getHealthCardClasses(healthScore: number): string {
  const score = normalizeScore(healthScore);
  if (score <= 30) {
    return 'bg-red-50 border-red-200 hover:border-red-300';
  }
  if (score <= 70) {
    return 'bg-yellow-50 border-yellow-200 hover:border-yellow-300';
  }
  return 'bg-green-50 border-green-200 hover:border-green-300';
}

export default function HealthIndicator({ healthScore }: HealthIndicatorProps) {
  const score = normalizeScore(healthScore);

  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getHealthColorClasses(score)}`}
    >
      {score}
    </span>
  );
}
