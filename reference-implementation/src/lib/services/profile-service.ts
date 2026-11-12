/**
 * Hop3 — Stage 1 worker profile persistence (Worker B).
 *
 * DOMAIN-MODEL.md section 1.1: a user-owned, private profile describing what
 * opportunities may fit the user. Stage 1 stores exactly one row with the
 * fixed id 'primary'. JSON columns are Strings on SQLite, so every read is
 * parsed defensively (null/corrupt values degrade to empty structures, never
 * to fabricated claims) and every write is validated with zod first.
 *
 * Node runtime only (route handlers). No 'use client'.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import type { ProfileDTO } from '@/lib/contracts';
import type { WorkerProfile } from '@prisma/client';

/** Fixed single-row id (Stage 1 has one local user). */
export const PROFILE_ID = 'primary';

// ---------------------------------------------------------------------------
// Defensive JSON helpers (SQLite stores structured payloads as Strings)
// ---------------------------------------------------------------------------

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (value == null || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | undefined {
  if (value == null || value.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

// ---------------------------------------------------------------------------
// Row -> DTO mapping (defensive: malformed entries are dropped, never guessed)
// ---------------------------------------------------------------------------

function mapProfileRow(row: WorkerProfile): ProfileDTO {
  const languages = parseJsonArray(row.languagesJson)
    .filter(isRecord)
    .map((item) => ({
      code: asTrimmedString(item.code) ?? '',
      proficiency: asTrimmedString(item.proficiency) ?? '',
      note: asTrimmedString(item.note),
    }))
    .filter((item) => item.code !== '');

  const skills = parseJsonArray(row.skillsJson)
    .filter(isRecord)
    .map((item) => ({
      name: asTrimmedString(item.name) ?? '',
      experienceBand: asTrimmedString(item.experienceBand) ?? '',
      evidenceNote: asTrimmedString(item.evidenceNote),
    }))
    .filter((item) => item.name !== '');

  const qualifications = parseJsonArray(row.qualificationsJson)
    .filter(isRecord)
    .map((item) => ({
      type: asTrimmedString(item.type) ?? '',
      issuer: asTrimmedString(item.issuer),
      year: asTrimmedString(item.year),
      // "unverified" is the honest default: nothing has been verified.
      verificationState: asTrimmedString(item.verificationState) ?? 'unverified',
    }))
    .filter((item) => item.type !== '');

  const preferencesRaw = parseJsonObject(row.preferencesJson);
  const toSlugList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  const preferences = {
    includedFamilies: toSlugList(preferencesRaw?.includedFamilies),
    excludedFamilies: toSlugList(preferencesRaw?.excludedFamilies),
  };

  const equipment = parseJsonArray(row.equipmentJson)
    .filter(isRecord)
    .map((item) => ({
      kind: asTrimmedString(item.kind) ?? '',
      note: asTrimmedString(item.note),
    }))
    .filter((item) => item.kind !== '');

  const payoutCapabilities = parseJsonArray(row.payoutCapabilitiesJson)
    .filter(isRecord)
    .map((item) => {
      const status = asTrimmedString(item.status);
      return {
        rail: asTrimmedString(item.rail) ?? '',
        status:
          status === 'available' || status === 'unavailable' || status === 'unknown'
            ? status
            : ('unknown' as const),
        note: asTrimmedString(item.note),
      };
    })
    .filter((item) => item.rail !== '');

  return {
    id: row.id,
    schemaVersion: row.schemaVersion,
    displayName: row.displayName,
    countryCode: row.countryCode,
    regionNote: row.regionNote,
    workMode: row.workMode || 'any',
    languages,
    skills,
    qualifications,
    preferences,
    weeklyHours: row.weeklyHours,
    timezone: row.timezone,
    equipment,
    incomeGoalAmount: row.incomeGoalAmount ?? null,
    incomeGoalCurrency: row.incomeGoalCurrency || 'USD',
    payoutCapabilities,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Input validation (zod v4) — full-replace semantics on upsert
// ---------------------------------------------------------------------------

const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code')
  .transform((value) => value.toUpperCase());

const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO 4217 code')
  .transform((value) => value.toUpperCase());

const languageSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[A-Za-z][A-Za-z-]*$/, 'language code must be 2-8 letters (optionally with a region, e.g. en or pt-BR)')
    .transform((value) => value.toLowerCase()),
  proficiency: z.enum([
    'beginner',
    'intermediate',
    'advanced',
    'fluent',
    'native',
    'professional',
  ]),
  note: z.string().trim().max(500).optional(),
});

const skillSchema = z.object({
  name: z.string().trim().min(1).max(100),
  experienceBand: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  evidenceNote: z.string().trim().max(500).optional(),
});

const qualificationSchema = z.object({
  type: z.string().trim().min(1).max(100),
  issuer: z.string().trim().max(100).optional(),
  year: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'year must be a 4-digit string')
    .optional(),
  verificationState: z.enum(['unverified', 'user-attested', 'verified']),
});

const equipmentSchema = z.object({
  kind: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional(),
});

const payoutCapabilitySchema = z.object({
  rail: z.string().trim().min(1).max(50),
  status: z.enum(['available', 'unavailable', 'unknown']),
  note: z.string().trim().max(500).optional(),
});

const slugSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .refine((value) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(value), {
    message: 'family slugs must be short lowercase slugs (letters, digits, hyphens)',
  });

const preferencesSchema = z.object({
  includedFamilies: z.array(slugSchema).max(50),
  excludedFamilies: z.array(slugSchema).max(50),
});

const optionalShortText = (max: number) => z.string().trim().min(1).max(max).optional();

const profileInputSchema = z.object({
  displayName: optionalShortText(100),
  regionNote: optionalShortText(200),
  countryCode: countryCodeSchema.optional(),
  workMode: z.enum(['remote', 'local', 'hybrid', 'any']).default('any'),
  languages: z.array(languageSchema).max(50).nullish().transform((v) => v ?? []),
  skills: z.array(skillSchema).max(200).nullish().transform((v) => v ?? []),
  qualifications: z.array(qualificationSchema).max(100).nullish().transform((v) => v ?? []),
  equipment: z.array(equipmentSchema).max(100).nullish().transform((v) => v ?? []),
  payoutCapabilities: z.array(payoutCapabilitySchema).max(50).nullish().transform((v) => v ?? []),
  preferences: preferencesSchema
    .nullish()
    .transform((v) => v ?? { includedFamilies: [], excludedFamilies: [] }),
  weeklyHours: z.number().int().min(0).max(80).default(0),
  timezone: optionalShortText(64),
  incomeGoalAmount: z.number().min(0).nullish().transform((v) => v ?? null),
  incomeGoalCurrency: currencySchema.default('USD'),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ')
    .slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Public service API
// ---------------------------------------------------------------------------

/**
 * Read the single worker profile (fixed id 'primary').
 * Returns null when no profile exists yet — never a fabricated default.
 */
export async function getProfile(): Promise<ProfileDTO | null> {
  const row = await db.workerProfile.findUnique({ where: { id: PROFILE_ID } });
  return row ? mapProfileRow(row) : null;
}

/**
 * Validate and upsert the single worker profile (full-replace semantics: the
 * validated input becomes the whole profile; consent settings, which are not
 * part of ProfileDTO, are never touched by this function).
 *
 * Throws Error with a human-readable validation message on invalid input —
 * routes map that to HTTP 400.
 */
export async function upsertProfile(input: unknown): Promise<ProfileDTO> {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid worker profile: ${formatZodError(parsed.error)}`);
  }
  const profile = parsed.data;

  const data = {
    schemaVersion: 1,
    displayName: profile.displayName ?? null,
    countryCode: profile.countryCode ?? null,
    regionNote: profile.regionNote ?? null,
    workMode: profile.workMode,
    languagesJson: JSON.stringify(profile.languages),
    skillsJson: JSON.stringify(profile.skills),
    qualificationsJson: JSON.stringify(profile.qualifications),
    preferencesJson: JSON.stringify(profile.preferences),
    weeklyHours: profile.weeklyHours,
    timezone: profile.timezone ?? null,
    equipmentJson: JSON.stringify(profile.equipment),
    incomeGoalAmount: profile.incomeGoalAmount ?? null,
    incomeGoalCurrency: profile.incomeGoalCurrency,
    payoutCapabilitiesJson: JSON.stringify(profile.payoutCapabilities),
  };

  const row = await db.workerProfile.upsert({
    where: { id: PROFILE_ID },
    create: { id: PROFILE_ID, ...data },
    update: data,
  });

  return mapProfileRow(row);
}
