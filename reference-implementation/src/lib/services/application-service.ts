/**
 * Hop3 — Stage 1 application/outcome tracking service (Worker B).
 *
 * Implements DOMAIN-MODEL 1.6 + section 2 against the frozen contracts:
 *  - Creating a tracker never submits anything; materials are prepared from
 *    TRUTHFUL profile facts only (missing stays missing; no fabricated
 *    experience, ratings or income).
 *  - Draft generation is a deterministic rule template (draftModel
 *    'hop3-stage1-rules-v1') — transparent, no model guesswork.
 *  - Lifecycle transitions go through domain/lifecycle.canTransition (ordering
 *    + evidence gates) and every transition appends an ApplicationEvent row
 *    so the outcome history is auditable.
 *  - 'paid' is only ever recorded from user-supplied amount + evidence.
 *
 * Node runtime only (route handlers). No 'use client'.
 */

import { db } from '@/lib/db';
import type { Application as ApplicationRow } from '@prisma/client';
import { z } from 'zod';
import {
  APPLICATION_STATUS_ORDER,
  NO_AUTO_SUBMIT_NOTICE,
  type ApplicationDTO,
  type ApplicationDraftContent,
  type ProfileDTO,
} from '@/lib/contracts';
import {
  applyTransitionFields,
  canTransition,
  isTerminalApplicationStatus,
  type TransitionEvidence,
} from '@/lib/domain/lifecycle';
import { getProfile } from '@/lib/services/profile-service';

// ---------------------------------------------------------------------------
// Draft content validation
// ---------------------------------------------------------------------------

const draftContentSchema = z.object({
  checklist: z.array(z.string().trim().min(1).max(300)).max(30),
  messageDraft: z.string().trim().min(1).max(8000),
  notice: z.string().trim().min(1).max(1000),
});

// ---------------------------------------------------------------------------
// Row -> DTO
// ---------------------------------------------------------------------------

function toApplicationDto(
  row: ApplicationRow & {
    opportunity: { title: string; platform: string; canonicalUrl: string };
    events: Array<{
      id: string;
      eventType: string;
      evidenceType: string | null;
      evidenceUrl: string | null;
      note: string | null;
      createdAt: Date;
    }>;
  },
): ApplicationDTO {
  return {
    id: row.id,
    opportunityId: row.opportunityId,
    opportunityTitle: row.opportunity.title,
    platform: row.opportunity.platform,
    canonicalUrl: row.opportunity.canonicalUrl,
    status: row.status as ApplicationDTO['status'],
    draft: row.draft,
    draftGeneratedAt: row.draftGeneratedAt ? row.draftGeneratedAt.toISOString() : null,
    draftModel: row.draftModel,
    draftEditedByUser: row.draftEditedByUser,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    submittedChannel: row.submittedChannel,
    submittedEvidence: row.submittedEvidence,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    amountPaid: row.amountPaid,
    paidCurrency: row.paidCurrency,
    paymentEvidence: row.paymentEvidence,
    outcomeNotes: row.outcomeNotes,
    events: row.events
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((event) => ({
        id: event.id,
        eventType: event.eventType,
        evidenceType: event.evidenceType,
        evidenceUrl: event.evidenceUrl,
        note: event.note,
        createdAt: event.createdAt.toISOString(),
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const APPLICATION_INCLUDE = {
  opportunity: { select: { title: true, platform: true, canonicalUrl: true } },
  events: true,
} as const;

export async function listApplications(): Promise<ApplicationDTO[]> {
  const rows = await db.application.findMany({
    include: APPLICATION_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toApplicationDto);
}

export async function getApplication(id: string): Promise<ApplicationDTO | null> {
  const row = await db.application.findUnique({ where: { id }, include: APPLICATION_INCLUDE });
  return row ? toApplicationDto(row) : null;
}

// ---------------------------------------------------------------------------
// Create a tracker (never submits anything)
// ---------------------------------------------------------------------------

export async function createApplication(opportunityId: string): Promise<ApplicationDTO | null> {
  const opportunity = await db.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) return null;

  const existing = await db.application.findFirst({
    where: { opportunityId, status: { notIn: ['rejected', 'withdrawn', 'expired', 'blocked'] } },
    include: APPLICATION_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    // One active tracker per opportunity: return the existing one honestly.
    return toApplicationDto(existing);
  }

  const row = await db.application.create({
    data: {
      opportunityId,
      status: 'draft',
      events: {
        create: {
          eventType: 'note',
          note:
            'Application tracker created. Hop3 will never submit for you: prepare materials here, review them, submit on the provider platform yourself, then record what happened.',
        },
      },
    },
    include: APPLICATION_INCLUDE,
  });
  return toApplicationDto(row);
}

// ---------------------------------------------------------------------------
// Truthful draft generation (rule template, no model)
// ---------------------------------------------------------------------------

interface ListingForDraft {
  title: string;
  platform: string;
  requirements?: { skills?: string[]; languages?: string[]; experience?: string };
  application?: { steps?: string[]; qualificationTest?: boolean; requiredData?: string[] };
  compensation?: { currency?: string; grossMin?: number; grossMax?: number; payUnit?: string };
}

interface DraftSourceRow {
  title: string;
  platform: string;
  requirementsJson: string | null;
  applicationJson: string | null;
  compensationJson: string | null;
}

function listingForDraft(row: DraftSourceRow): ListingForDraft {
  const parse = <T>(value: string | null): T | undefined => {
    if (value == null || value.trim() === '') return undefined;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' ? (parsed as T) : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    title: row.title,
    platform: row.platform,
    requirements: parse(row.requirementsJson),
    application: parse(row.applicationJson),
    compensation: parse(row.compensationJson),
  };
}

function buildChecklist(listing: ListingForDraft, profile: ProfileDTO | null): string[] {
  const items: string[] = [];
  if (!profile) {
    items.push('Create your worker profile in the Profile tab so drafts can use your real details');
  }
  for (const step of listing.application?.steps ?? []) {
    if (step.trim() !== '') items.push(`Listing application step: ${step}`);
  }
  for (const required of listing.application?.requiredData ?? []) {
    if (required.trim() !== '') items.push(`Listing asks for: ${required}`);
  }
  if (listing.application?.qualificationTest === true) {
    items.push('Unpaid qualification test — decide whether the time cost is worth it before applying');
  }
  if ((listing.requirements?.skills ?? []).length > 0) {
    items.push(`Check you truly have every listed skill: ${(listing.requirements?.skills ?? []).join(', ')}`);
  }
  if ((listing.requirements?.languages ?? []).length > 0) {
    items.push(`Confirm your language level for: ${(listing.requirements?.languages ?? []).join(', ')}`);
  }
  items.push('Review every claim in this draft yourself — edit anything that is not exactly true');
  items.push('Submit on the provider platform yourself (Hop3 never submits for you)');
  items.push('Record what happened afterwards in the Applications tab (accepted, completed, paid)');
  return [...new Set(items)].slice(0, 30);
}

function buildMessageDraft(listing: ListingForDraft, profile: ProfileDTO | null): string {
  const lines: string[] = [];
  lines.push(`Hello,`);
  lines.push('');
  lines.push(`I would like to apply for "${listing.title}" on ${listing.platform}.`);
  lines.push('');
  lines.push('About me (from my own Hop3 worker profile — edit anything that is not exactly true):');
  if (profile) {
    if (profile.displayName) lines.push(`- Name: ${profile.displayName}`);
    if (profile.countryCode) {
      lines.push(`- Country: ${profile.countryCode}${profile.regionNote ? ` (${profile.regionNote})` : ''}`);
    }
    if (profile.languages.length > 0) {
      lines.push(
        `- Languages: ${profile.languages.map((l) => `${l.code} (${l.proficiency})`).join(', ')}`,
      );
    }
    if (profile.skills.length > 0) {
      lines.push(
        `- Skills I list: ${profile.skills.map((s) => `${s.name} (${s.experienceBand})`).join(', ')}`,
      );
    }
    if (profile.qualifications.length > 0) {
      lines.push(
        `- Qualifications (self-declared unless marked): ${profile.qualifications
          .map((q) => `${q.type}${q.issuer ? ` — ${q.issuer}` : ''}${q.year ? `, ${q.year}` : ''} [${q.verificationState}]`)
          .join('; ')}`,
      );
    }
    if (profile.weeklyHours > 0) {
      lines.push(`- Availability: about ${profile.weeklyHours} hours per week`);
    }
    if (profile.equipment.length > 0) {
      lines.push(`- Equipment: ${profile.equipment.map((e) => e.kind).join(', ')}`);
    }
    lines.push(`- Preferred work mode: ${profile.workMode}`);
  } else {
    lines.push(
      '- [Your profile is not created yet — fill the Profile tab and regenerate this draft so your real details appear here]',
    );
  }
  lines.push('');
  const listingSkills = listing.requirements?.skills ?? [];
  if (listingSkills.length > 0) {
    lines.push(
      'Regarding the listed requirements, please consider (only keep what is actually true for you):',
    );
    for (const skill of listingSkills) {
      lines.push(`- ${skill}: [describe your real experience with ${skill} — no invented projects or years]`);
    }
  } else {
    lines.push(
      'The listing does not state required skills, so describe only the experience that is genuinely relevant:',
    );
    lines.push('- [your relevant experience — only what is true]');
  }
  lines.push('');
  const comp = listing.compensation;
  if (comp && (comp.grossMin !== undefined || comp.grossMax !== undefined)) {
    const range =
      comp.grossMin !== undefined && comp.grossMax !== undefined && comp.grossMin !== comp.grossMax
        ? `${comp.grossMin}–${comp.grossMax}`
        : (comp.grossMin ?? comp.grossMax);
    lines.push(
      `My proposed terms: the listing states ${range}${comp.currency ? ` ${comp.currency}` : ''}${
        comp.payUnit ? ` per ${comp.payUnit}` : ''
      }; please confirm final terms on the platform.`,
    );
  } else {
    lines.push('My proposed terms: [state your rate or ask for the stated terms — never invent a rate]');
  }
  lines.push('');
  lines.push(
    'This draft was generated by Hop3 from my own profile and the public listing. I reviewed it and I will submit it myself.',
  );
  lines.push('');
  lines.push('Best regards,');
  lines.push(profile?.displayName ? profile.displayName : '[your name]');
  return lines.join('\n');
}

/**
 * Generate a draft from truthful profile facts + the listing (rule template,
 * draftModel 'hop3-stage1-rules-v1'). Never fabricates experience or income.
 */
export async function prepareDraft(id: string): Promise<ApplicationDTO | null> {
  const row = await db.application.findUnique({
    where: { id },
    include: { opportunity: true },
  });
  if (!row) return null;

  const profile = await getProfile();
  const listing = listingForDraft(row.opportunity);

  const draft: ApplicationDraftContent = {
    checklist: buildChecklist(listing, profile),
    messageDraft: buildMessageDraft(listing, profile),
    notice: NO_AUTO_SUBMIT_NOTICE,
  };

  const updated = await db.application.update({
    where: { id },
    data: {
      draft: JSON.stringify(draft),
      draftGeneratedAt: new Date(),
      draftModel: 'hop3-stage1-rules-v1',
    },
  });
  await db.applicationEvent.create({
    data: {
      applicationId: id,
      eventType: 'note',
      note: `Draft generated (rule template hop3-stage1-rules-v1 — profile facts + listing facts only; review every claim before use).`,
    },
  });
  void updated;

  return getApplication(id);
}

// ---------------------------------------------------------------------------
// Save a user-edited draft
// ---------------------------------------------------------------------------

export async function saveDraft(
  id: string,
  input: unknown,
): Promise<{ ok: true; application: ApplicationDTO } | { ok: false; reason: string }> {
  const row = await db.application.findUnique({ where: { id } });
  if (!row) return { ok: false, reason: 'Application not found' };

  const parsed = draftContentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Invalid draft content: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    };
  }
  const draft = parsed.data;

  await db.application.update({
    where: { id },
    data: {
      draft: JSON.stringify({
        checklist: draft.checklist,
        messageDraft: draft.messageDraft,
        notice: draft.notice,
      }),
      draftEditedByUser: true,
    },
  });
  await db.applicationEvent.create({
    data: {
      applicationId: id,
      eventType: 'draft_edited',
      note: 'Draft edited and saved by the user.',
    },
  });

  const application = await getApplication(id);
  if (!application) return { ok: false, reason: 'Application not found' };
  return { ok: true, application };
}

// ---------------------------------------------------------------------------
// Record an event / lifecycle transition (the only way states change)
// ---------------------------------------------------------------------------

export interface RecordEventInput {
  eventType: string;
  evidenceType?: 'user-reported' | 'provider-confirmed' | 'payment-confirmed';
  evidenceUrl?: string;
  note?: string;
  channel?: string;
  amountPaid?: number;
  paidCurrency?: string;
}

const recordEventSchema = z.object({
  eventType: z.string().trim().min(1).max(64),
  evidenceType: z.enum(['user-reported', 'provider-confirmed', 'payment-confirmed']).optional(),
  evidenceUrl: z.string().trim().max(2000).optional(),
  note: z.string().trim().max(4000).optional(),
  channel: z.string().trim().max(64).optional(),
  amountPaid: z.number().optional(), // domain layer enforces amount > 0 for 'paid' with its own message
  paidCurrency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
});

const KNOWN_STATUS_EVENTS = new Set<string>([
  ...APPLICATION_STATUS_ORDER,
  'rejected',
  'withdrawn',
  'expired',
  'blocked',
]);

export async function recordEvent(
  id: string,
  input: unknown,
): Promise<{ ok: true; application: ApplicationDTO } | { ok: false; reason: string }> {
  const parsed = recordEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Invalid event input: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    };
  }
  const event = parsed.data;

  const row = await db.application.findUnique({ where: { id } });
  if (!row) return { ok: false, reason: 'Application not found' };

  // --- Pure note events: appended, no state change --------------------------
  if (event.eventType === 'note') {
    await db.applicationEvent.create({
      data: {
        applicationId: id,
        eventType: 'note',
        evidenceType: event.evidenceType ?? null,
        evidenceUrl: event.evidenceUrl ?? null,
        note: event.note ?? null,
      },
    });
    const application = await getApplication(id);
    if (!application) return { ok: false, reason: 'Application not found' };
    return { ok: true, application };
  }

  if (!KNOWN_STATUS_EVENTS.has(event.eventType)) {
    return {
      ok: false,
      reason: `Unknown event type "${event.eventType}". Use a lifecycle status (${[...KNOWN_STATUS_EVENTS].join(', ')}) or "note".`,
    };
  }

  const target = event.eventType as Parameters<typeof canTransition>[1];
  const evidence: TransitionEvidence = {
    evidenceType: event.evidenceType,
    evidenceUrl: event.evidenceUrl,
    note: event.note,
    amountPaid: event.amountPaid,
    hasDraft: Boolean(row.draft && row.draft.trim() !== ''),
  };

  const guard = canTransition(row.status as Parameters<typeof canTransition>[0], target, evidence);
  if (!guard.ok) {
    return { ok: false, reason: guard.reason ?? 'Transition not allowed' };
  }

  const fields = applyTransitionFields(target, evidence, {
    paidCurrency: event.paidCurrency,
    channel: event.channel,
  });

  await db.application.update({
    where: { id },
    data: { status: target, ...fields },
  });
  await db.applicationEvent.create({
    data: {
      applicationId: id,
      eventType: event.eventType,
      evidenceType: event.evidenceType ?? null,
      evidenceUrl: event.evidenceUrl ?? null,
      note: event.note ?? null,
    },
  });

  const application = await getApplication(id);
  if (!application) return { ok: false, reason: 'Application not found' };
  return { ok: true, application };
}

/** Mark the tracker reviewed/prepared (requires a stored draft — see canTransition). */
export async function markPrepared(
  id: string,
): Promise<{ ok: true; application: ApplicationDTO } | { ok: false; reason: string }> {
  return recordEvent(id, { eventType: 'prepared' });
}
