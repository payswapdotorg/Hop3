# Connector register and external-platform policy

**Last verified:** 2026-11-12  
Provider terms, endpoints, rate limits and eligibility can change. Recheck the official source before release and whenever a connector changes.

## 1. Connector contract

Each Hop3 source must be represented by a registry entry with:

| Field | Meaning |
|---|---|
| sourceId, displayName, version | Stable identity and adapter version |
| sourceKind | Gig marketplace, programme board, survey/research panel, local shift, employer, public opportunity source, user link |
| accessMode | Official MCP, official API, permitted feed, user-authorized browser, manual/user-submitted link |
| actorModes | Earner, buyer, operator |
| operations | Separate search, read, draft, submit, message, hire, contract, pay capabilities |
| auth | Anonymous, OAuth, account required, approved callback/client requirements |
| coverage | Countries, regions, languages and currencies verified by evidence |
| payout | Methods, country support, threshold, fees and cadence, each with evidence |
| policy | Terms URL, allowed retention, prohibited operations and platform-specific AI limits |
| rateLimit | Requests per time window, pagination cost, backoff and scheduler ceiling |
| freshness | Maximum cache age and permitted refresh cadence |
| approval | Which operations require explicit user confirmation |
| verifiedAt | Date, tester/environment and operation actually verified |

A source can support buyer-side talent discovery without supporting earner-side job discovery. Do not display capabilities from one side as if they exist on the other.

## 2. Initial source register

### 2.1 Upwork — official MCP

- Official endpoint: https://mcp.upwork.com/mcp
- Official product page: https://www.upwork.com/ai/mcp
- Rate limits: https://support.upwork.com/hc/en-us/articles/56577997707923-Rate-limits-for-Upwork-MCP
- Verification date: 2026-11-12.

Verified facts from Upwork's official MCP page:
- Hosted at mcp.upwork.com; OAuth 2.1 with dynamic client registration.
- Free to connect; normal Upwork fees and freelancer Connects still apply.
- Supports finding jobs and talent, posting jobs, proposals, invitations and contract-related workflows, subject to current tool capabilities.
- Read-only searches may be scheduled, but all connected agents share account rate limits.
- Drafts and binding actions require a human confirmation; financial actions complete on Upwork.
- Custom agents running locally with OAuth-capable MCP clients may connect. Hosted agents/websites need an approved callback URL; custom callback allowlisting is currently unavailable.
- An AI agent must not independently rank, score or select the best jobs for a freelancer or the best freelancers for a client. It may filter, sort and summarize using user-provided criteria as allowed by the current terms. The human makes the decision.

Stage 1 constraints:
- Use official remote MCP only; no browser scraping or unofficial API-key workaround.
- Start with read-only job discovery on the earner side.
- Preserve Upwork's native Best Matches/Most Recent ordering; do not add Hop3 ranking/scoring or a best quality-price score to Upwork result sets.
- Do not submit proposals or messages automatically. Present a draft/review step and use Upwork's required confirmation.
- Respect account-level request limits; batch narrowly, cache within permitted terms, avoid frequent polling and back off on rate-limit errors.
- Confirm the exact OAuth flow in the selected ZCode surface. Desktop/local OAuth is the initial target; do not assume hosted Web callback support.
- Record Connects as a user cost when it applies.

### 2.2 Fiverr — official MCP

- Official endpoint: https://mcp.fiverr.com/mcp
- Official help page: https://help.fiverr.com/hc/en-us/articles/52715474121361-Using-Fiverr-MCP-in-your-AI-agent
- Terms: https://www.fiverr.com/legal-portal/legal-terms/terms-of-service
- Verification date: 2026-11-12.

Verified facts from Fiverr's official MCP help page:
- Fiverr builds and hosts the MCP service.
- Search is free and can work without signing in to Fiverr.
- It can search the marketplace, compare freelancers, read reviews and help scope a buyer's project with Mira.
- The documented workflow redirects the user to Fiverr to sign up/sign in or place an order; hiring is performed on Fiverr.

Stage 1 constraints:
- Fiverr is a buyer-side talent discovery source, not a seller-side feed of jobs to apply for.
- Do not claim it finds Fiverr gigs for workers seeking work.
- Use the official MCP endpoint, not scraping, password capture or private endpoints.
- Keep checkout, order placement and payment on Fiverr with the user's action.
- Any quality-price comparison must use only capabilities and permitted data actually returned by the official MCP and must be implemented consistently with current terms. Never treat reviews as verified delivery evidence without source context.

### 2.3 OneForma — public project/opportunity board

- Public project board: https://www.oneforma.com/projects/
- Application guide: https://www.oneforma.com/help-center/project-help/how-to-apply-to-projects-in-your-dashboard/
- Payment guide: https://www.oneforma.com/brand/prototyping/website/helpcenter-article.html
- Verification date: 2026-11-12.

Verified facts:
- Public listings include project categories such as annotation, data collection, judging, translation, transcription and LLM prompt authoring.
- Projects have different country, language, skill and profile requirements; the platform matches listings against a user's profile and lists country availability on each project.
- Its current payment guidance describes PayPal, Payoneer and direct bank transfer in USD/EUR/GBP, twice-monthly processing and a USD 25 minimum payout threshold. Provider/country eligibility still needs checking for the individual user.

Stage 1 constraints:
- Begin with public listing discovery only, and only through an access method allowed by the site's current terms/robots policy. Do not reverse-engineer authenticated APIs or bypass controls.
- Every project needs its own country/language/skill eligibility assessment.
- Do not state that a payout method is available in Ghana or any other country without country-specific evidence. A global payment-method list is not proof of local availability.
- Application and identity verification remain on OneForma; Hop3 can prepare a checklist and open the official application page.

### 2.4 User-submitted opportunity URL (Stage 1)

Allow a user to paste a URL or share a link from a browser or composer. Store the URL, user-supplied context and retrieval timestamp. Fetch/read only through permitted methods. If access is blocked or the page is private, ask the user to provide the relevant content or open it themselves; do not bypass the access boundary.

The ingested item must be labelled user-submitted until the employer, source and requirements have been verified.

## 3. Additional source candidates (not yet approved integrations)

Examples of future source families:
- survey panels and research participant programmes;
- university course reviewer, assessment grader and curriculum evaluation programmes;
- local event/hospitality/retail shift sources;
- user-testing and crowdtesting platforms;
- translation, language assessment and voice-data programmes;
- employer and NGO short-term opportunities;
- local fieldwork and mystery-shopping platforms.

A source is not approved merely because it appears in search results. Before implementation, verify ownership, official access route, terms, geographic availability, payout method/threshold, data retention, refresh policy and whether automated discovery is permitted.

## 4. Source evidence and review procedure

For every source:
1. Read current official integration documentation and terms.
2. Record exact endpoints, supported tools/actions and user side.
3. Test OAuth/permissions with a non-production test account where available.
4. Verify one read operation and its response schema.
5. Test rate-limit handling and source unavailability.
6. Confirm user confirmation for any write operation.
7. Validate country eligibility and payout details at individual opportunity level.
8. Record evidence URL, observation time and reviewer in the source registry.
9. Revisit before release and after provider announcements or errors.

## 5. External-source links checked on 2026-11-12

- Upwork MCP and current AI restrictions: https://www.upwork.com/ai/mcp
- Upwork MCP rate limits: https://support.upwork.com/hc/en-us/articles/56577997707923-Rate-limits-for-Upwork-MCP
- Fiverr MCP: https://help.fiverr.com/hc/en-us/articles/52715474121361-Using-Fiverr-MCP-in-your-AI-agent
- Fiverr terms: https://www.fiverr.com/legal-portal/legal-terms/terms-of-service
- OneForma project listings: https://www.oneforma.com/projects/
- OneForma application guidance: https://www.oneforma.com/help-center/project-help/how-to-apply-to-projects-in-your-dashboard/
- OneForma payment guidance: https://www.oneforma.com/brand/prototyping/website/helpcenter-article.html
