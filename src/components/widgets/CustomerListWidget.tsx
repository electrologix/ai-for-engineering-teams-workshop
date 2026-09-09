import { mockCustomers } from '@/data/mock-customers';
import CustomerCard from '@/components/CustomerCard';

/**
 * Stand-in for the real `CustomerSelector` widget (see
 * specs/customer-selector-spec.md), which had not landed yet at the time
 * this orchestrator was built. Swap the lazy import in
 * `DashboardOrchestrator.tsx` for the real component once available —
 * no orchestrator changes required since it only depends on rendering
 * a widget region, not this component's internals.
 */
export default function CustomerListWidget() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {mockCustomers.slice(0, 4).map((customer) => (
        <CustomerCard key={customer.id} customer={customer} />
      ))}
    </div>
  );
}
