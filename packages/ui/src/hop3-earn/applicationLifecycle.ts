/**
 * Hop3 Earn — application lifecycle presentation helpers (Stage 1 UI port).
 *
 * The stepper order is the frozen `APPLICATION_STATUS_ORDER`; terminal
 * statuses never advance further and offer a fresh tracker instead.
 * Unknown stays unknown: nothing here re-classifies a status.
 */

import { APPLICATION_STATUS_ORDER, type ApplicationStatus } from "@zcode/shared";

/** Terminal lifecycle outcomes (from the reference domain guard; UI-side copy
 *  because the ui layer must not import the services module directly). */
export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "rejected",
  "withdrawn",
  "expired",
  "blocked",
] as const;

export function isTerminal(status: string): boolean {
  return TERMINAL_APPLICATION_STATUSES.includes(status as ApplicationStatus);
}

export function statusIndex(status: string): number {
  return APPLICATION_STATUS_ORDER.indexOf(status as ApplicationStatus);
}

export function nextStatus(status: string): ApplicationStatus | null {
  const index = statusIndex(status);
  if (index < 0 || index + 1 >= APPLICATION_STATUS_ORDER.length) return null;
  return APPLICATION_STATUS_ORDER[index + 1] ?? null;
}

/** i18n key for the per-status description shown in the stepper tooltip. */
export function statusDescriptionKey(status: ApplicationStatus | string): string {
  switch (status) {
    case "draft":
      return "earn.app.status.draft";
    case "prepared":
      return "earn.app.status.prepared";
    case "applied":
      return "earn.app.status.applied";
    case "qualification_pending":
      return "earn.app.status.qualification_pending";
    case "accepted":
      return "earn.app.status.accepted";
    case "in_progress":
      return "earn.app.status.in_progress";
    case "submitted":
      return "earn.app.status.submitted";
    case "approved":
      return "earn.app.status.approved";
    case "payment_pending":
      return "earn.app.status.payment_pending";
    case "paid":
      return "earn.app.status.paid";
    default:
      return "earn.app.status.terminalOutcome";
  }
}

export const EVIDENCE_TYPES = ["user-reported", "provider-confirmed", "payment-confirmed"] as const;

export const CHANNELS = ["oneforma-dashboard", "upwork-web", "fiverr-web", "other"] as const;
