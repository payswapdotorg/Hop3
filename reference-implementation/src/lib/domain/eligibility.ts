/**
 * Hop3 — Stage 1 eligibility assessment (Worker B).
 *
 * Implements DOMAIN-MODEL.md section 1.4 against the frozen contracts in
 * src/lib/contracts.ts. Non-negotiable rules encoded here:
 *  - "Unknown" is never treated as "eligible" (HOP3_RULES section 6).
 *  - Missing values stay missing; reasons cite what the listing actually
 *    discloses, never model guesses.
 *  - Skills gaps are "needs_user_input", never "ineligible" (the user may
 *    hold a skill their profile does not list yet).
 *  - Payout compatibility is unknown unless the listing itself carries
 *    country-specific proof; a method list alone proves nothing.
 *
 * Node runtime only (route handlers). No 'use client'.
 */

import {
  PAYOUT_UNKNOWN_DISCLAIMER,
  type DimensionResult,
  type EligibilityAssessment,
  type EligibilitySpec,
  type EligibilityValue,
  type ProfileDTO,
  type PayoutSpec,
  type RequirementsSpec,
  type SourceKey,
} from '@/lib/contracts';

/** Listing facts required to assess eligibility (frozen contract shape). */
export interface OpportunityFacts {
  sourceKey: SourceKey;
  platform: string;
  eligibility?: EligibilitySpec;
  requirements?: RequirementsSpec;
  payout?: PayoutSpec;
}

/** Token match: does a free-text/url string mention an ISO code as a whole token? */
function mentionsCode(text: string, code: string): boolean {
  if (!text || !code) return false;
  const tokens = text.toUpperCase().split(/[^A-Z0-9]+/);
  return tokens.includes(code.toUpperCase());
}

/** Conservative negation markers inside a single sentence/segment. */
const NEGATION_PATTERN =
  /\b(not available|unavailable|not supported|not offered|excluded|excluding|does not support|not eligible|not accepted)\b/i;

/** Lowercase + collapse internal whitespace for human-readable comparisons. */
function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Normalize a skill name for exact (never fuzzy) matching. */
function normalizeSkillName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function joinList(values: string[]): string {
  return values.join(', ');
}

// ---------------------------------------------------------------------------
// Country dimension
// ---------------------------------------------------------------------------

function assessCountry(
  profile: ProfileDTO | null,
  eligibility: EligibilitySpec | undefined,
): DimensionResult {
  // No profile at all: the user must create one before anything user-dependent
  // can be assessed. (Exact wording mandated by the Stage 1 contract.)
  if (!profile) {
    return {
      value: 'needs_user_input',
      reason: 'Create your worker profile first',
      sourceBacked: false,
    };
  }

  const userCountry = profile.countryCode?.trim().toUpperCase() ?? null;

  // A profile without a country cannot be matched against any country list.
  if (!userCountry) {
    return {
      value: 'needs_user_input',
      reason: 'Your country is not set in your profile, so the listing country availability cannot be checked',
      sourceBacked: false,
    };
  }

  if (!eligibility || eligibility.mode === 'unknown') {
    return {
      value: 'unknown',
      reason: 'Listing does not disclose country availability',
      sourceBacked: false,
    };
  }

  if (eligibility.mode === 'whitelist') {
    const countries = (eligibility.countries ?? []).filter((c) => typeof c === 'string' && c.trim() !== '');
    // A whitelist without a country list discloses nothing usable; marking the
    // user ineligible off an empty list would fabricate a restriction.
    if (countries.length === 0) {
      return {
        value: 'unknown',
        reason: 'Listing does not disclose its country list',
        sourceBacked: false,
      };
    }
    const normalized = countries.map((c) => c.trim().toUpperCase());
    const included = normalized.includes(userCountry);
    return {
      value: included ? 'eligible' : 'ineligible',
      reason: included
        ? `Listing is available in: ${joinList(normalized)} — your country (${userCountry}) is included`
        : `Listing is only available in: ${joinList(normalized)} — your country (${userCountry}) is not included`,
      sourceBacked: true,
    };
  }

  if (eligibility.mode === 'blacklist') {
    const excluded = (eligibility.excludedCountries ?? [])
      .filter((c) => typeof c === 'string' && c.trim() !== '')
      .map((c) => c.trim().toUpperCase());
    const isExcluded = excluded.includes(userCountry);
    return {
      value: isExcluded ? 'ineligible' : 'eligible',
      reason: isExcluded
        ? `Listing excludes: ${joinList(excluded)} — your country (${userCountry}) is excluded`
        : excluded.length > 0
          ? `Listing excludes: ${joinList(excluded)}; your country (${userCountry}) is not excluded`
          : `Listing states no excluded countries; your country (${userCountry}) is not excluded`,
      sourceBacked: true,
    };
  }

  // mode === 'open'
  return {
    value: 'eligible',
    reason: 'Listing states no country restriction',
    sourceBacked: true,
  };
}

// ---------------------------------------------------------------------------
// Language dimension
// ---------------------------------------------------------------------------

function collectListingLanguages(
  eligibility: EligibilitySpec | undefined,
  requirements: RequirementsSpec | undefined,
): string[] {
  const codes = new Set<string>();
  for (const raw of [...(eligibility?.languages ?? []), ...(requirements?.languages ?? [])]) {
    if (typeof raw !== 'string') continue;
    const code = raw.trim();
    if (code) codes.add(code);
  }
  return [...codes];
}

function assessLanguage(
  profile: ProfileDTO | null,
  eligibility: EligibilitySpec | undefined,
  requirements: RequirementsSpec | undefined,
): DimensionResult {
  if (!profile) {
    return {
      value: 'needs_user_input',
      reason: 'Create your worker profile first',
      sourceBacked: false,
    };
  }

  const listingLanguages = collectListingLanguages(eligibility, requirements);
  if (listingLanguages.length === 0) {
    return {
      value: 'unknown',
      reason: 'Listing does not disclose language requirements',
      sourceBacked: false,
    };
  }

  const profileLanguages = (profile.languages ?? [])
    .map((l) => (typeof l?.code === 'string' ? l.code.trim().toLowerCase() : ''))
    .filter((code) => code !== '');

  const missing = listingLanguages.filter(
    (code) => !profileLanguages.includes(code.trim().toLowerCase()),
  );

  if (missing.length === 0) {
    return {
      value: 'eligible',
      reason: `Listing lists languages: ${joinList(listingLanguages)}; your profile covers all of them`,
      sourceBacked: true,
    };
  }

  return {
    value: 'needs_user_input',
    reason:
      profileLanguages.length === 0
        ? `Listing lists languages: ${joinList(listingLanguages)}; your profile lists none yet`
        : `Listing lists languages: ${joinList(listingLanguages)}; your profile does not yet list: ${joinList(missing)}`,
    sourceBacked: true,
  };
}

// ---------------------------------------------------------------------------
// Skills dimension
// ---------------------------------------------------------------------------

function assessSkills(
  profile: ProfileDTO | null,
  requirements: RequirementsSpec | undefined,
): DimensionResult {
  if (!profile) {
    return {
      value: 'needs_user_input',
      reason: 'Create your worker profile first',
      sourceBacked: false,
    };
  }

  const listingSkills = (requirements?.skills ?? []).filter(
    (s) => typeof s === 'string' && s.trim() !== '',
  );

  // Never guess skill requirements the listing does not state.
  if (listingSkills.length === 0) {
    return {
      value: 'unknown',
      reason: 'Listing does not specify required skills',
      sourceBacked: false,
    };
  }

  const profileSkills = new Set(
    (profile.skills ?? [])
      .map((s) => (typeof s?.name === 'string' ? normalizeSkillName(s.name) : ''))
      .filter((name) => name !== ''),
  );

  const missing = listingSkills.filter((skill) => !profileSkills.has(normalizeSkillName(skill)));

  if (missing.length === 0) {
    return {
      value: 'eligible',
      reason: `Listing specifies skills: ${joinList(listingSkills)}; all are in your profile`,
      sourceBacked: true,
    };
  }

  // A skill gap is missing user input, never ineligibility.
  return {
    value: 'needs_user_input',
    reason: `Listing specifies skills: ${joinList(listingSkills)}; your profile does not yet list: ${joinList(missing)}`,
    sourceBacked: true,
  };
}

// ---------------------------------------------------------------------------
// Payout dimension
// ---------------------------------------------------------------------------

/**
 * Payout compatibility stays unknown unless the listing itself carries
 * country-specific proof. Per CONNECTORS.md / HOP3_RULES section 6: a global
 * payment-method list (methodKnown) is not proof of availability in any
 * specific country.
 *
 * Accepted proof forms (deliberately narrow):
 *  - payout.countryNotes contains a segment mentioning the user's ISO country
 *    code: a negation phrase in that segment marks the country unsupported
 *    (ineligible), otherwise the note is treated as covering the country.
 *  - payout.evidenceUrl itself mentions the user's country code (for example a
 *    country-specific help path). The reason still asks the user to open it.
 */
function assessPayout(countryCode: string | null, payout: PayoutSpec | undefined): DimensionResult {
  const userCountry = countryCode?.trim().toUpperCase() ?? null;

  if (!userCountry) {
    return {
      value: 'unknown',
      reason: `Your country is not set in your profile, so payout availability cannot be checked. ${PAYOUT_UNKNOWN_DISCLAIMER}`,
      sourceBacked: false,
    };
  }

  if (payout?.countryNotes) {
    const segments = payout.countryNotes
      .split(/[.;\n\r]+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    const covering = segments.filter((segment) => mentionsCode(segment, userCountry));
    if (covering.length > 0) {
      const negated = covering.some((segment) => NEGATION_PATTERN.test(segment));
      if (negated) {
        return {
          value: 'ineligible',
          reason: `Listing payout notes indicate your country (${userCountry}) is not supported: "${covering[0]}"`,
          sourceBacked: true,
        };
      }
      return {
        value: 'eligible',
        reason: `Listing payout notes cover your country (${userCountry}): "${covering[0]}"`,
        sourceBacked: true,
      };
    }
  }

  if (payout?.evidenceUrl && mentionsCode(payout.evidenceUrl, userCountry)) {
    return {
      value: 'eligible',
      reason: `Listing links payout evidence that appears specific to your country (${userCountry}): ${payout.evidenceUrl} — open it to confirm availability`,
      sourceBacked: true,
    };
  }

  // methodKnown alone (a global method list) is still unknown.
  return {
    value: 'unknown',
    reason: payout?.methodKnown
      ? `The listing names payout methods but does not prove availability for ${userCountry}. ${PAYOUT_UNKNOWN_DISCLAIMER}`
      : PAYOUT_UNKNOWN_DISCLAIMER,
    sourceBacked: false,
  };
}

// ---------------------------------------------------------------------------
// Overall assessment
// ---------------------------------------------------------------------------

/** Severity: ineligible > needs_user_input > unknown > eligible. */
function worstValue(values: EligibilityValue[]): EligibilityValue {
  if (values.includes('ineligible')) return 'ineligible';
  if (values.includes('needs_user_input')) return 'needs_user_input';
  if (values.includes('unknown')) return 'unknown';
  return 'eligible';
}

/**
 * Evaluate eligibility for a user/opportunity pair (DOMAIN-MODEL 1.4).
 *
 * All reasons are deterministic and cite only what the listing discloses.
 * `modelAssisted` is always false: this is rule-based evaluation, and the
 * assessment is recomputed live on every request (never cached).
 */
export function evaluateEligibility(
  profile: ProfileDTO | null,
  opp: OpportunityFacts,
): EligibilityAssessment {
  const country = assessCountry(profile, opp.eligibility);
  const language = assessLanguage(profile, opp.eligibility, opp.requirements);
  const skills = assessSkills(profile, opp.requirements);
  // Payout is assessed from listing facts regardless of whether a profile
  // exists (a missing profile simply means no country to check against).
  const payout = assessPayout(profile?.countryCode ?? null, opp.payout);

  const dimensions: Array<{ label: string; result: DimensionResult }> = [
    { label: 'Country', result: country },
    { label: 'Language', result: language },
    { label: 'Skills', result: skills },
    { label: 'Payout', result: payout },
  ];

  const blockingReasons: string[] = [];
  const unknowns: string[] = [];
  const nextSteps: string[] = [];

  for (const { label, result } of dimensions) {
    if (result.value === 'ineligible') {
      blockingReasons.push(`${label}: ${result.reason}`);
    }
    if (result.value === 'unknown') {
      unknowns.push(`${label}: ${result.reason}`);
    }
  }

  // Concrete, user-actionable next steps — deduplicated, in a stable order.
  if (!profile) {
    nextSteps.push('Create your worker profile in the Profile tab');
  }
  if (profile && !profile.countryCode && country.value === 'needs_user_input') {
    nextSteps.push('Set your country in the Profile tab');
  }
  if (language.value === 'needs_user_input' && profile) {
    const listingLanguages = collectListingLanguages(opp.eligibility, opp.requirements);
    if (listingLanguages.length > 0) {
      nextSteps.push(
        `Add languages you speak (${joinList(listingLanguages)}) to your profile, or confirm the ones you already cover`,
      );
    }
  }
  if (skills.value === 'needs_user_input' && profile) {
    const listingSkills = (opp.requirements?.skills ?? []).filter(
      (s) => typeof s === 'string' && s.trim() !== '',
    );
    if (listingSkills.length > 0) {
      nextSteps.push(
        `Add skills (${joinList(listingSkills)}) to your profile, or confirm you already have them`,
      );
    }
  }
  if (payout.value === 'unknown' && profile?.countryCode) {
    if (opp.payout?.evidenceUrl) {
      nextSteps.push(`Verify payout availability for your country at ${opp.payout.evidenceUrl}`);
    } else {
      nextSteps.push(
        `Verify payout availability for your country (${profile.countryCode}) on the provider's official payout help pages`,
      );
    }
  }

  const overall = worstValue(dimensions.map((d) => d.result.value));

  return {
    overall,
    country,
    language,
    skills,
    payout,
    blockingReasons,
    unknowns,
    nextSteps: [...new Set(nextSteps)],
    assessedAt: new Date().toISOString(),
    modelAssisted: false,
  };
}

export { normalizeToken };
