/**
 * Hop3 — Stage 1 API: application list (GET /api/applications).
 *
 * Every tracker with its full event history. Payment figures appear only
 * where the user recorded them with evidence.
 */

import { NextResponse } from 'next/server';

import { listApplications } from '@/lib/services/application-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const applications = await listApplications();
  return NextResponse.json({ applications });
}
