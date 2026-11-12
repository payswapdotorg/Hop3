// Hop3 — Stage 1 Earn persistence schema (frozen source, checksum-guarded).
// 7 earn_* tables, additive-only. JSON payloads stored as TEXT (validated on
// read); timestamps stored as epoch-ms INTEGER (ISO strings only at the repo
// boundary). SQLite constraints: no enums, no lists — TEXT + app-level checks.
// Anti-drift: the byte-identical copy embedded in tasksDatabase/migrations.ts
// is guarded by hop3EarnSchema.test.ts.

export const EARN_SCHEMA = `
      CREATE TABLE IF NOT EXISTS earn_profile (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL DEFAULT 1,
        display_name TEXT,
        country_code TEXT,
        region_note TEXT,
        work_mode TEXT NOT NULL DEFAULT 'any',
        languages_json TEXT,
        skills_json TEXT,
        qualifications_json TEXT,
        preferences_json TEXT,
        weekly_hours INTEGER NOT NULL DEFAULT 0,
        timezone TEXT,
        equipment_json TEXT,
        income_goal_amount REAL,
        income_goal_currency TEXT NOT NULL DEFAULT 'USD',
        payout_capabilities_json TEXT,
        consent_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS earn_source_connections (
        key TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        access_mode TEXT NOT NULL,
        actor_modes_json TEXT NOT NULL,
        operations_json TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        ranking_policy TEXT NOT NULL DEFAULT 'hop3-allowed',
        rate_limit_json TEXT NOT NULL,
        freshness_max_hours INTEGER NOT NULL DEFAULT 24,
        mode TEXT NOT NULL DEFAULT 'not-configured',
        status_message TEXT,
        evidence_url TEXT,
        last_sync_at INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS earn_ingest_runs (
        id TEXT PRIMARY KEY,
        source_key TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        fetched INTEGER NOT NULL DEFAULT 0,
        inserted INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0,
        duplicates INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        errors_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_earn_ingest_runs_source
        ON earn_ingest_runs (source_key, started_at DESC);

      CREATE TABLE IF NOT EXISTS earn_opportunities (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL DEFAULT 1,
        source_key TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        opportunity_type TEXT,
        work_mode TEXT,
        canonical_url TEXT NOT NULL,
        platform TEXT NOT NULL,
        provenance TEXT NOT NULL DEFAULT 'live',
        eligibility_json TEXT,
        requirements_json TEXT,
        compensation_json TEXT,
        payout_json TEXT,
        application_json TEXT,
        time_json TEXT,
        risk_flags_json TEXT,
        source_status TEXT,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        observed_at INTEGER NOT NULL,
        expires_at INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        raw_json TEXT,
        UNIQUE (source_key, external_id)
      );

      CREATE INDEX IF NOT EXISTS idx_earn_opportunities_arrival
        ON earn_opportunities (first_seen_at, id);

      CREATE INDEX IF NOT EXISTS idx_earn_opportunities_source
        ON earn_opportunities (source_key);

      CREATE TABLE IF NOT EXISTS earn_saved (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL UNIQUE,
        saved_at INTEGER NOT NULL,
        notes TEXT,
        FOREIGN KEY (opportunity_id) REFERENCES earn_opportunities(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS earn_applications (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        draft TEXT,
        draft_generated_at INTEGER,
        draft_model TEXT,
        draft_edited_by_user INTEGER NOT NULL DEFAULT 0,
        submitted_at INTEGER,
        submitted_channel TEXT,
        submitted_evidence TEXT,
        accepted_at INTEGER,
        completed_at INTEGER,
        approved_at INTEGER,
        paid_at INTEGER,
        amount_paid REAL,
        paid_currency TEXT,
        payment_evidence TEXT,
        outcome_notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (opportunity_id) REFERENCES earn_opportunities(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_earn_applications_opportunity
        ON earn_applications (opportunity_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS earn_application_events (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        evidence_type TEXT,
        evidence_url TEXT,
        note TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (application_id) REFERENCES earn_applications(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_earn_application_events_application
        ON earn_application_events (application_id, created_at);
    `;

/** 0008_earn_tables 建立的全部表（防漂移测试用；顺序与 EARN_SCHEMA 一致）。 */
export const EARN_TABLES = [
  "earn_profile",
  "earn_source_connections",
  "earn_ingest_runs",
  "earn_opportunities",
  "earn_saved",
  "earn_applications",
  "earn_application_events",
] as const;
