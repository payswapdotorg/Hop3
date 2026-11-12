/**
 * Hop3 — Stage 1 API: opportunity detail (GET /api/opportunities/[id]).
 *
 * Returns the full normalized record: specs as the source exposed them,
 * evidence (source, observation times), the raw payload for audit, live
 * eligibility + economics, and saved notes.
 */

import { NextResponse } from 'next/server';

import { getOpportunityDetail } from '@/lib/services/opportunity-service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getOpportunityDetail(id);
  if (!result) {
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  }
  return NextResponse.json({ opportunity: result.dto });
}
