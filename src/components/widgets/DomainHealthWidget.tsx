import { mockCustomers } from '@/data/mock-customers';
import HealthIndicator from '@/components/HealthIndicator';

/**
 * Placeholder "Domain Health" widget region. Not spec-driven yet; provides
 * a realistic-sized region for the orchestrator's error/loading/export
 * plumbing to be exercised end-to-end.
 */
export default function DomainHealthWidget() {
  const domains = mockCustomers.flatMap((c) => c.domains ?? []).slice(0, 5);

  return (
    <ul className="space-y-2">
      {domains.map((domain) => (
        <li key={domain} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
          <span className="truncate text-sm text-gray-700">{domain}</span>
          <HealthIndicator healthScore={Math.floor(Math.random() * 100)} />
        </li>
      ))}
    </ul>
  );
}
