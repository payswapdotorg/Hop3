/**
 * Hop3 — Stage 1 API: source sync (POST /api/sources/[key]/sync).
 *
 * Runs ONE adapter sync in the requested mode ('live' | 'sandbox'). Live runs
 * that are blocked (e.g. Upwork OAuth) are reported honestly — nothing is
 * scraped and no listings are fabricated.
 */

import { NextResponse } from 'next/server';

import { SOURCE_KEYS, type SourceKey } from '@/lib/contracts';
import { syncSource } from '@/lib/services/source-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!SOURCE_KEYS.includes(key as SourceKey)) {
    return NextResponse.json({ error: `Unknown source "${key}"` }, { status: 400 });
  }

  let mode: 'live' | 'sandbox' = 'sandbox';
  try {
    const body = (await request.json()) as { mode?: unknown };
    if (body?.mode === 'live' || body?.mode === 'sandbox') {
      mode = body.mode;
    } else if (body?.mode !== undefined) {
      return NextResponse.json(
        { error: `Invalid mode "${String(body.mode)}" — use "live" or "sandbox"` },
        { status: 400 },
      );
    }
  } catch {
    // No body or invalid JSON: default to sandbox mode (never an accidental live run).
    mode = 'sandbox';
  }

  try {
    const result = await syncSource(key as SourceKey, mode);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 400 },
    );
  }
}
