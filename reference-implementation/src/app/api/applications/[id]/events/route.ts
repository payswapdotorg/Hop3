/**
 * Hop3 — Stage 1 API: record an application event / lifecycle transition
 * (POST /api/applications/[id]/events).
 *
 * The ONLY way application state advances. Every transition is validated by
 * domain/lifecycle.canTransition (ordering + evidence gates); guard failures
 * return HTTP 400 with the exact reason — clicks and generated text are
 * never sufficient evidence.
 */

import { NextResponse } from 'next/server';

import { recordEvent } from '@/lib/services/application-service';

export const dynamic = 'force-dynamic';

export async function POST(
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

  const result = await recordEvent(id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ application: result.application });
}
