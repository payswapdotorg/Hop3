/**
 * Hop3 — Stage 1 API: generate an application draft
 * (POST /api/applications/[id]/prepare).
 *
 * Deterministic rule template (draftModel 'hop3-stage1-rules-v1') built from
 * truthful profile facts + the listing. No model guesswork, no fabricated
 * experience; the user reviews and edits before any use.
 */

import { NextResponse } from 'next/server';

import { prepareDraft } from '@/lib/services/application-service';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const application = await prepareDraft(id);
  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }
  return NextResponse.json({ application });
}
