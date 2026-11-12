/**
 * Hop3 — Stage 1 API: source registry (GET /api/sources).
 *
 * Returns the policy-first source registry with honest runtime state and the
 * latest SourceRun summary per source.
 */

import { NextResponse } from 'next/server';

import { listSources } from '@/lib/services/source-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sources = await listSources();
  return NextResponse.json({ sources });
}
