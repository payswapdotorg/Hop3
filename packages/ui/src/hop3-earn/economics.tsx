/**
 * Hop3 Earn — economics rendering (Stage 1 UI port).
 *
 * Gross and net are never collapsed. Estimates are always labelled as
 * estimates with their assumptions and unknown costs; unknown payout is
 * shown as unknown, never as a guaranteed payable amount. The frozen
 * ECONOMICS_DISCLAIMER / PAYOUT_UNKNOWN_DISCLAIMER render verbatim.
 */

import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  ECONOMICS_DISCLAIMER,
  PAYOUT_UNKNOWN_DISCLAIMER,
  type CostLine,
  type EconomicsEstimate,
  type FeeLine,
} from "@zcode/shared";

import { SUCCESS_OUTLINE, WARNING_OUTLINE } from "./badges.js";
import { useFormat } from "./useFormat.js";

function ConfidenceBadge({ confidence }: { confidence: EconomicsEstimate["confidence"] }) {
  const { intl } = useZCodeIntl();
  if (confidence === "high") {
    return (
      <Badge variant="outline" className={SUCCESS_OUTLINE}>
        {intl.formatMessage({ id: "earn.econ.confidence.high" })}
      </Badge>
    );
  }
  if (confidence === "low") {
    return (
      <Badge variant="outline" className={WARNING_OUTLINE}>
        {intl.formatMessage({ id: "earn.econ.confidence.low" })}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      {intl.formatMessage({ id: "earn.econ.confidence.medium" })}
    </Badge>
  );
}

/** Full breakdown: fees table, costs, assumptions, unknown costs, disclaimer. */
export function EconomicsBreakdown({ economics }: { economics: EconomicsEstimate }) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const netKnown = economics.estimatedNetMin != null || economics.estimatedNetMax != null;

  const feeValueText = (fee: FeeLine): string => {
    if (fee.kind === "percent") {
      return fee.value != null
        ? `${format.formatNumber(fee.value)}%`
        : intl.formatMessage({ id: "earn.econ.rateUnknown" });
    }
    return fee.value != null
      ? format.formatMoney(fee.value, fee.currency)
      : intl.formatMessage({ id: "earn.econ.amountUnknown" });
  };

  const costValueText = (cost: CostLine): string => {
    const parts: string[] = [];
    if (cost.amount != null) parts.push(format.formatMoney(cost.amount, cost.currency));
    if (cost.hours != null) parts.push(`${format.formatNumber(cost.hours)}h`);
    if (parts.length === 0) parts.push(intl.formatMessage({ id: "earn.econ.amountUnknown" }));
    return parts.join(" · ");
  };

  return (
    <div className="space-y-4 text-ui-sm">
      <div className="space-y-1">
        <p className="font-medium">{intl.formatMessage({ id: "earn.econ.estimate" })}</p>
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.econ.grossNet" }, {
            gross: format.formatMoneyRange(
              economics.grossMin,
              economics.grossMax,
              economics.currency,
            ),
            unit: format.payUnitLabel(economics.payUnit),
            net: netKnown
              ? format.formatMoneyRange(
                  economics.estimatedNetMin,
                  economics.estimatedNetMax,
                  economics.currency,
                )
              : intl.formatMessage({ id: "earn.format.unknown" }),
          })}
        </p>
        {economics.effectiveHourlyMin != null || economics.effectiveHourlyMax != null ? (
          <p className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage({ id: "earn.econ.effectiveHourly" }, {
              range: format.formatMoneyRange(
                economics.effectiveHourlyMin,
                economics.effectiveHourlyMax,
                economics.currency,
              ),
            })}
          </p>
        ) : null}
        {economics.estimatedHours?.min != null || economics.estimatedHours?.max != null ? (
          <p className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage({ id: "earn.econ.estimatedHours" }, {
              hours:
                economics.estimatedHours.min != null && economics.estimatedHours.max != null
                  ? `${format.formatNumber(economics.estimatedHours.min)}–${format.formatNumber(economics.estimatedHours.max)}`
                  : economics.estimatedHours.min != null
                    ? format.fromValue(format.formatNumber(economics.estimatedHours.min))
                    : format.upToValue(
                        format.formatNumber(economics.estimatedHours.max ?? null),
                      ),
            })}
          </p>
        ) : null}
        <div className="pt-1">
          <ConfidenceBadge confidence={economics.confidence} />
        </div>
      </div>

      {economics.fees.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.econ.fees" })}
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed text-ui-xs">
              <thead className="bg-surface text-foreground-subtle">
                <tr>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    {intl.formatMessage({ id: "earn.econ.table.fee" })}
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    {intl.formatMessage({ id: "earn.econ.table.value" })}
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    {intl.formatMessage({ id: "earn.econ.table.basis" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {economics.fees.map((fee, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-2 align-top">
                      {fee.label}
                      {fee.note ? (
                        <p className="text-foreground-subtle">{fee.note}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 align-top">{feeValueText(fee)}</td>
                    <td className="px-2 py-2 align-top">
                      {fee.basis === "known" ? (
                        <Badge variant="outline" className={SUCCESS_OUTLINE}>
                          {intl.formatMessage({ id: "earn.econ.known" })}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={WARNING_OUTLINE}>
                          {intl.formatMessage({ id: "earn.econ.assumed" })}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {economics.costs.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.econ.costs" })}
          </p>
          <ul className="space-y-1">
            {economics.costs.map((cost, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-ui-xs">
                <span>{cost.label}</span>
                <span className="text-foreground-subtle">{costValueText(cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {economics.assumptions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.econ.assumptions" })}
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-ui-xs text-foreground-subtle">
            {economics.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {economics.unknownCostItems.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-ui-xs font-medium text-warning">
            {intl.formatMessage({ id: "earn.econ.unknownCosts" })}
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-ui-xs text-foreground-subtle">
            {economics.unknownCostItems.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-border pt-2 text-ui-xs text-foreground-subtle">
        {ECONOMICS_DISCLAIMER}
      </p>
    </div>
  );
}

/** Compact gross → net line used on cards. */
export function EconomicsLine({ economics }: { economics: EconomicsEstimate }) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const netKnown = economics.estimatedNetMin != null || economics.estimatedNetMax != null;

  return (
    <p className="text-ui-xs leading-relaxed text-foreground-subtle">
      <span>
        {intl.formatMessage({ id: "earn.econ.grossOnly" }, {
          gross: format.formatMoneyRange(
            economics.grossMin,
            economics.grossMax,
            economics.currency,
          ),
          unit: format.payUnitLabel(economics.payUnit),
        })}
      </span>{" "}
      {netKnown ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label={intl.formatMessage({ id: "earn.econ.netAria" })}
            >
              {intl.formatMessage({ id: "earn.econ.netLink" }, {
                range: format.formatMoneyRange(
                  economics.estimatedNetMin,
                  economics.estimatedNetMax,
                  economics.currency,
                ),
              })}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96">
            <EconomicsBreakdown economics={economics} />
          </PopoverContent>
        </Popover>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="cursor-help text-warning">
              {intl.formatMessage({ id: "earn.econ.payoutUnknown" })}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{PAYOUT_UNKNOWN_DISCLAIMER}</TooltipContent>
        </Tooltip>
      )}
    </p>
  );
}

/** Amber unknown-payout notice used in the detail view. */
export function PayoutUnknownNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-surface px-3 py-2 text-ui-xs text-warning-surface-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{PAYOUT_UNKNOWN_DISCLAIMER}</span>
    </div>
  );
}
