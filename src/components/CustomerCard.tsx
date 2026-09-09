import { memo } from 'react';
import { Customer } from '@/data/mock-customers';
import HealthIndicator, { getHealthCardClasses } from './HealthIndicator';

export interface CustomerCardProps {
  customer: Customer;
  onClick?: (customer: Customer) => void;
  isSelected?: boolean;
}

function CustomerCard({ customer, onClick, isSelected = false }: CustomerCardProps) {
  const { name, company, email, healthScore, domains } = customer;
  const domainCount = domains?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => onClick?.(customer)}
      aria-pressed={isSelected}
      className={`w-full max-w-[400px] min-h-[120px] text-left rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${getHealthCardClasses(healthScore)} ${
        isSelected ? 'ring-2 ring-blue-500 border-blue-500 shadow-md' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900">{name}</h3>
          <p className="truncate text-sm text-gray-600">{company}</p>
          {email && <p className="truncate text-xs text-gray-500">{email}</p>}
        </div>
        <HealthIndicator healthScore={healthScore} />
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

export default memo(CustomerCard);
