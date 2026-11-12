# Opportunity domain contract

**Status:** Accepted conceptual contract; Stage 1 must implement the minimum viable subset and version it in code.  
**Last reviewed:** 2026-11-12

## 1. Core entities

### 1.1 WorkerCapabilityProfile

A user-owned private profile that describes what opportunities may fit the user.

Minimum fields:
- profileId, ownerUserId, schemaVersion, updatedAt.
- countryCode and optional broad region/city.
- languages[]: language, proficiency and evidence/source when supplied.
- skills[]: normalized skill, experience band and user-provided evidence.
- qualifications[]: type, issuer, dates and verification state.
- workPreferences: remote/local/hybrid, opportunity families, exclusions.
- availability: time zone, weekly hours and optional time windows.
- assets[]: user-declared equipment/access relevant to work.
- incomeGoal: amount, currency and target period.
- payoutCapabilities[]: provider/rail/country support status, never account credentials.
- Consent settings describing which profile fields may be shared with each source.

Do not infer age, ethnicity, religion, health, political views, sexuality, identity documents or other sensitive attributes. Ask only for information required by a specific opportunity or provider.

### 1.2 Opportunity

A normalized pointer to a work or programme opportunity. The original provider remains authoritative.

Required fields:
- opportunityId, schemaVersion, sourceId, sourceRecordId.
- title, summary, opportunityType, workMode.
- sourceUrl, sourceObservedAt, firstSeenAt, lastSeenAt.
- sourceStatus and Hop3 lifecycle status.
- descriptionEvidence[] identifying which source fields support material claims.

Optional but structured:
- employerOrPoster and verification status.
- countryEligibility[], regions, languages, qualification requirements and exclusions.
- skills[], experience, equipment and other requirements.
- compensation: amount/range, currency, pay unit, conditions and whether fixed/estimated/unknown.
- time: estimated/required hours, schedule, shifts, deadline, duration and time zone.
- application: steps, closing date, qualification test, application cost, Connects/credits, required data and user-confirmation boundary.
- payout: methods, supported countries, minimum threshold, cadence, fees and evidence.
- riskFlags[], trustAssessment, freshnessPolicy.
- deduplicationKeys[] and source-native links.

Missing values stay missing or unknown; do not fill them with model guesses.

### 1.3 SourceEvidence

Every material assertion links to evidence.

Fields:
- evidenceId, sourceId, sourceRecordId, fieldPath.
- claim, evidenceType (source field, official help, user-provided, observed page, provider response).
- url, observedAt, contentHash or stable source revision where available.
- quoteOrExcerpt only where legally permissible and necessary.
- confidence, verificationState, reviewAfter.

A generated summary is not primary evidence. Keep source text and model interpretation distinguishable.

### 1.4 EligibilityAssessment

For each user/opportunity pair:
- assessmentId, opportunityId, profileId, assessedAt.
- overall: eligible, ineligible, unknown, or needs_user_input.
- Per-requirement outcomes with evidence and reason.
- Country, language, qualification, schedule, experience and payout results.
- blockingReasons[], unknowns[], nextSteps[].
- modelAssisted and reviewer/verification metadata.

Unknown is not equivalent to eligible. If the source does not reveal a country's availability or a payout rail, label it unknown and ask/verify before recommending application.

### 1.5 EconomicsEstimate

Never collapse gross and net amounts.

Fields:
- currency, grossAmountMin, grossAmountMax, payUnit.
- platformFees, applicationCosts, connectsOrCredits, travelAndMaterials, paymentFees.
- estimatedHours, unpaidQualificationHours, coordinationHours.
- estimatedNetMin, estimatedNetMax, effectiveHourlyMin, effectiveHourlyMax.
- assumptions[], unknownCostItems[], confidence, calculatedAt.

Tax is jurisdiction-specific and is not calculated as fact in Stage 1. If taxes are omitted, disclose that. Do not compare currencies without a dated FX rate and source.

### 1.6 Application / Assignment / Outcome

Track the user's workflow separately from provider truth.

- Saved: user has saved an opportunity.
- ApplicationPrepared: draft exists locally; nothing has been sent.
- Applied: evidence of successful submission exists.
- QualificationPending: provider requires a test, review or screening.
- Accepted: provider/employer evidence confirms selection.
- InProgress: assignment has started.
- Submitted: work was submitted.
- Approved: provider/poster evidence confirms approval.
- PaymentPending: approved compensation is awaiting payout.
- Paid: evidence confirms funds were received.
- Rejected, Withdrawn, Expired, Blocked: terminal/paused outcomes with reason and evidence.

A single status must not obscure separate application, assignment and payment states when a provider flow requires them. Preserve provider status and Hop3 interpretation independently.

## 2. Lifecycle

Discovery and evidence lifecycle:

observed → normalized → deduplicated → verified/unknown → assessed → presented → stale/expired

User work lifecycle:

saved → draft prepared → applied → qualification → accepted → in progress → submitted → approved → payment pending → paid

Alternative exits include rejected, withdrawn, expired and blocked. Transitions are event-backed and time-stamped. Do not skip states without evidence.

## 3. Deduplication

- Same provider listing: source ID is the primary key.
- Cross-source duplicate: use conservative normalized employer/title/location/deadline/description fingerprints.
- Preserve each source record and its link even when grouped as one likely opportunity.
- Never merge two postings solely because titles look similar.
- Record duplicateOf or a group relationship, not destructive deletion.
- Reopened or materially changed postings receive a new observation/event and may require re-assessment.

## 4. Freshness and expiry

Each connector declares a permitted refresh interval and TTL. Do not poll faster than provider limits or terms allow. Expired or unverified listings must not appear as current opportunities. A failed source run is not proof that no opportunities exist; report the source as unavailable/incomplete.

## 5. Ranking and ordering

General Hop3 matching may consider:
- explicit user preferences and hard eligibility;
- credible source evidence and freshness;
- net earnings and effective hourly return;
- time, deadline and opportunity duration;
- application effort and qualification cost;
- reliability and safety signals.

However, these calculations are policy-gated per connector. If a platform prohibits an AI agent from independently ranking, scoring or choosing jobs or freelancers, Hop3 must not apply its own scoring to that platform's results. It may provide the provider's native ordering and user-requested filters/sorts where permitted, and explain that the decision remains with the user.

Do not imply that an unverified quality score is an objective probability of success.

## 6. Outcome learning

Learn only from appropriate, user-consented events. Separate:
- clicked / viewed;
- saved;
- application prepared;
- application submitted;
- qualified;
- accepted;
- work completed;
- work approved;
- payment received.

A user-reported result may be recorded as user-reported; a provider confirmation or payment proof has a distinct verification level. Do not infer income from application count or accepted work alone.

## 7. Stage 1 minimum

Stage 1 must implement:
- a versioned worker profile;
- a versioned normalized opportunity record;
- source/run/evidence provenance;
- eligibility including unknown;
- conservative deduplication and freshness;
- economics estimates with assumptions and unknowns;
- saved opportunity and application state;
- a user-visible distinction between estimated, approved and paid amounts.

It does not implement the full graph, team exchange, escrow, payouts, tax advice or autonomous submissions.
