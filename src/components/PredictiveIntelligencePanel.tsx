'use client';

import { Customer } from '@/data/mock-customers';
import MarketIntelligenceWidget from '@/components/MarketIntelligenceWidget';
import PredictiveAlertsPanel from '@/components/PredictiveAlertsPanel';

export interface PredictiveIntelligencePanelProps {
  customer: Customer | null;
  isLoading?: boolean;
}

/**
 * Unifies the Predictive Alerts engine (internal risk) and the Market
 * Intelligence widget (external sentiment) into one "Predictive
 * Intelligence" section for the currently selected customer. Both
 * sub-widgets read `Customer.company`/`Customer` from the same selected-
 * customer prop — no separate/duplicate company input state between them.
 *
 * Loading/error states are independent per sub-widget: each widget fetches
 * and renders its own state, so a Market Intelligence failure never blanks
 * out the core alerts panel, and vice versa.
 */
export default function PredictiveIntelligencePanel({
  customer,
  isLoading = false,
}: PredictiveIntelligencePanelProps) {
  return (
    <section aria-label="Predictive Intelligence" className="w-full">
      <h2 className="mb-2 text-base font-semibold text-gray-900">Predictive Intelligence</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PredictiveAlertsPanel customer={customer} isLoading={isLoading} />
        <MarketIntelligenceWidget company={customer?.company} />
      </div>
    </section>
  );
}
