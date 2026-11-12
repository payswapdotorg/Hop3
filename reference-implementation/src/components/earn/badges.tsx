'use client'

/**
 * Hop3 Earn — badge family for provenance, eligibility, freshness,
 * evidence levels and source modes (Worker C).
 *
 * Color semantics (mandatory): emerald = positive/eligible/live,
 * amber = unknown/sandbox/caution, destructive = ineligible/expired/error,
 * neutral elsewhere. No indigo, blue or violet anywhere.
 */

import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SANDBOX_FIXTURE_LABEL,
  USER_SUBMITTED_LABEL,
  type DimensionResult,
  type EligibilityAssessment,
  type EligibilityValue,
} from '@/lib/contracts'
import { daysUntil, relativeTime } from '@/components/earn/format'

export const EMERALD_OUTLINE =
  'border-emerald-600/50 text-emerald-700 dark:border-emerald-500/50 dark:text-emerald-300'
export const EMERALD_SOLID =
  'border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90'
export const AMBER_OUTLINE =
  'border-amber-600/50 text-amber-800 dark:border-amber-500/50 dark:text-amber-300'
export const AMBER_SOLID =
  'border-transparent bg-amber-500 text-amber-950 hover:bg-amber-500/90'
/** Emerald-tinted outline button (positive action, not primary-filled). */
export const EMERALD_BUTTON =
  'border-emerald-600/50 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-800 dark:border-emerald-500/50 dark:text-emerald-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200'

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export function ProvenanceBadge({
  provenance,
}: {
  provenance: 'live' | 'sandbox-fixture' | 'user-submitted'
}) {
  if (provenance === 'live') {
    return <Badge variant="outline" className={EMERALD_OUTLINE}>Live source</Badge>
  }
  if (provenance === 'sandbox-fixture') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge tabIndex={0} className={AMBER_SOLID}>Sandbox fixture — test data</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{SANDBOX_FIXTURE_LABEL}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0}>Submitted link — unverified</Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{USER_SUBMITTED_LABEL}</TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

const ELIGIBILITY_META: Record<EligibilityValue, { label: string; className: string }> = {
  eligible: { label: 'Eligible', className: EMERALD_OUTLINE },
  ineligible: { label: 'Not eligible', className: '' },
  unknown: { label: 'Unknown eligibility', className: AMBER_OUTLINE },
  needs_user_input: { label: 'Needs profile info', className: '' },
}

export function DimensionValueBadge({ value }: { value: EligibilityValue }) {
  switch (value) {
    case 'eligible':
      return <Badge variant="outline" className={EMERALD_OUTLINE}>eligible</Badge>
    case 'ineligible':
      return <Badge variant="destructive">ineligible</Badge>
    case 'needs_user_input':
      return <Badge variant="outline">needs input</Badge>
    default:
      return <Badge variant="outline" className={AMBER_OUTLINE}>unknown</Badge>
  }
}

const DIMENSIONS: Array<{ key: 'country' | 'language' | 'skills' | 'payout'; label: string }> = [
  { key: 'country', label: 'Country' },
  { key: 'language', label: 'Language' },
  { key: 'skills', label: 'Skills' },
  { key: 'payout', label: 'Payout' },
]

/** Per-dimension reasons, blocking reasons, unknowns and next steps. */
export function EligibilityDetails({ assessment }: { assessment: EligibilityAssessment }) {
  const dims: Array<{ label: string; dim: DimensionResult }> = []
  for (const { key, label } of DIMENSIONS) {
    const dim = assessment[key]
    if (dim) dims.push({ label, dim })
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">Eligibility assessment</p>
      <ul className="space-y-2">
        {dims.map(({ label, dim }) => (
          <li key={label} className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
              <DimensionValueBadge value={dim.value} />
              <span
                className={
                  dim.sourceBacked
                    ? 'text-[10px] text-emerald-700 dark:text-emerald-400'
                    : 'text-[10px] text-muted-foreground'
                }
              >
                {dim.sourceBacked ? 'source-backed' : 'not source-backed'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{dim.reason}</p>
          </li>
        ))}
      </ul>

      {assessment.blockingReasons && assessment.blockingReasons.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-destructive">Blocking reasons</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive/90">
            {assessment.blockingReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.unknowns && assessment.unknowns.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Unknowns</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {assessment.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.nextSteps && assessment.nextSteps.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Suggested next steps</p>
          <ul className="space-y-1">
            {assessment.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[10px] text-muted-foreground">
        Assessed {relativeTime(assessment.assessedAt)} · unknown is never treated as eligible
      </p>
    </div>
  )
}

/** Eligibility badge; clicking shows per-dimension reasons in a popover. */
export function EligibilityBadge({ assessment }: { assessment: EligibilityAssessment }) {
  const meta = ELIGIBILITY_META[assessment.overall] ?? ELIGIBILITY_META.unknown
  const variant =
    assessment.overall === 'ineligible' ? 'destructive' : assessment.overall === 'needs_user_input' ? 'outline' : 'outline'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={`Eligibility: ${meta.label} — show reasons`}
        >
          <Badge variant={variant} className={meta.className}>
            {meta.label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <EligibilityDetails assessment={assessment} />
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

export function FreshnessBadge({
  status,
  expiresAt,
}: {
  status: 'active' | 'stale' | 'expired'
  expiresAt?: string | null
}) {
  if (status === 'expired') {
    return <Badge variant="destructive">Expired</Badge>
  }
  const days = daysUntil(expiresAt)
  if (days != null && days < 0) {
    return <Badge variant="destructive">Expired</Badge>
  }
  if (days != null && days <= 3) {
    return days === 0 ? (
      <Badge variant="destructive">closes today</Badge>
    ) : (
      <Badge variant="destructive">closes in {days}d</Badge>
    )
  }
  if (status === 'stale') {
    return <Badge variant="outline" className={AMBER_OUTLINE}>Stale — not re-observed recently</Badge>
  }
  return null
}

// ---------------------------------------------------------------------------
// Evidence levels
// ---------------------------------------------------------------------------

export function EvidenceLevelBadge({ level }: { level?: string | null }) {
  if (level === 'provider-confirmed') {
    return <Badge variant="outline" className={EMERALD_OUTLINE}>provider-confirmed</Badge>
  }
  if (level === 'payment-confirmed') {
    return <Badge className={EMERALD_SOLID}>payment-confirmed</Badge>
  }
  if (level === 'user-reported') {
    return <Badge variant="outline">user-reported</Badge>
  }
  return <Badge variant="secondary">level not recorded</Badge>
}

// ---------------------------------------------------------------------------
// Source connection mode
// ---------------------------------------------------------------------------

export function SourceModeBadge({ mode }: { mode: 'live' | 'sandbox' | 'blocked' | 'not-configured' }) {
  switch (mode) {
    case 'live':
      return <Badge variant="outline" className={EMERALD_OUTLINE}>Live</Badge>
    case 'sandbox':
      return <Badge className={AMBER_SOLID}>Sandbox data</Badge>
    case 'blocked':
      return <Badge variant="destructive">Blocked</Badge>
    default:
      return <Badge variant="secondary">Not configured</Badge>
  }
}
