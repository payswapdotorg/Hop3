/**
 * Hop3 — Stage 1 economics estimate (Worker B).
 *
 * Implements DOMAIN-MODEL.md section 1.5 against the frozen contracts.
 * Non-negotiable rules encoded here:
 *  - Gross and net are never collapsed: net is derived only from stated gross
 *    minus percent fees and KNOWN amount fees, and is labelled an estimate.
 *  - Estimates are never guarantees (guaranteed is always false).
 *  - Unknown costs stay unknown; nothing is defaulted into a claim.
 *  - The Upwork freelancer service fee is applied as an ASSUMED 10% line with
 *    a re-verification note (CONNECTORS.md 2.1: "normal Upwork fees apply" —
 *    the exact current schedule must be rechecked before reliance).
 *  - For every other source, only fees the listing itself states (basis
 *    'known') are shown; otherwise fees are flagged unknown.
 *
 * Node runtime only (route handlers). No 'use client'.
 */

import {
  ECONOMICS_DISCLAIMER,
  type ApplicationSpec,
  type CompensationSpec,
  type CostLine,
  type EconomicsEstimate,
  type FeeLine,
  type PayoutSpec,
  type ProfileDTO,
  type RequirementsSpec,
  type TimeSpec,
} from '@/lib/contracts';
import type { OpportunityFacts } from '@/lib/domain/eligibility';

/**
 * Facts needed for economics. Extends the eligibility facts with the specs the
 * estimate reads (compensation, application costs, time, work mode). Callers
 * pass one superset object to both evaluateEligibility and computeEconomics.
 */
export interface EconomicsFacts extends OpportunityFacts {
  compensation?: CompensationSpec;
  application?: ApplicationSpec;
  time?: TimeSpec;
  payout?: PayoutSpec;
  requirements?: RequirementsSpec;
  workMode?: string;
}

/** Assumed Upwork freelancer service fee (CONNECTORS.md 2.1, re-verify). */
const UPWORK_SERVICE_FEE: FeeLine = {
  label: 'Upwork freelancer service fee',
  kind: 'percent',
  value: 10,
  basis: 'assumed',
  note: 'Re-verify the current Upwork fee schedule before relying on this estimate',
};

/** ISO currency codes accepted when parsing "amount + code" fee statements. */
const KNOWN_CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'TZS', 'UGX', 'RWF', 'ZMW', 'ZAR',
  'XOF', 'XAF', 'INR', 'PHP', 'CAD', 'AUD', 'JPY', 'CNY', 'BRL', 'MXN', 'ARS',
];

/**
 * Parse explicit percentage fees out of the listing's own fee text.
 * Conservative: only "NN%" patterns become numeric fee lines; the raw listing
 * text is always preserved in the note so the user can check the source.
 */
function parsePercentFees(feesText: string): FeeLine[] {
  const lines: FeeLine[] = [];
  const pattern = /(\d+(?:[.,]\d+)?)\s*%/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(feesText)) !== null && lines.length < 5) {
    const value = Number.parseFloat(match[1].replace(',', '.'));
    if (Number.isFinite(value) && value >= 0) {
      lines.push({
        label: 'Fee stated by the listing',
        kind: 'percent',
        value,
        basis: 'known',
        note: feesText.trim(),
      });
    }
  }
  return lines;
}

/**
 * Parse explicit "ISO-code amount" fee statements (both orders: "USD 25" and
 * "25 USD"). Bare currency symbols ("$25") are deliberately NOT mapped to a
 * currency — assuming USD from a symbol would fabricate a currency.
 */
function parseAmountFees(feesText: string): FeeLine[] {
  const codes = KNOWN_CURRENCY_CODES.join('|');
  const pattern = new RegExp(`(?:${codes})\\s+(\\d+(?:[.,]\\d+)?)|(\\d+(?:[.,]\\d+)?)\\s+(?:${codes})`, 'gi');
  const lines: FeeLine[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(feesText)) !== null && lines.length < 5) {
    const raw = match[1] ?? match[2];
    const currencyMatch = match[0].toUpperCase().match(new RegExp(`(${codes})`));
    const value = Number.parseFloat((raw ?? '').replace(',', '.'));
    if (Number.isFinite(value) && value >= 0 && currencyMatch) {
      lines.push({
        label: 'Fee stated by the listing',
        kind: 'amount',
        value,
        currency: currencyMatch[1],
        basis: 'known',
        note: feesText.trim(),
      });
    }
  }
  return lines;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Compute a conservative economics estimate for one listing (DOMAIN-MODEL 1.5).
 *
 * `profile` is part of the frozen Stage 1 signature but is intentionally unused
 * for now: Stage 1 economics derive from listing facts only (profile-aware
 * costs such as user-specific payout rails arrive in a later stage). Nothing is
 * inferred from the profile into money figures.
 */
export function computeEconomics(
  opp: EconomicsFacts,
  profile: ProfileDTO | null,
): EconomicsEstimate {
  void profile; // signature is frozen; reserved for later profile-aware costs

  const compensation = opp.compensation;
  const payout = opp.payout;
  const application = opp.application;
  const time = opp.time;

  const currency = compensation?.currency;
  const grossMin = finiteNumber(compensation?.grossMin);
  const grossMax = finiteNumber(compensation?.grossMax);
  const payUnit = compensation?.payUnit;
  const hasGross = grossMin !== undefined || grossMax !== undefined;

  // --- Fees ---------------------------------------------------------------
  let fees: FeeLine[] = [];
  let feesStatedButUnquantified: string | null = null;

  if (opp.sourceKey === 'upwork_mcp') {
    // The assumed Upwork line replaces per-listing fee parsing for this source
    // (avoids double-counting when a listing also mentions its service fee).
    fees = [UPWORK_SERVICE_FEE];
  } else {
    const feesText = typeof payout?.fees === 'string' ? payout.fees.trim() : '';
    if (feesText) {
      const parsed = [...parsePercentFees(feesText), ...parseAmountFees(feesText)];
      if (parsed.length > 0) {
        fees = parsed;
      } else {
        // Stated in text but not machine-readable: keep the source wording,
        // never invent a number.
        feesStatedButUnquantified = `Platform/payout fees are stated in listing text but not machine-readable: "${feesText.slice(0, 200)}"`;
      }
    }
  }

  // --- Costs & unknown cost items ------------------------------------------
  const costs: CostLine[] = [];
  const unknownCostItems: string[] = [];

  if (opp.sourceKey !== 'upwork_mcp' && !(typeof payout?.fees === 'string' && payout.fees.trim() !== '')) {
    unknownCostItems.push('Platform/payout fees unknown');
  }
  if (feesStatedButUnquantified) {
    unknownCostItems.push(feesStatedButUnquantified);
  }
  if (!hasGross) {
    unknownCostItems.push('Compensation is not stated by the listing (gross and net unknown)');
  }

  const connects = finiteNumber(application?.connects);
  if (connects !== undefined && connects > 0) {
    costs.push({
      label: 'Connects required to apply (amount varies)',
      note: `Listing states ${connects} Connects to apply; the cost per Connect is not fixed by the listing`,
    });
  }

  const applicationCost = application?.applicationCost;
  if (
    applicationCost &&
    (applicationCost.amount !== undefined ||
      applicationCost.currency !== undefined ||
      (applicationCost.note !== undefined && applicationCost.note.trim() !== ''))
  ) {
    costs.push({
      label: 'Application cost stated by the listing',
      amount: finiteNumber(applicationCost.amount),
      currency: applicationCost.currency,
      note: applicationCost.note,
    });
  }

  if (application?.qualificationTest === true) {
    costs.push({
      label: 'Unpaid qualification/test time (not quantified by source)',
    });
  }

  if (opp.workMode === 'local') {
    unknownCostItems.push('Travel/local costs unknown');
  }

  // --- Hours ---------------------------------------------------------------
  const hoursMin = finiteNumber(time?.hoursMin);
  const hoursMax = finiteNumber(time?.hoursMax);
  const estimatedHours =
    hoursMin !== undefined || hoursMax !== undefined
      ? { min: hoursMin, max: hoursMax }
      : undefined;

  // --- Net ------------------------------------------------------------------
  // Subtract percentage fees (known or assumed — the assumed Upwork 10% is the
  // canonical case) and only amount fees with basis 'known' and a real number.
  const percentSum = fees
    .filter((f) => f.kind === 'percent' && finiteNumber(f.value) !== undefined)
    .reduce((sum, f) => sum + (f.value ?? 0), 0);
  const knownAmountSum = fees
    .filter((f) => f.kind === 'amount' && f.basis === 'known' && finiteNumber(f.value) !== undefined)
    .reduce((sum, f) => sum + (f.value ?? 0), 0);

  const netOf = (gross: number | undefined): number | undefined =>
    gross === undefined ? undefined : round2(gross * (1 - percentSum / 100) - knownAmountSum);

  const estimatedNetMin = hasGross ? netOf(grossMin) : undefined;
  const estimatedNetMax = hasGross ? netOf(grossMax) : undefined;

  // --- Effective hourly -------------------------------------------------------
  // Conservative cross-division: the lowest credible hourly rate pairs the
  // lowest net with the highest hours, and the highest rate pairs the highest
  // net with the lowest hours. Only computed when net AND hours are known.
  const effectiveHourlyMin =
    estimatedNetMin !== undefined && hoursMax !== undefined && hoursMax > 0
      ? round2(estimatedNetMin / hoursMax)
      : undefined;
  const effectiveHourlyMax =
    estimatedNetMax !== undefined && hoursMin !== undefined && hoursMin > 0
      ? round2(estimatedNetMax / hoursMin)
      : undefined;

  // --- Assumptions -------------------------------------------------------------
  const assumptions: string[] = [
    ECONOMICS_DISCLAIMER,
    'Taxes are not calculated and nothing here is tax advice.',
    'Estimated net subtracts percentage fees and stated amount fees only; application costs, Connects, travel, payout thresholds and taxes are not subtracted.',
  ];
  if (payout?.threshold && finiteNumber(payout.threshold.amount) !== undefined) {
    assumptions.push('Payout thresholds may delay when funds are received');
  }
  for (const fee of fees) {
    if (fee.note) assumptions.push(fee.note);
  }

  // --- Confidence ----------------------------------------------------------------
  // high   : every input source-fixed, hours known, nothing unknown/unassumed.
  // medium : complete inputs but assumed fees or unquantified cost lines.
  // low    : any unknown cost item, missing hours, or missing compensation.
  const hoursMissing = estimatedHours === undefined;
  const hasAssumedFees = fees.some((f) => f.basis === 'assumed');
  const hasUnquantifiedCosts = costs.some((c) => finiteNumber(c.amount) === undefined);
  const confidence: EconomicsEstimate['confidence'] =
    unknownCostItems.length > 0 || hoursMissing || !hasGross
      ? 'low'
      : hasAssumedFees || hasUnquantifiedCosts
        ? 'medium'
        : 'high';

  return {
    currency,
    grossMin,
    grossMax,
    payUnit,
    fees,
    costs,
    estimatedHours,
    estimatedNetMin,
    estimatedNetMax,
    effectiveHourlyMin,
    effectiveHourlyMax,
    assumptions,
    unknownCostItems,
    confidence,
    guaranteed: false,
    calculatedAt: new Date().toISOString(),
  };
}
