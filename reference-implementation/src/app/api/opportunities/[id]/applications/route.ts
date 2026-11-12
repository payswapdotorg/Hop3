/**
 * Hop3 — Stage 1 API: create an application tracker
 * (POST /api/opportunities/[id]/applications).
 *
 * Creating a tracker never submits anything and never fabricates state: the
 * tracker starts in 'draft' with an audit event stating Hop3 will never
 * submit on the user's behalf.
 */

import { NextResponse } from 'next/server';

import { createApplication } from '@/lib/services/application-service';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const application = await createApplication(id);
  if (!application) {
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  }
  return NextResponse.json({ application });
}
