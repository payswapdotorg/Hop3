/**
 * Hop3 — Stage 1 API: opportunity inbox (GET /api/opportunities).
 *
 * User-chosen filters only (source/eligibility/status/q). Arrival order is
 * preserved (no Hop3 ranking). Eligibility and economics are computed live
 * from listing facts + the worker profile — never cached claims.
 */

import { NextResponse } from 'next/server';

import { listOpportunities } from '@/lib/services/opportunity-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const opportunities = await listOpportunities({
    source: url.searchParams.get('source') ?? undefined,
    eligibility: url.searchParams.get('eligibility') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
  });
  return NextResponse.json({ opportunities });
}
