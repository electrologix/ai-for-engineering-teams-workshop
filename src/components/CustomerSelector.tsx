'use client';

import { useMemo, useState } from 'react';
import { Customer, mockCustomers } from '@/data/mock-customers';
import CustomerCard from './CustomerCard';

export interface CustomerSelectorProps {
  customers?: Customer[];
  selectedCustomerId?: string | null;
  onSelectCustomer?: (customer: Customer | null) => void;
  isLoading?: boolean;
}

export default function CustomerSelector({
  customers = mockCustomers,
  selectedCustomerId: controlledSelectedId,
  onSelectCustomer,
  isLoading = false,
}: CustomerSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  const isControlled = controlledSelectedId !== undefined;
  const selectedId = isControlled ? controlledSelectedId : internalSelectedId;

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        customer.company.toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const handleSelect = (customer: Customer) => {
    const nextId = selectedId === customer.id ? null : customer.id;
    if (!isControlled) {
      setInternalSelectedId(nextId);
    }
    onSelectCustomer?.(nextId ? customer : null);
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <label htmlFor="customer-search" className="sr-only">
          Search customers
        </label>
        <input
          id="customer-search"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name or company..."
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500">
          Loading customers...
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500">
          No customers match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCustomers.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              isSelected={selectedId === customer.id}
              onClick={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
