/**
 * Hop3 — Stage 1 Earn validation & JSON read-checks — re-expression of the
 * reference `profile-service.ts` / `application-service.ts` zod schemas plus
 * the defensive JSON-column parses of the reference row mappers.
 *
 * Two jobs:
 *  1. Input validation (zod, same bounds and messages as the reference):
 *     earnProfileInputSchema / draftContentSchema / recordEventSchema.
 *  2. Read-side checking of TEXT JSON columns ("zod-checked on read"):
 *     every JSON column is parsed with safeParse and degrades to undefined /
 *     empty on failure — corrupt payloads stay missing, never fabricated.
 *
 * Pure module — no DB, no fetch. Node runtime.
 */

import { z } from "zod";
import type {
  ApplicationSpec,
  CompensationSpec,
  EligibilitySpec,
  PayoutSpec,
  RequirementsSpec,
  TimeSpec,
} from "@zcode/shared";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Parse a JSON TEXT column; null/blank/unparsable degrade to undefined. */
function parseJsonColumn(value: string | null | undefined): unknown {
  if (value == null || value.trim() === "") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function safeParseColumn<T>(schema: z.ZodType<T>, value: string | null | undefined): T | undefined {
  const parsed = schema.safeParse(parseJsonColumn(value));
  return parsed.success ? parsed.data : undefined;
}

// ---------------------------------------------------------------------------
// Spec read-schemas (opportunities JSON columns)
// ---------------------------------------------------------------------------

const eligibilitySpecSchema = z.object({
  mode: z.enum(["whitelist", "blacklist", "open", "unknown"]),
  countries: z.array(z.string()).optional(),
  excludedCountries: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  qualifications: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const requirementsSpecSchema = z.object({
  skills: z.array(z.string()).optional(),
  experience: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  schedule: z.string().optional(),
  languages: z.array(z.string()).optional(),
});

const compensationSpecSchema = z.object({
  currency: z.string().optional(),
  grossMin: z.number().optional(),
  grossMax: z.number().optional(),
  payUnit: z.enum(["fixed", "hourly", "task", "word", "month", "unknown"]).optional(),
  fixedOrEstimated: z.enum(["fixed", "estimated", "unknown"]),
  conditions: z.string().optional(),
});

const payoutSpecSchema = z.object({
  methodKnown: z.boolean(),
  methods: z.array(z.string()).optional(),
  threshold: z
    .object({ amount: z.number(), currency: z.string() })
    .optional(),
  fees: z.string().optional(),
  cadence: z.string().optional(),
  evidenceUrl: z.string().optional(),
  countryNotes: z.string().optional(),
});

const applicationSpecSchema = z.object({
  steps: z.array(z.string()).optional(),
  closingDate: z.string().optional(),
  qualificationTest: z.boolean().optional(),
  applicationCost: z
    .object({
      amount: z.number().optional(),
      currency: z.string().optional(),
      note: z.string().optional(),
    })
    .optional(),
  connects: z.number().optional(),
  requiredData: z.array(z.string()).optional(),
});

const timeSpecSchema = z.object({
  hoursMin: z.number().optional(),
  hoursMax: z.number().optional(),
  deadline: z.string().optional(),
  duration: z.string().optional(),
  shifts: z.string().optional(),
  timezone: z.string().optional(),
});

const stringArraySchema = z.array(z.string());

export function parseEligibilitySpec(value: string | null | undefined): EligibilitySpec | undefined {
  return safeParseColumn(eligibilitySpecSchema, value);
}

export function parseRequirementsSpec(value: string | null | undefined): RequirementsSpec | undefined {
  return safeParseColumn(requirementsSpecSchema, value);
}

export function parseCompensationSpec(value: string | null | undefined): CompensationSpec | undefined {
  return safeParseColumn(compensationSpecSchema, value);
}

export function parsePayoutSpec(value: string | null | undefined): PayoutSpec | undefined {
  return safeParseColumn(payoutSpecSchema, value);
}

export function parseApplicationSpec(value: string | null | undefined): ApplicationSpec | undefined {
  return safeParseColumn(applicationSpecSchema, value);
}

export function parseTimeSpec(value: string | null | undefined): TimeSpec | undefined {
  return safeParseColumn(timeSpecSchema, value);
}

export function parseRiskFlags(value: string | null | undefined): string[] | undefined {
  return safeParseColumn(stringArraySchema, value);
}

/** Raw payload column: any JSON value survives; unparsable stays undefined. */
export function parseRawPayload(value: string | null | undefined): unknown {
  return parseJsonColumn(value);
}

// ---------------------------------------------------------------------------
// Profile JSON column read-schemas (defensive, entry-level — the reference
// mapper drops malformed entries instead of failing the whole column)
// ---------------------------------------------------------------------------

export const profileLanguageSchema = z.object({
  code: z.string(),
  proficiency: z.string(),
  note: z.string().optional(),
});

export const profileSkillSchema = z.object({
  name: z.string(),
  experienceBand: z.string(),
  evidenceNote: z.string().optional(),
});

export const profileQualificationSchema = z.object({
  type: z.string(),
  issuer: z.string().optional(),
  year: z.string().optional(),
  verificationState: z.string(),
});

export const profileEquipmentSchema = z.object({
  kind: z.string(),
  note: z.string().optional(),
});

export const profilePayoutCapabilitySchema = z.object({
  rail: z.string(),
  status: z.enum(["available", "unavailable", "unknown"]),
  note: z.string().optional(),
});

export const profilePreferencesSchema = z.object({
  includedFamilies: z.array(z.string()),
  excludedFamilies: z.array(z.string()),
});

/** Array<T> JSON column read: malformed entries are dropped, never guessed. */
export function parseProfileEntries<T>(
  value: string | null | undefined,
  schema: z.ZodType<T>,
): T[] {
  const parsed = parseJsonColumn(value);
  if (!Array.isArray(parsed)) return [];
  const out: T[] = [];
  for (const entry of parsed) {
    const checked = schema.safeParse(entry);
    if (checked.success) out.push(checked.data);
  }
  return out;
}

export function parseProfilePreferences(value: string | null | undefined): {
  includedFamilies: string[];
  excludedFamilies: string[];
} {
  const parsed = safeParseColumn(profilePreferencesSchema, value);
  return parsed ?? { includedFamilies: [], excludedFamilies: [] };
}

// ---------------------------------------------------------------------------
// Input validation — ported bounds and messages (profile-service.ts)
// ---------------------------------------------------------------------------

const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "countryCode must be a 2-letter ISO 3166-1 alpha-2 code")
  .transform((value) => value.toUpperCase());

const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter ISO 4217 code")
  .transform((value) => value.toUpperCase());

const languageSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[A-Za-z][A-Za-z-]*$/, "language code must be 2-8 letters (optionally with a region, e.g. en or pt-BR)")
    .transform((value) => value.toLowerCase()),
  proficiency: z.enum([
    "beginner",
    "intermediate",
    "advanced",
    "fluent",
    "native",
    "professional",
  ]),
  note: z.string().trim().max(500).optional(),
});

const skillSchema = z.object({
  name: z.string().trim().min(1).max(100),
  experienceBand: z.enum(["beginner", "intermediate", "advanced", "expert"]),
  evidenceNote: z.string().trim().max(500).optional(),
});

const qualificationSchema = z.object({
  type: z.string().trim().min(1).max(100),
  issuer: z.string().trim().max(100).optional(),
  year: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "year must be a 4-digit string")
    .optional(),
  verificationState: z.enum(["unverified", "user-attested", "verified"]),
});

const equipmentSchema = z.object({
  kind: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional(),
});

const payoutCapabilitySchema = z.object({
  rail: z.string().trim().min(1).max(50),
  status: z.enum(["available", "unavailable", "unknown"]),
  note: z.string().trim().max(500).optional(),
});

const slugSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .refine((value) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(value), {
    message: "family slugs must be short lowercase slugs (letters, digits, hyphens)",
  });

const preferencesSchema = z.object({
  includedFamilies: z.array(slugSchema).max(50),
  excludedFamilies: z.array(slugSchema).max(50),
});

const optionalShortText = (max: number) => z.string().trim().min(1).max(max).optional();

/** Full-replace profile upsert input (reference profileInputSchema, verbatim bounds). */
export const earnProfileInputSchema = z.object({
  displayName: optionalShortText(100),
  regionNote: optionalShortText(200),
  countryCode: countryCodeSchema.optional(),
  workMode: z.enum(["remote", "local", "hybrid", "any"]).default("any"),
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
  incomeGoalCurrency: currencySchema.default("USD"),
});

export type EarnProfileInputParsed = z.infer<typeof earnProfileInputSchema>;

/** One-line zod issue report (reference formatZodError). */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ")
    .slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Input validation — ported from application-service.ts
// ---------------------------------------------------------------------------

export const draftContentSchema = z.object({
  checklist: z.array(z.string().trim().min(1).max(300)).max(30),
  messageDraft: z.string().trim().min(1).max(8000),
  notice: z.string().trim().min(1).max(1000),
});

export type DraftContentParsed = z.infer<typeof draftContentSchema>;

export const recordEventSchema = z.object({
  eventType: z.string().trim().min(1).max(64),
  evidenceType: z.enum(["user-reported", "provider-confirmed", "payment-confirmed"]).optional(),
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

export type RecordEventParsed = z.infer<typeof recordEventSchema>;

export { isRecord, asTrimmedString };
