/**
 * Hop3 — Stage 1 API: user-submitted link intake (POST /api/intake).
 *
 * Records one user-submitted opportunity link (provenance 'user-submitted').
 * A polite public fetch extracts the page's own title/description when
 * possible; private/blocked pages are refused or recorded unfetched — never
 * bypassed.
 */

import { NextResponse } from 'next/server';

import { recordIntake } from '@/lib/services/source-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { url?: unknown; context?: unknown };
  try {
    body = (await request.json()) as { url?: unknown; context?: unknown };
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  if (typeof body.url !== 'string' || body.url.trim() === '' || body.url.length > 2000) {
    return NextResponse.json(
      { error: 'A non-empty URL (max 2000 characters) is required' },
      { status: 400 },
    );
  }
  if (body.context !== undefined && typeof body.context !== 'string') {
    return NextResponse.json({ error: 'context must be a string' }, { status: 400 });
  }
  if (typeof body.context === 'string' && body.context.length > 500) {
    return NextResponse.json({ error: 'context must be at most 500 characters' }, { status: 400 });
  }

  try {
    const result = await recordIntake(body.url.trim(), body.context?.trim() || undefined);
    return NextResponse.json({
      opportunityId: result.opportunityId,
      created: result.created,
      fetchNote: result.fetchNote,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'The link could not be recorded' },
      { status: 400 },
    );
  }
}
