import { Customer } from '@/data/mock-customers';

export interface CustomerCardProps {
  customer: Customer;
  onClick?: (customer: Customer) => void;
}

function getHealthColorClasses(healthScore: number): string {
  if (healthScore <= 30) {
    return 'bg-red-100 text-red-800 border-red-300';
  }
  if (healthScore <= 70) {
    return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  }
  return 'bg-green-100 text-green-800 border-green-300';
}

function getHealthCardClasses(healthScore: number): string {
  if (healthScore <= 30) {
    return 'bg-red-50 border-red-200 hover:border-red-300';
  }
  if (healthScore <= 70) {
    return 'bg-yellow-50 border-yellow-200 hover:border-yellow-300';
  }
  return 'bg-green-50 border-green-200 hover:border-green-300';
}

export default function CustomerCard({ customer, onClick }: CustomerCardProps) {
  const { name, company, healthScore, domains } = customer;
  const domainCount = domains?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => onClick?.(customer)}
      className={`w-full max-w-[400px] min-h-[120px] text-left rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${getHealthCardClasses(healthScore)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900">{name}</h3>
          <p className="truncate text-sm text-gray-600">{company}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getHealthColorClasses(healthScore)}`}
        >
          {healthScore}
        </span>
      </div>

      {domainCount > 0 && (
        <div className="mt-3">
          {domainCount > 1 && (
            <p className="text-xs font-medium text-gray-500">{domainCount} domains</p>
          )}
          <ul className="mt-1 space-y-0.5">
            {domains!.map((domain) => (
              <li key={domain} className="truncate text-xs text-gray-500">
                {domain}
              </li>
            ))}
          </ul>
        </div>
      )}
    </button>
  );
}
