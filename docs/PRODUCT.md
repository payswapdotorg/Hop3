# Product definition

**Status:** Accepted product direction  
**Last reviewed:** 2026-11-12

## 1. Mission

Hop3 turns the open web and connected services into an actionable map of legitimate earning opportunities and work demand.

For an individual, Hop3 should make it much less likely that a suitable paid opportunity is missed simply because the person did not know the programme, employer, platform or search term existed. It should find small, occasional, remote, local and recurring opportunities, help the person understand the requirements, and support the application and completion journey.

For a person or business buying work, Hop3 should translate intent into a clear brief and help discover appropriate workers or teams, with an evidence-based view of quality, cost, capacity and delivery risk wherever the source platform permits that assistance.

Longer term, Hop3 can connect independent workers, teams, businesses, specialist agents, equipment and other capabilities into multi-hop work routes. This network is not required for Stage 1.

## 2. Primary MVP outcome

**Help an individual discover and pursue their first few legitimate extra-income opportunities.**

The primary measure is not listings, AI actions, clicks or applications. It is **verified additional net income received by users**, with clear attribution and a distinction between estimated and realized amounts.

The product must still be useful when it finds no currently eligible opportunities: explain which sources were checked, when they were checked, what prevented a match, and what the user can improve or try next. It must never invent a listing to satisfy a target count.

## 3. Personas

### 3.1 Earner (primary in Stage 1)

A person who wants supplemental income and may have limited time, capital, formal credentials or access to conventional gig platforms. They may be looking for:

- Local shifts: waitress/waiter, event staff, catering, retail, temporary reception or fieldwork.
- Research participation: paid surveys, interviews, focus groups and user studies.
- Review and evaluation programmes: course reviewers, assignment graders, curriculum evaluators and assessment reviewers.
- Language work: translation, proofreading, transcription, interpretation and voice recording.
- AI/data work: data annotation, response evaluation, search evaluation, model evaluation and data collection.
- Testing: websites, mobile apps, usability and product testing.
- Local commerce tasks: mystery shopping, price checks, store audits, photography and business verification.
- Professional and creative work: writing, design, editing, development, consulting and other freelance projects.

These are opportunity families, not claims that every category is available in every country.

### 3.2 Gig poster / buyer

A person or organisation with a task, project or business need. They need help describing the work, identifying must-have requirements, finding individuals or teams, comparing feasible options and controlling quality, price, deadline and delivery risk.

### 3.3 Worker team / coordinator (later)

A capable worker who can win or accept a project, then coordinate other workers for permitted work packages. The contract and platform rules must allow delegation; the client and each worker must agree to the arrangement.

### 3.4 Opportunity source / programme operator (later)

A platform, employer, research organisation, university, NGO, training provider or business publishing opportunities or requesting work.

## 4. Product modes

### Earn

- Build a private profile from a conversation or structured editor.
- State target income, availability, preferred work, skills, languages, qualifications, location and remote/in-person preference.
- Discover opportunities from permitted sources.
- Check eligibility, application steps, deadlines, costs, payout methods and evidence quality.
- Estimate net economics and effective hourly return where inputs are sufficiently known.
- Prepare an application or proposal and let the user review it.
- Track application, qualification, assignment, approval and payment states.
- Learn from actual outcomes to improve future discovery.

### Hire

- Describe the desired result in natural language.
- Turn it into deliverables, acceptance criteria, budget, deadline, required skills, language, location and dependencies.
- Find individuals and teams through connected, permitted sources.
- Present source-native results and explain comparison limits.
- Compare quality-price trade-offs only where the source terms permit independent ranking.
- Coordinate a delivery plan after the buyer and workers approve it.

Hire is a product direction, not a Stage 1 delivery commitment beyond connector semantics and architecture compatibility.

### Coordinate (later)

- Decompose an assignment into typed packages and acceptance criteria.
- Match packages to worker capabilities.
- Validate dependencies, capacity, deadlines, total cost and quality controls.
- Obtain explicit agreement from the original buyer and every subcontractor.
- Track handoffs and acceptance evidence.
- Never obscure who is doing the work or imply a platform permits subcontracting when it does not.

## 5. Principles

1. **Discover beyond marketplaces.** A reviewer programme, a paid interview panel or a one-day event shift is as meaningful as a freelance listing.
2. **Eligibility before excitement.** Country, age, language, credentials, availability, equipment and payout requirements are first-class fields.
3. **Net value over headline rate.** Show relevant fees, Connects, application costs, travel, unpaid qualification time, payout thresholds and effective hourly return.
4. **Evidence over AI confidence.** Keep the source URL, observation time, exact evidence and uncertainty attached to every claim.
5. **User controls consequential actions.** The user approves account connections, applications, proposals, messages, contracts, hiring and financial actions.
6. **Policy-aware by construction.** Platform-specific restrictions must be encoded in connector capabilities and runtime policy; no connector is allowed to silently bypass its source's rules.
7. **Small useful steps.** Help a user get their first legitimate payment before building a complex marketplace.
8. **No guaranteed income.** Outcomes depend on demand, selection, user effort, geography, platform policies and payment approval.
9. **Private by default.** Worker profiles and outcome histories are user-owned; sharing requires explicit consent.
10. **Preserve ZCode.** Opportunity workflows are additive; users retain the general-purpose harness and all existing controls.

## 6. MVP profile

The initial worker profile may contain:

- Country and broad working location; exact location only when needed for a local task and explicitly provided.
- Languages and proficiency.
- Skills, experience, education, certificates and work samples.
- Work preferences and excluded categories.
- Weekly availability, time zone and deadlines.
- Remote, local or hybrid preference; travel radius if applicable.
- Equipment/access the user says they have.
- Income target and preferred currency.
- Risk tolerance and willingness to complete unpaid qualification steps.
- Payout rails the user can actually receive, with compatibility status and evidence.

Do not infer sensitive attributes, identity or legal work eligibility. Do not collect bank/mobile-money account numbers in Stage 1. Payout compatibility is a provider/country capability check, not a request for payout credentials.

## 7. Trust and safety rules

- Detect suspicious upfront fees, deposits, account rental, money-transfer requests, fake cheque/payment schemes, unrealistic guaranteed income and requests to lie or misrepresent skills.
- Explain when an opportunity is unpaid, speculative, invite-only, limited by region or requires a qualification test.
- Never fabricate reviews, credentials, references, work samples, survey answers or application claims.
- A referral or listing is not proof that the employer is legitimate.
- A submitted application is not acceptance; completed work is not approval; approval is not payment.
- Keep a report/flag mechanism and preserve the evidence used to classify a suspected scam.
- Do not recommend work that violates law, platform terms or the original contract.

## 8. Success measures

### Primary

- Verified additional net income received by active earners.
- Percentage of active earners who receive at least one verified payment.
- Median time from onboarding to first verified paid assignment.
- User-reported usefulness and trust, measured after actual outcomes.

### Discovery quality

- Eligible opportunities per active user.
- Eligible-to-applied, applied-to-accepted and accepted-to-paid conversion.
- Duplicate rate and stale-listing rate.
- False-positive eligibility rate.
- Share of cards with complete source, date, country, payout and cost evidence.

### Efficiency and safety

- Discovery cost per verified eligible opportunity.
- User time required per successful application/assignment.
- Scam reports, unsafe recommendations and policy violations.
- Number of unauthorized or accidental write actions: target zero.

### Buyer-side (later)

- Brief-to-qualified-shortlist time.
- Delivery acceptance rate.
- Total cost for the required quality and deadline.
- Rework, dispute and late-delivery rates.

Do not optimize solely for gross listings or application volume.
