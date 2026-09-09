/**
 * Mock customer data for workshop exercises
 * Used throughout the Customer Intelligence Dashboard components
 */

export interface Customer {
  id: string;
  name: string;
  company: string;
  healthScore: number;
  email?: string;
  subscriptionTier?: 'basic' | 'premium' | 'enterprise';
  domains?: string[]; // Customer websites to health check
  createdAt?: string;
  updatedAt?: string;
  // Health Score Calculator factor inputs (optional — feed HealthScoreInput in src/lib/healthCalculator.ts)
  paymentHistory?: {
    daysSinceLastPayment?: number;
    avgPaymentDelayDays?: number;
    overdueAmount?: number;
    hasNoPaymentHistory?: boolean;
  };
  engagement?: {
    loginFrequencyPerWeek?: number;
    featureUsageCount?: number;
    supportTicketCount?: number;
  };
  contract?: {
    daysUntilRenewal?: number;
    contractValue?: number;
    recentUpgrade?: boolean;
  };
  support?: {
    avgResolutionTimeHours?: number;
    satisfactionScore?: number;
    escalationCount?: number;
    hasNoSupportHistory?: boolean;
  };
}

export const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'John Smith',
    company: 'Acme Corp',
    healthScore: 85,
    email: 'john.smith@acmecorp.com',
    subscriptionTier: 'premium',
    domains: ['acmecorp.com', 'portal.acmecorp.com'],
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    paymentHistory: { daysSinceLastPayment: 5, avgPaymentDelayDays: 0, overdueAmount: 0 },
    engagement: { loginFrequencyPerWeek: 8, featureUsageCount: 25, supportTicketCount: 1 },
    contract: { daysUntilRenewal: 240, contractValue: 60000, recentUpgrade: true },
    support: { avgResolutionTimeHours: 4, satisfactionScore: 9, escalationCount: 0 }
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    company: 'TechStart Inc',
    healthScore: 45,
    email: 'sarah@techstart.io',
    subscriptionTier: 'basic',
    domains: ['techstart.io'],
    createdAt: '2024-01-20T14:22:00Z',
    updatedAt: '2024-01-20T14:22:00Z',
    paymentHistory: { daysSinceLastPayment: 35, avgPaymentDelayDays: 12, overdueAmount: 800 },
    engagement: { loginFrequencyPerWeek: 2, featureUsageCount: 6, supportTicketCount: 4 },
    contract: { daysUntilRenewal: 60, contractValue: 12000, recentUpgrade: false },
    support: { avgResolutionTimeHours: 30, satisfactionScore: 6, escalationCount: 1 }
  },
  {
    id: '3',
    name: 'Michael Brown',
    company: 'Global Solutions',
    healthScore: 15,
    email: 'mbrown@globalsolutions.com',
    subscriptionTier: 'basic',
    domains: ['globalsolutions.com', 'api.globalsolutions.com', 'cdn.globalsolutions.com'],
    createdAt: '2024-01-25T09:45:00Z',
    updatedAt: '2024-01-25T09:45:00Z'
  },
  {
    id: '4',
    name: 'Emily Davis',
    company: 'Innovation Labs',
    healthScore: 92,
    email: 'emily.davis@innovationlabs.tech',
    subscriptionTier: 'enterprise',
    domains: ['innovationlabs.tech', 'app.innovationlabs.tech'],
    createdAt: '2024-01-10T16:18:00Z',
    updatedAt: '2024-01-10T16:18:00Z'
  },
  {
    id: '5',
    name: 'David Wilson',
    company: 'Future Systems',
    healthScore: 60,
    email: 'dwilson@futuresystems.net',
    subscriptionTier: 'premium',
    domains: ['futuresystems.net', 'secure.futuresystems.net'],
    createdAt: '2024-01-30T11:05:00Z',
    updatedAt: '2024-01-30T11:05:00Z'
  },
  {
    id: '6',
    name: 'Lisa Anderson',
    company: 'Smart Ventures',
    healthScore: 73,
    email: 'lisa@smartventures.co',
    subscriptionTier: 'premium',
    domains: ['smartventures.co'],
    createdAt: '2024-02-01T13:40:00Z',
    updatedAt: '2024-02-01T13:40:00Z'
  },
  {
    id: '7',
    name: 'Robert Chen',
    company: 'DataFlow Analytics',
    healthScore: 88,
    email: 'robert@dataflow.ai',
    subscriptionTier: 'enterprise',
    domains: ['dataflow.ai', 'analytics.dataflow.ai', 'api.dataflow.ai'],
    createdAt: '2024-01-12T08:15:00Z',
    updatedAt: '2024-01-12T08:15:00Z'
  },
  {
    id: '8',
    name: 'Maria Rodriguez',
    company: 'CloudFirst Solutions',
    healthScore: 35,
    email: 'maria.rodriguez@cloudfirst.com',
    subscriptionTier: 'basic',
    domains: ['cloudfirst.com', 'support.cloudfirst.com'],
    createdAt: '2024-01-28T15:30:00Z',
    updatedAt: '2024-01-28T15:30:00Z'
  }
];

export default mockCustomers;