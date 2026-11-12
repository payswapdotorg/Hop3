/**
 * Hop3 Earn — locale-bound formatting hook (Stage 1 UI port).
 *
 * Wraps the pure `format.ts` helpers with the active ZCode locale and its
 * `earn.format.*` message labels so every component formats dates, money and
 * source names consistently. Missing values stay missing — the labels make
 * the missing-ness explicit instead of guessing.
 */

import { useMemo } from "react";

import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  absoluteTime,
  daysUntil,
  DEFAULT_EARN_FORMAT_LOCALE,
  formatMoney,
  formatMoneyRange,
  formatNumber,
  payUnitLabel,
  relativeTime,
  shortAbsoluteTime,
  sourceLabel,
  type EarnFormatLabels,
} from "./format.js";

export interface EarnFormatter {
  relativeTime(iso?: string | null): string;
  absoluteTime(iso?: string | null): string;
  shortAbsoluteTime(iso?: string | null): string;
  daysUntil(iso?: string | null): number | null;
  formatNumber(n?: number | null): string;
  formatMoney(amount?: number | null, currency?: string | null): string;
  formatMoneyRange(min?: number | null, max?: number | null, currency?: string | null): string;
  payUnitLabel(unit?: string | null): string;
  sourceLabel(key?: string | null): string;
  fromValue(value: string): string;
  upToValue(value: string): string;
  labels: EarnFormatLabels;
}

function formatMessage(
  intl: ReturnType<typeof useZCodeIntl>["intl"],
  id: string,
): string {
  return intl.formatMessage({ id });
}

/** Locale label bundle for the pure formatters, built once per intl instance. */
export function buildEarnFormatLabels(
  intl: ReturnType<typeof useZCodeIntl>["intl"],
): EarnFormatLabels {
  return {
    unknown: formatMessage(intl, "earn.format.unknown"),
    unknownTime: formatMessage(intl, "earn.format.unknownTime"),
    unknownAmount: formatMessage(intl, "earn.format.unknownAmount"),
    unknownSource: formatMessage(intl, "earn.format.unknownSource"),
    from: formatMessage(intl, "earn.format.from"),
    upTo: formatMessage(intl, "earn.format.upTo"),
    payUnit: {
      fixed: formatMessage(intl, "earn.format.payUnit.fixed"),
      hourly: formatMessage(intl, "earn.format.payUnit.hourly"),
      task: formatMessage(intl, "earn.format.payUnit.task"),
      word: formatMessage(intl, "earn.format.payUnit.word"),
      month: formatMessage(intl, "earn.format.payUnit.month"),
      unknown: formatMessage(intl, "earn.format.payUnit.unknown"),
    },
    sourceNames: {
      oneforma: formatMessage(intl, "earn.format.source.oneforma"),
      upwork_mcp: formatMessage(intl, "earn.format.source.upwork"),
      fiverr_mcp: formatMessage(intl, "earn.format.source.fiverr"),
      url_intake: formatMessage(intl, "earn.format.source.urlIntake"),
    },
  };
}

export function useFormat(): EarnFormatter {
  const { intl, locale } = useZCodeIntl();
  return useMemo(() => {
    const labels = buildEarnFormatLabels(intl);
    const localeTag = locale ?? DEFAULT_EARN_FORMAT_LOCALE;
    return {
      labels,
      relativeTime: (iso?: string | null) => relativeTime(iso, localeTag, labels),
      absoluteTime: (iso?: string | null) => absoluteTime(iso, localeTag, labels),
      shortAbsoluteTime: (iso?: string | null) => shortAbsoluteTime(iso, localeTag, labels),
      daysUntil: (iso?: string | null) => daysUntil(iso),
      formatNumber: (n?: number | null) => formatNumber(n, localeTag),
      formatMoney: (amount?: number | null, currency?: string | null) =>
        formatMoney(amount, currency, labels, localeTag),
      formatMoneyRange: (min?: number | null, max?: number | null, currency?: string | null) =>
        formatMoneyRange(min, max, currency, labels, localeTag),
      payUnitLabel: (unit?: string | null) => payUnitLabel(unit, labels),
      sourceLabel: (key?: string | null) => sourceLabel(key, labels),
      fromValue: (value: string) => labels.from.replace("{value}", value),
      upToValue: (value: string) => labels.upTo.replace("{value}", value),
    };
  }, [intl, locale]);
}
