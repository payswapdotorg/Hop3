/**
 * Hop3 — Stage 1 API: save/unsave an opportunity (POST /api/opportunities/[id]/save).
 */

import { NextResponse } from 'next/server';

import { toggleSaved } from '@/lib/services/opportunity-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let saved: boolean | undefined;
  try {
    const body = (await request.json()) as { saved?: unknown };
    if (typeof body.saved === 'boolean') saved = body.saved;
  } catch {
    // fall through to validation below
  }
  if (saved === undefined) {
    return NextResponse.json(
      { error: 'Request body must be JSON with a boolean "saved" field' },
      { status: 400 },
    );
  }

  const ok = await toggleSaved(id, saved);
  if (!ok) {
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
