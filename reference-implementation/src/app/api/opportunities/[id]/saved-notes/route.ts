/**
 * Hop3 — Stage 1 API: saved-item notes (PATCH /api/opportunities/[id]/saved-notes).
 *
 * Private, user-owned notes attached to a saved opportunity.
 */

import { NextResponse } from 'next/server';

import { setSavedNotes } from '@/lib/services/opportunity-service';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let notes: string | undefined;
  try {
    const body = (await request.json()) as { notes?: unknown };
    if (typeof body.notes === 'string') notes = body.notes;
  } catch {
    // fall through to validation below
  }
  if (notes === undefined) {
    return NextResponse.json(
      { error: 'Request body must be JSON with a string "notes" field' },
      { status: 400 },
    );
  }
  if (notes.length > 5000) {
    return NextResponse.json({ error: 'notes must be at most 5000 characters' }, { status: 400 });
  }

  const ok = await setSavedNotes(id, notes);
  if (!ok) {
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
