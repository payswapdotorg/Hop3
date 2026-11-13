/**
 * Hop3 — Stage 1 API: mark an application reviewed/prepared
 * (POST /api/applications/[id]/prepared).
 *
 * Guarded by domain/lifecycle: requires a stored draft (hasDraft) —
 * "prepared" means the user reviewed the materials themselves.
 */

import { NextResponse } from 'next/server';

import { markPrepared } from '@/lib/services/application-service';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await markPrepared(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ application: result.application });
}
