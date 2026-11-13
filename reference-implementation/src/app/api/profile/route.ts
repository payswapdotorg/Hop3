/**
 * Hop3 — Stage 1 API: worker profile (GET / PUT /api/profile).
 *
 * The profile is user-owned and private by default: it stays in this
 * workspace and is only ever used to compute eligibility/economics locally.
 */

import { NextResponse } from 'next/server';

import { getProfile, upsertProfile } from '@/lib/services/profile-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const profile = await getProfile();
  return NextResponse.json({ profile });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  try {
    const profile = await upsertProfile(body);
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid worker profile' },
      { status: 400 },
    );
  }
}
