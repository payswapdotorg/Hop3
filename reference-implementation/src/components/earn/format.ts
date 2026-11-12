/**
 * Hop3 Earn — formatting helpers (Worker C).
 *
 * Formatting-only utilities: no data fetching, no component code.
 * Missing values render as explicit "unknown" text — never guesses.
 */

import { format, formatDistanceToNow, isValid } from 'date-fns'
import { NO_AUTO_SUBMIT_NOTICE, type ApplicationDraftContent } from '@/lib/contracts'

export function toDate(iso?: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isValid(d) ? d : null
}

export function relativeTime(iso?: string | null): string {
  const d = toDate(iso)
  if (!d) return 'unknown time'
  try {
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return 'unknown time'
  }
}

export function absoluteTime(iso?: string | null): string {
  const d = toDate(iso)
  if (!d) return 'unknown'
  try {
    return format(d, 'PPpp')
  } catch {
    return d.toISOString()
  }
}

export function shortAbsoluteTime(iso?: string | null): string {
  const d = toDate(iso)
  if (!d) return 'unknown'
  try {
    return format(d, 'PP, p')
  } catch {
    return d.toISOString()
  }
}

/** Whole days until an ISO date; negative means past; null means unknown. */
export function daysUntil(iso?: string | null): number | null {
  const d = toDate(iso)
  if (!d) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

export function formatNumber(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return ''
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
}

export function formatMoney(amount?: number | null, currency?: string | null): string {
  if (amount == null || Number.isNaN(amount)) return 'unknown amount'
  const cur = (currency ?? '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(cur)) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cur,
        maximumFractionDigits: 2,
      }).format(amount)
    } catch {
      // unsupported currency code — fall through to "CODE amount"
    }
  }
  return cur ? `${cur} ${formatNumber(amount)}` : formatNumber(amount)
}

export function formatMoneyRange(
  min?: number | null,
  max?: number | null,
  currency?: string | null
): string {
  if (min == null && max == null) return 'unknown amount'
  if (min != null && max != null) {
    if (min === max) return formatMoney(min, currency)
    const cur = (currency ?? '').trim().toUpperCase()
    const prefix = /^[A-Z]{3}$/.test(cur) ? `${cur} ` : cur ? `${cur} ` : ''
    return `${prefix}${formatNumber(min)}–${formatNumber(max)}`
  }
  if (min != null) return `from ${formatMoney(min, currency)}`
  return `up to ${formatMoney(max, currency)}`
}

export function payUnitLabel(unit?: string | null): string {
  switch (unit) {
    case 'fixed':
      return 'fixed'
    case 'hourly':
      return 'per hour'
    case 'task':
      return 'per task'
    case 'word':
      return 'per word'
    case 'month':
      return 'per month'
    default:
      return 'unit unknown'
  }
}

export function sourceLabel(key?: string | null): string {
  switch (key) {
    case 'oneforma':
      return 'OneForma'
    case 'upwork_mcp':
      return 'Upwork'
    case 'fiverr_mcp':
      return 'Fiverr'
    case 'url_intake':
      return 'Submitted link'
    default:
      return key ?? 'unknown source'
  }
}

export function eventLabel(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * The ApplicationDTO stores the draft as a string. Parse it into the frozen
 * ApplicationDraftContent shape; if the payload is not valid JSON, fall back
 * to treating the string as the message draft with an honest default notice.
 */
export function parseApplicationDraft(draft?: string | null): ApplicationDraftContent | null {
  if (draft == null || draft === '') return null
  try {
    const parsed: unknown = JSON.parse(draft)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { messageDraft?: unknown }).messageDraft === 'string'
    ) {
      const obj = parsed as { checklist?: unknown; notice?: unknown; messageDraft: string }
      return {
        checklist: Array.isArray(obj.checklist)
          ? obj.checklist.filter((x): x is string => typeof x === 'string')
          : [],
        messageDraft: obj.messageDraft,
        notice: typeof obj.notice === 'string' && obj.notice ? obj.notice : NO_AUTO_SUBMIT_NOTICE,
      }
    }
  } catch {
    // not JSON — treat as plain message text
  }
  return { checklist: [], messageDraft: draft, notice: NO_AUTO_SUBMIT_NOTICE }
}
