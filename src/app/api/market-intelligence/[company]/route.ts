import { NextRequest, NextResponse } from 'next/server';
import { MarketIntelligenceService, MarketIntelligenceError } from '@/services/MarketIntelligenceService';

function randomDelayMs(): number {
  return 300 + Math.random() * 600; // 300-900ms
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;

  // Simulate realistic network latency before responding.
  await delay(randomDelayMs());

  try {
    const decodedCompany = decodeURIComponent(company ?? '');
    const data = await MarketIntelligenceService.getMarketIntelligence(decodedCompany);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof MarketIntelligenceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    // Never leak internal error details to the client.
    return NextResponse.json(
      { error: 'Unable to retrieve market intelligence at this time.' },
      { status: 500 }
    );
  }
}
