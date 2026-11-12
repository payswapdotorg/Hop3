/**
 * Hop3 — Stage 1 API: save a user-edited draft
 * (PUT /api/applications/[id]/draft).
 *
 * Marks draftEditedByUser=true and appends a 'draft_edited' audit event.
 */

import { NextResponse } from 'next/server';

import { saveDraft } from '@/lib/services/application-service';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const draft = (body as { draft?: unknown } | null)?.draft;
  if (draft === undefined) {
    return NextResponse.json(
      { error: 'Request body must be JSON with a "draft" object' },
      { status: 400 },
    );
  }

  const result = await saveDraft(id, draft);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ application: result.application });
}
