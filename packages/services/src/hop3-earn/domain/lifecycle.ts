/**
 * Hop3 — Stage 1 application lifecycle rules (Worker B).
 *
 * Implements DOMAIN-MODEL.md sections 1.6 and 2 against the frozen contracts.
 * Non-negotiable rules encoded here:
 *  - Transitions are evidence-gated: a click or generated text is never
 *    sufficient evidence that an application was submitted, accepted,
 *    approved or paid (HOP3_RULES sections 2 and 6).
 *  - Forward transitions follow APPLICATION_STATUS_ORDER without skipping.
 *  - Terminal outcomes (rejected/withdrawn/expired/blocked) are recordable
 *    from any non-terminal state, but require a note.
 *  - No state is ever fabricated: 'payment_pending' does not touch paidAt,
 *    and 'paid' requires a positive amount plus evidence.
 *
 * Pure functions only — persistence lives in application-service.ts.
 */

import {
  APPLICATION_STATUS_ORDER,
  type ApplicationStatus,
} from "@zcode/shared";

/** Evidence supplied when recording a lifecycle event. */
export interface TransitionEvidence {
  evidenceType?: "user-reported" | "provider-confirmed" | "payment-confirmed";
  evidenceUrl?: string;
  note?: string;
  amountPaid?: number;
  hasDraft: boolean;
}

/** Terminal / paused outcomes (DOMAIN-MODEL 1.6). */
export const TERMINAL_APPLICATION_STATUSES: ApplicationStatus[] = [
  "rejected",
  "withdrawn",
  "expired",
  "blocked",
];

export function isTerminalApplicationStatus(status: ApplicationStatus): boolean {
  return TERMINAL_APPLICATION_STATUSES.includes(status);
}

function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUS_ORDER as string[]).includes(value) || (TERMINAL_APPLICATION_STATUSES as string[]).includes(value);
}

function statusIndex(status: ApplicationStatus): number {
  return APPLICATION_STATUS_ORDER.indexOf(status);
}

/**
 * Guard one lifecycle transition (DOMAIN-MODEL 1.6 / section 2).
 *
 * Ordering rules:
 *  - Forward moves must follow APPLICATION_STATUS_ORDER without skipping.
 *    The single sanctioned adjacency exception is 'qualification_pending'
 *    entered right after 'applied' (it is the next status in the frozen
 *    order; 'applied' -> 'accepted' would skip it and is rejected).
 *  - Backward moves are rejected (record a 'note' event instead).
 *  - Terminal targets are allowed from ANY non-terminal state.
 *
 * Evidence gates (independent of ordering):
 *  - 'prepared'  : a stored draft must exist (hasDraft).
 *  - 'applied'   : an evidenceUrl or note describing the actual submission —
 *                  a click or generated text is never sufficient.
 *  - 'accepted' / 'approved' : an evidenceType (user-reported minimum) —
 *                  clicks or generated text are insufficient evidence.
 *  - 'paid'      : amountPaid > 0 AND evidenceType of 'user-reported' or
 *                  'payment-confirmed' AND an evidenceUrl or note.
 *  - terminal targets: a note is required.
 */
export function canTransition(
  current: ApplicationStatus,
  target: ApplicationStatus,
  evidence: TransitionEvidence,
): { ok: boolean; reason?: string } {
  if (!isApplicationStatus(current)) {
    return { ok: false, reason: `Unknown current status "${String(current)}"` };
  }
  if (!isApplicationStatus(target)) {
    return { ok: false, reason: `Unknown target status "${String(target)}"` };
  }
  if (current === target) {
    return {
      ok: false,
      reason: `Application is already in status "${current}"; record a note event instead of repeating the status`,
    };
  }

  if (isTerminalApplicationStatus(current)) {
    return {
      ok: false,
      reason: `Application is in terminal status "${current}"; create a new application instead of transitioning it`,
    };
  }

  const hasEvidenceText =
    (typeof evidence.evidenceUrl === "string" && evidence.evidenceUrl.trim() !== "") ||
    (typeof evidence.note === "string" && evidence.note.trim() !== "");
  const hasNote = typeof evidence.note === "string" && evidence.note.trim() !== "";
  const hasEvidenceType =
    evidence.evidenceType === "user-reported" ||
    evidence.evidenceType === "provider-confirmed" ||
    evidence.evidenceType === "payment-confirmed";

  // --- Terminal targets: allowed from any non-terminal state, note required ---
  if (isTerminalApplicationStatus(target)) {
    if (!hasNote) {
      return {
        ok: false,
        reason: `Recording "${target}" requires a note explaining why the application was ${target}`,
      };
    }
    return { ok: true };
  }

  // --- Evidence gates for specific happy-path statuses -------------------------
  if (target === "prepared" && !evidence.hasDraft) {
    return {
      ok: false,
      reason:
        'Recording "prepared" requires a stored draft. Generate or paste the application materials first (they are reviewed before anything is sent).',
    };
  }

  if (target === "applied" && !hasEvidenceText) {
    return {
      ok: false,
      reason:
        'Recording "applied" requires evidence that the application was actually submitted: provide an evidence URL or a note describing the submission on the provider platform. A click or generated text is never sufficient.',
    };
  }

  if ((target === "accepted" || target === "approved") && !hasEvidenceType) {
    return {
      ok: false,
      reason: `Recording "${target}" requires an evidence type (user-reported, provider-confirmed, or payment-confirmed). Clicks or generated text are insufficient evidence.`,
    };
  }

  if (target === "paid") {
    if (typeof evidence.amountPaid !== "number" || !(evidence.amountPaid > 0)) {
      return {
        ok: false,
        reason:
          'Recording "paid" requires the amount actually received (amountPaid must be greater than 0). Do not record income without the real figure.',
      };
    }
    if (
      evidence.evidenceType !== "user-reported" &&
      evidence.evidenceType !== "payment-confirmed"
    ) {
      return {
        ok: false,
        reason:
          'Recording "paid" requires an evidence type of "user-reported" or "payment-confirmed". Clicks or generated text are insufficient evidence.',
      };
    }
    if (!hasEvidenceText) {
      return {
        ok: false,
        reason:
          'Recording "paid" requires an evidence URL or a note documenting the payment (for example a payout reference or statement line).',
      };
    }
  }

  // --- Ordering for non-terminal targets ---------------------------------------
  const currentIndex = statusIndex(current);
  const targetIndex = statusIndex(target);

  if (currentIndex === -1 || targetIndex === -1) {
    // Defensive: status is valid but not on the happy-path order (should not
    // happen for non-terminal values).
    return { ok: false, reason: `Status "${target}" is not on the application happy path` };
  }

  if (targetIndex <= currentIndex) {
    return {
      ok: false,
      reason: `Cannot move from "${current}" back to "${target}"; record a note event instead`,
    };
  }

  if (targetIndex > currentIndex + 1) {
    // The only sanctioned non-adjacent move is 'applied' ->
    // 'qualification_pending' (which is adjacent in the frozen order; kept
    // explicit here so the policy is visible in one place).
    const isSanctionedException = current === "applied" && target === "qualification_pending";
    if (!isSanctionedException) {
      return {
        ok: false,
        reason: `Cannot skip from "${current}" to "${target}" — lifecycle states are recorded in order, each with its own evidence`,
      };
    }
  }

  return { ok: true };
}

/**
 * Row field updates produced by one transition.
 *
 * Status -> Application column mapping (deliberate design, see DOMAIN-MODEL 1.6):
 *  - 'draft'              : never a transition target (nothing precedes it).
 *  - 'prepared'           : no column updates — draft fields are managed by
 *                           saveDraft; the ApplicationEvent is the record.
 *  - 'applied'            : submittedAt = now; submittedEvidence = url||note;
 *                           submittedChannel when a channel is supplied.
 *  - 'qualification_pending': status only — the event row carries the time.
 *  - 'accepted'           : acceptedAt = now.
 *  - 'in_progress'        : status only by design — assignment start has no
 *                           Stage 1 column; the event row carries the time.
 *  - 'submitted'          : completedAt = now — 'submitted' here means WORK
 *                           SUBMITTED, which is the work-completion timestamp.
 *  - 'approved'           : approvedAt = now.
 *  - 'payment_pending'    : status only — deliberately NO paidAt: payment has
 *                           not been received yet, and fabricating paidAt here
 *                           would violate "never fabricate payment".
 *  - 'paid'               : paidAt = now; amountPaid from the evidence
 *                           (positive, enforced by canTransition); paidCurrency
 *                           from options; paymentEvidence = url||note.
 *  - rejected/withdrawn/
 *    expired/blocked      : outcomeNotes = note when provided (the event row
 *                           remains the audit record).
 */
export interface TransitionFieldUpdates {
  submittedAt?: Date;
  submittedChannel?: string;
  submittedEvidence?: string;
  acceptedAt?: Date;
  completedAt?: Date;
  approvedAt?: Date;
  paidAt?: Date;
  amountPaid?: number;
  paidCurrency?: string;
  paymentEvidence?: string;
  outcomeNotes?: string;
}

export function applyTransitionFields(
  target: ApplicationStatus,
  evidence: TransitionEvidence,
  options: { paidCurrency?: string; channel?: string } = {},
): TransitionFieldUpdates {
  const now = new Date();
  const evidenceUrl = typeof evidence.evidenceUrl === "string" ? evidence.evidenceUrl.trim() : "";
  const note = typeof evidence.note === "string" ? evidence.note.trim() : "";
  const evidenceText = evidenceUrl || note || undefined;

  switch (target) {
    case "applied":
      return {
        submittedAt: now,
        submittedEvidence: evidenceText,
        ...(options.channel ? { submittedChannel: options.channel } : {}),
      };
    case "accepted":
      return { acceptedAt: now };
    case "submitted":
      // Work submitted == work completed for timestamp purposes.
      return { completedAt: now };
    case "approved":
      return { approvedAt: now };
    case "paid":
      return {
        paidAt: now,
        amountPaid: typeof evidence.amountPaid === "number" ? evidence.amountPaid : undefined,
        paidCurrency: options.paidCurrency,
        paymentEvidence: evidenceText,
      };
    case "rejected":
    case "withdrawn":
    case "expired":
    case "blocked":
      return note ? { outcomeNotes: note } : {};
    case "prepared":
    case "qualification_pending":
    case "in_progress":
    case "payment_pending":
    default:
      // Status-only transitions (and 'draft', which is never a target).
      return {};
  }
}
