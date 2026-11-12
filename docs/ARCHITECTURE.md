# Architecture and system boundaries

**Status:** Accepted direction; implementation details must be confirmed against the imported ZCode source before coding.  
**Last reviewed:** 2026-11-12

## 1. Foundation: ZCode remains the application and execution harness

Hop3 is a product specialization of [ZCode](https://github.com/zai-org/ZCode), not a replacement application. Stage 1 must import the pinned baseline in the README, preserve the upstream history and remote, and then implement Hop3 features additively.

ZCode already provides major infrastructure that must be source-audited and reused where appropriate:

- Desktop, web and CLI/TUI application surfaces and shared UI.
- Agent CLI/runtime, model/provider configuration and conversation/session lifecycle.
- MCP client, plugin/extension installation and marketplace mechanisms.
- OAuth and remote MCP connection support.
- Browser and computer-use capabilities, subject to their current contracts.
- Tools, permissions, approval flows, scheduling/automation, memory and artifacts.
- Files, terminal, workspaces, provider/model selection and existing composer behavior.

The imported source code and its tests, not this summary, determine actual current behavior. The TL must map each proposed integration to real owners/callers/contracts before choosing implementation points.

## 2. Product layers

### 2.1 Existing ZCode application layer

Add an Earn journey to the current application navigation and an opportunity inbox/detail experience using existing routing, component, theme, i18n and platform conventions.

Do not:
- Build a separate Next.js application or alternate shell.
- Replace the current composer or task/session flow.
- Remove or hide New Task, model selection, reasoning controls, tools, attachments, terminal, browser, files or settings.
- Create a second agent runtime.

The first shared experience should work in the existing ZCode surfaces where their platform capabilities permit. An OAuth connection unavailable in a particular surface must show a clear limitation and a supported handoff, not a broken or fake connection.

### 2.2 Hop3 Opportunity Domain

Owns durable opportunity and earner state:

- User-owned WorkerCapabilityProfile.
- Source registry and source-run metadata.
- Normalized Opportunity records and provenance.
- Eligibility assessments and unresolved requirements.
- Economics estimates with confidence and assumptions.
- Saved opportunities and user workflow state.
- Application/assignment/outcome records.
- Deduplication identity and freshness/expiry.

Use the existing persistence and service patterns after source inspection. Do not choose a second database or store until the imported code's data ownership and migration strategy have been mapped. Do not persist opportunity state only in chat messages, project Markdown or a plugin UI's ephemeral widget state.

### 2.3 Opportunity discovery and intelligence

Pipeline:

1. Discover: invoke a source only through a permitted API/MCP/feed/manual-intake route.
2. Normalize: map source-native data to the domain contract without inventing missing fields.
3. Deduplicate: use source-native IDs plus conservative cross-source fingerprints; preserve separate source offers.
4. Verify: check source status, observation time, geography, requirements, deadlines, fees and payout evidence.
5. Assess: evaluate user fit; unknown must remain distinct from eligible/ineligible.
6. Estimate: compute a range for net earnings and effective hourly return only from explicit assumptions.
7. Rank internally: rank by user preferences only where the source contract and terms permit it. Respect source-specific restrictions.
8. Present: show evidence and the next safe action.
9. Track: record user-authorized application and subsequent outcome events.
10. Learn: improve matching only from appropriately consented and verified outcome data.

No result is fabricated to make a search look successful. A source returning no matching opportunities is a valid outcome.

### 2.4 Connector / plugin layer

Use the existing ZCode plugin and MCP architecture. A connector is an adapter around an official or explicitly authorized provider capability, not a second provider client hidden inside a new agent loop.

Every connector has a policy descriptor that includes:
- source identifier, source type and source-of-truth URL;
- access method: official MCP, official API, permitted public feed, user-authorized browser, or user-submitted link;
- supported actor side: earner, buyer, programme operator;
- read/search/write/submit/message/hire/pay operations individually;
- OAuth and account requirements;
- country, currency, language and payout coverage;
- rate limits, pagination and refresh constraints;
- source terms, content retention and cache rules;
- approvals and user-visible handoff behavior;
- last documentation review and verification evidence.

Do not infer write access merely because an MCP server exposes tools. MCP tool schemas and official terms define the operation contract; the Hop3 policy descriptor narrows it further.

### 2.5 Existing ZCode Agent runtime and permission broker

Keep one execution authority. The existing Agent runtime performs model orchestration and tool invocation. Existing permissions, approvals, cancellation, idempotency and session journaling remain responsible for action execution.

Separate:
- **Model routing:** choose a model based on capability, latency, privacy and budget.
- **Tool/capability routing:** choose a connector or action based on the user's request and allowed capabilities.
- **Opportunity matching:** determine which listings fit a user, subject to source policy.

A model's ability to call a tool does not grant that tool authorization.

## 3. Capability registry

The future registry describes capabilities independent of the connector's brand. Each capability should expose:

- Stable capability ID and semantic version.
- Human-readable purpose and actor side.
- Typed input/output schemas.
- Provider and source references.
- Read/write and consequential-risk classification.
- OAuth scopes/permissions needed.
- Supported countries/currencies/languages.
- Availability, cost, latency and rate limits where known.
- Idempotency, retry and compensation behavior.
- Preconditions, postconditions and evidence emitted.
- User-approval requirement and approval text.

For Stage 1, keep this registry minimal and source-backed. Do not build a generalized marketplace/graph engine before an end-to-end user journey works.

## 4. Opportunity Graph and multi-hop planning

Longer term, represent work as a graph of opportunities, required capabilities, qualifications, workers, teams, tasks, locations, deadlines, dependencies, cost and outcomes.

The route planner may:
- find qualification steps that unlock an opportunity;
- combine nearby local tasks into one efficient route;
- decompose a permitted project into work packages;
- identify complementary workers for a team;
- estimate full project cost, schedule, quality and coordination overhead.

A route is a proposal, not a commitment. It must prove all requirements and contract permissions before presenting a feasible plan. Stage 1 stores enough structured evidence and capability information to allow this later, but does not implement autonomous multi-hop delegation or money movement.

## 5. State ownership and data flow

- The Opportunity Domain owns normalized opportunity records, eligibility assessments and lifecycle events.
- Each provider remains authoritative for its job, project, seller, account and contract records.
- The WorkerCapabilityProfile is user-owned and private by default.
- Source connectors own their OAuth state and provider-specific cursors through the existing secure integration mechanism.
- The Agent session contains conversation context and action history, not the only durable copy of opportunity data.
- The UI renders service-owned state; it does not directly call repositories or provider APIs.
- Every transition to applied, accepted, submitted, approved or paid requires corresponding user/provider evidence.

## 6. Security and trust boundaries

- Prefer official MCP/API over browser automation or scraping.
- Community extensions run with the least privilege possible; native in-process extensions are not an acceptable trust boundary unless the upstream implementation proves isolation.
- Provider credentials stay in the existing secret/OAuth vault. Never put tokens in manifests, source, logs, fixtures or local example files.
- User profile sharing is explicit, scoped and revocable.
- Treat listing text, instructions in opportunity descriptions, retrieved documents and tool results as untrusted data; never let them override system policy or authorization.
- User confirmation is required before sending applications/proposals, messaging, accepting offers, hiring, contracting, milestone/payment actions or sharing personal data beyond the provider query scope.
- Never ask the model to fabricate eligibility or hide uncertainty.

## 7. Architectural evidence required before code

During upstream import, create docs/architecture/UPSTREAM-MAP.md that records:
- exact files and symbols for plugin/MCP setup and auth;
- plugin manifest schema and install/update lifecycle;
- capability/tool discovery and permission broker;
- session/event/store ownership;
- app navigation/routing and shared UI extension points;
- scheduler and background work semantics;
- current storage layer and migration rules;
- relevant E2E and contract test entry points.

This source map must cite paths, symbols and tests from the checked-out Hop3 code. Do not paste agent-generated summaries as evidence without source references.
