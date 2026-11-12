'use client'

/**
 * Hop3 Earn — economics rendering (Worker C).
 *
 * Gross and net are never collapsed. Estimates are always labelled as
 * estimates with their assumptions and unknown costs; unknown payout is
 * shown as unknown, never as a guaranteed payable amount.
 */

import * as React from 'react'
import { Info } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ECONOMICS_DISCLAIMER,
  PAYOUT_UNKNOWN_DISCLAIMER,
  type CostLine,
  type EconomicsEstimate,
  type FeeLine,
} from '@/lib/contracts'
import {
  formatMoney,
  formatMoneyRange,
  formatNumber,
  payUnitLabel,
} from '@/components/earn/format'
import { AMBER_OUTLINE, EMERALD_OUTLINE } from '@/components/earn/badges'

function feeValue(fee: FeeLine): string {
  if (fee.kind === 'percent') {
    return fee.value != null ? `${formatNumber(fee.value)}%` : 'rate unknown'
  }
  return fee.value != null ? formatMoney(fee.value, fee.currency) : 'amount unknown'
}

function costValue(cost: CostLine): string {
  const parts: string[] = []
  if (cost.amount != null) parts.push(formatMoney(cost.amount, cost.currency))
  if (cost.hours != null) parts.push(`${formatNumber(cost.hours)}h`)
  if (parts.length === 0) parts.push('amount unknown')
  return parts.join(' · ')
}

function ConfidenceBadge({ confidence }: { confidence: EconomicsEstimate['confidence'] }) {
  if (confidence === 'high') {
    return <Badge variant="outline" className={EMERALD_OUTLINE}>confidence: high</Badge>
  }
  if (confidence === 'low') {
    return <Badge variant="outline" className={AMBER_OUTLINE}>confidence: low</Badge>
  }
  return <Badge variant="outline">confidence: medium</Badge>
}

/** Full breakdown: fees table, costs, assumptions, unknown costs, disclaimer. */
export function EconomicsBreakdown({ economics }: { economics: EconomicsEstimate }) {
  const netKnown = economics.estimatedNetMin != null || economics.estimatedNetMax != null

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1">
        <p className="font-medium">Economics estimate</p>
        <p className="text-xs text-muted-foreground">
          gross {formatMoneyRange(economics.grossMin, economics.grossMax, economics.currency)}{' '}
          {payUnitLabel(economics.payUnit)} · est. net{' '}
          {netKnown
            ? formatMoneyRange(economics.estimatedNetMin, economics.estimatedNetMax, economics.currency)
            : 'unknown'}
        </p>
        {economics.effectiveHourlyMin != null || economics.effectiveHourlyMax != null ? (
          <p className="text-xs text-muted-foreground">
            effective hourly{' '}
            {formatMoneyRange(economics.effectiveHourlyMin, economics.effectiveHourlyMax, economics.currency)}
          </p>
        ) : null}
        {economics.estimatedHours?.min != null || economics.estimatedHours?.max != null ? (
          <p className="text-xs text-muted-foreground">
            estimated hours{' '}
            {economics.estimatedHours.min != null && economics.estimatedHours.max != null
              ? `${formatNumber(economics.estimatedHours.min)}–${formatNumber(economics.estimatedHours.max)}`
              : economics.estimatedHours.min != null
                ? `from ${formatNumber(economics.estimatedHours.min)}`
                : `up to ${formatNumber(economics.estimatedHours.max)}`}
          </p>
        ) : null}
        <div className="pt-1">
          <ConfidenceBadge confidence={economics.confidence} />
        </div>
      </div>

      {economics.fees.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Fees applied to the estimate</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-xs">Fee</TableHead>
                <TableHead className="h-8 text-xs">Value</TableHead>
                <TableHead className="h-8 text-xs">Basis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {economics.fees.map((fee, i) => (
                <TableRow key={i}>
                  <TableCell className="py-2 text-xs">
                    {fee.label}
                    {fee.note ? <p className="text-muted-foreground">{fee.note}</p> : null}
                  </TableCell>
                  <TableCell className="py-2 text-xs">{feeValue(fee)}</TableCell>
                  <TableCell className="py-2 text-xs">
                    {fee.basis === 'known' ? (
                      <Badge variant="outline" className={EMERALD_OUTLINE}>known</Badge>
                    ) : (
                      <Badge variant="outline" className={AMBER_OUTLINE}>assumed</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {economics.costs.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Costs considered</p>
          <ul className="space-y-1">
            {economics.costs.map((cost, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                <span>{cost.label}</span>
                <span className="text-muted-foreground">{costValue(cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {economics.assumptions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Assumptions</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {economics.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {economics.unknownCostItems.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Unknown costs — not included in the estimate
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {economics.unknownCostItems.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t pt-2 text-xs text-muted-foreground">{ECONOMICS_DISCLAIMER}</p>
    </div>
  )
}

/** Compact gross → net line used on cards. */
export function EconomicsLine({ economics }: { economics: EconomicsEstimate }) {
  const netKnown = economics.estimatedNetMin != null || economics.estimatedNetMax != null

  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      <span>
        gross {formatMoneyRange(economics.grossMin, economics.grossMax, economics.currency)}{' '}
        {payUnitLabel(economics.payUnit)}
      </span>{' '}
      {netKnown ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:text-foreground"
              aria-label="Show estimated net breakdown, fees and assumptions"
            >
              → est. net{' '}
              {formatMoneyRange(economics.estimatedNetMin, economics.estimatedNetMax, economics.currency)}{' '}
              (fees applied)
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96">
            <EconomicsBreakdown economics={economics} />
          </PopoverContent>
        </Popover>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="cursor-help text-amber-700 dark:text-amber-400">
              Payout/fees unknown — not a guaranteed payable amount
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{PAYOUT_UNKNOWN_DISCLAIMER}</TooltipContent>
        </Tooltip>
      )}
    </p>
  )
}

/** Amber unknown-payout notice used in the detail view. */
export function PayoutUnknownNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{PAYOUT_UNKNOWN_DISCLAIMER}</span>
    </div>
  )
}
