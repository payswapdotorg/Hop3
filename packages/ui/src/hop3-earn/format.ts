/**
 * Hop3 Earn — formatting helpers (Stage 1 UI port).
 *
 * Formatting-only utilities: no data fetching, no component code.
 * Missing values render as explicit "unknown" text — never guesses.
 *
 * Pure functions take the active-locale label bundle plus a BCP-47 locale tag
 * so the locale-binding lives in `useFormat.ts` (single consumer: React tree).
 * The frozen honesty constants and DTO types come from `@zcode/shared`.
 */

import { NO_AUTO_SUBMIT_NOTICE, type ApplicationDraftContent } from "@zcode/shared";

/** Locale-dependent short labels the pure formatters render verbatim. */
export interface EarnFormatLabels {
  /** Rendered for a missing date ("unknown"). */
  unknown: string;
  /** Rendered for a missing/unparseable timestamp ("unknown time"). */
  unknownTime: string;
  /** Rendered for a missing monetary amount ("unknown amount"). */
  unknownAmount: string;
  /** Rendered for a missing source key ("unknown source"). */
  unknownSource: string;
  /** "from {value}" — lower-bound-only range prefix. */
  from: string;
  /** "up to {value}" — upper-bound-only range prefix. */
  upTo: string;
  /** Pay-unit labels keyed by the frozen CompensationSpec units. */
  payUnit: Record<"fixed" | "hourly" | "task" | "word" | "month" | "unknown", string>;
  /** Source display names keyed by the frozen SourceKey values. */
  sourceNames: Record<"oneforma" | "upwork_mcp" | "fiverr_mcp" | "url_intake", string>;
}

export const DEFAULT_EARN_FORMAT_LOCALE = "en-US";

function replacePlaceholder(template: string, value: string): string {
  return template.replace("{value}", value);
}

export function toDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days until an ISO date; negative means past; null means unknown. */
export function daysUntil(iso?: string | null): number | null {
  const d = toDate(iso);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function formatNumber(
  n?: number | null,
  locale: string = DEFAULT_EARN_FORMAT_LOCALE,
): string {
  if (n == null || Number.isNaN(n)) return "";
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
  } catch {
    return new Intl.NumberFormat(DEFAULT_EARN_FORMAT_LOCALE, {
      maximumFractionDigits: 2,
    }).format(n);
  }
}

export function formatMoney(
  amount?: number | null,
  currency?: string | null,
  labels?: EarnFormatLabels,
  locale: string = DEFAULT_EARN_FORMAT_LOCALE,
): string {
  if (amount == null || Number.isNaN(amount)) return labels?.unknownAmount ?? "amount unknown";
  const cur = (currency ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(cur)) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // unsupported currency code — fall through to "CODE amount"
    }
  }
  return cur ? `${cur} ${formatNumber(amount, locale)}` : formatNumber(amount, locale);
}

export function formatMoneyRange(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  labels?: EarnFormatLabels,
  locale: string = DEFAULT_EARN_FORMAT_LOCALE,
): string {
  if (min == null && max == null) return labels?.unknownAmount ?? "amount unknown";
  if (min != null && max != null) {
    if (min === max) return formatMoney(min, currency, labels, locale);
    const cur = (currency ?? "").trim().toUpperCase();
    const prefix = cur ? `${cur} ` : "";
    return `${prefix}${formatNumber(min, locale)}–${formatNumber(max, locale)}`;
  }
  if (min != null) {
    return replacePlaceholder(labels?.from ?? "from", formatMoney(min, currency, labels, locale));
  }
  return replacePlaceholder(labels?.upTo ?? "up to", formatMoney(max, currency, labels, locale));
}

function relativeTimeParts(
  d: Date,
  locale: string,
): { value: number; unit: Intl.RelativeTimeFormatUnit } | null {
  const seconds = (d.getTime() - Date.now()) / 1000;
  const absSeconds = Math.abs(seconds);
  if (absSeconds < 60) return { value: Math.round(seconds), unit: "second" };
  const minutes = seconds / 60;
  if (Math.abs(minutes) < 60) return { value: Math.round(minutes), unit: "minute" };
  const hours = minutes / 60;
  if (Math.abs(hours) < 24) return { value: Math.round(hours), unit: "hour" };
  const days = hours / 24;
  if (Math.abs(days) < 30) return { value: Math.round(days), unit: "day" };
  const months = days / 30;
  if (Math.abs(months) < 12) return { value: Math.round(months), unit: "month" };
  return { value: Math.round(months / 12), unit: "year" };
}

export function relativeTime(
  iso?: string | null,
  locale: string = DEFAULT_EARN_FORMAT_LOCALE,
  labels?: EarnFormatLabels,
): string {
  const d = toDate(iso);
  if (!d) return labels?.unknownTime ?? "unknown time";
  try {
    const parts = relativeTimeParts(d, locale);
    if (parts) {
      return new Intl.RelativeTimeFormat(locale).format(
        parts.value,
        parts.unit,
      );
    }
  } catch {
    // fall through to the absolute ISO fallback
  }
  return d.toISOString();
}

export function absoluteTime(
  iso?: string | null,
  locale: string = DEFAULT_EARN_FORMAT_LOCALE,
  labels?: EarnFormatLabels,
): string {
  const d = toDate(iso);
  if (!d) return labels?.unknown ?? "unknown";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function shortAbsoluteTime(
  iso?: string | null,
  locale: string = DEFAULT_EARN_FORMAT_LOCALE,
  labels?: EarnFormatLabels,
): string {
  const d = toDate(iso);
  if (!d) return labels?.unknown ?? "unknown";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      d,
    );
  } catch {
    return d.toISOString();
  }
}

export function payUnitLabel(
  unit?: string | null,
  labels?: EarnFormatLabels,
): string {
  if (!labels) return "unit unknown";
  switch (unit) {
    case "fixed":
      return labels.payUnit.fixed;
    case "hourly":
      return labels.payUnit.hourly;
    case "task":
      return labels.payUnit.task;
    case "word":
      return labels.payUnit.word;
    case "month":
      return labels.payUnit.month;
    default:
      return labels.payUnit.unknown;
  }
}

export function sourceLabel(
  key?: string | null,
  labels?: EarnFormatLabels,
): string {
  if (!labels) return key ?? "unknown source";
  switch (key) {
    case "oneforma":
      return labels.sourceNames.oneforma;
    case "upwork_mcp":
      return labels.sourceNames.upwork_mcp;
    case "fiverr_mcp":
      return labels.sourceNames.fiverr_mcp;
    case "url_intake":
      return labels.sourceNames.url_intake;
    default:
      return key ?? labels.unknownSource;
  }
}

/**
 * Lifecycle event tokens are frozen domain values (APPLIED, QUALIFICATION_PENDING…);
 * they stay locale-invariant, only split/capitalized for display.
 */
export function eventLabel(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The ApplicationDTO stores the draft as a string. Parse it into the frozen
 * ApplicationDraftContent shape; if the payload is not valid JSON, fall back
 * to treating the string as the message draft with the frozen notice.
 */
export function parseApplicationDraft(draft?: string | null): ApplicationDraftContent | null {
  if (draft == null || draft === "") return null;
  try {
    const parsed: unknown = JSON.parse(draft);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { messageDraft?: unknown }).messageDraft === "string"
    ) {
      const obj = parsed as { checklist?: unknown; notice?: unknown; messageDraft: string };
      return {
        checklist: Array.isArray(obj.checklist)
          ? obj.checklist.filter((x): x is string => typeof x === "string")
          : [],
        messageDraft: obj.messageDraft,
        notice: typeof obj.notice === "string" && obj.notice ? obj.notice : NO_AUTO_SUBMIT_NOTICE,
      };
    }
  } catch {
    // not JSON — treat as plain message text
  }
  return { checklist: [], messageDraft: draft, notice: NO_AUTO_SUBMIT_NOTICE };
}

/** Serialize an edited draft back into the string form the service stores. */
export function serializeApplicationDraft(draft: ApplicationDraftContent): string {
  return JSON.stringify(draft);
}
