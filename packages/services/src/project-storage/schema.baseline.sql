CREATE TABLE automation_runs (
        run_id TEXT PRIMARY KEY,
        automation_id TEXT NOT NULL,
        workspace_key TEXT NOT NULL,
        scheduled_at INTEGER,
        trigger TEXT NOT NULL DEFAULT 'schedule',
        model_selection TEXT,
        dispatch_status TEXT NOT NULL DEFAULT 'claimed',
        outcome TEXT,
        session_id TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

CREATE TABLE automations (
        automation_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        cron_expr TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT,
        provider TEXT,
        mode TEXT,
        thought_level TEXT,
        model_selection TEXT,
        workspace_key TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        workspace_identity TEXT,
        target_task_id TEXT,
        bot_delivery_target TEXT,
        location_kind TEXT NOT NULL DEFAULT 'local',
        recurring INTEGER NOT NULL DEFAULT 1,
        max_runs INTEGER,
        end_at INTEGER,
        schedule_rule TEXT,
        schedule_edited_by_user INTEGER NOT NULL DEFAULT 0,
        run_count INTEGER NOT NULL DEFAULT 0,
        scheduled_run_count INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        lifecycle_status TEXT NOT NULL DEFAULT 'active',
        next_run_at INTEGER,
        last_run_at INTEGER,
        running INTEGER NOT NULL DEFAULT 0,
        claimed_at INTEGER,
        dispatch_status TEXT NOT NULL DEFAULT 'idle',
        dispatch_attempts INTEGER NOT NULL DEFAULT 0,
        retry_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      , project_id TEXT, host_id TEXT, additional_directories TEXT);

CREATE TABLE earn_application_events (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        evidence_type TEXT,
        evidence_url TEXT,
        note TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (application_id) REFERENCES earn_applications(id) ON DELETE CASCADE
      );

CREATE TABLE earn_applications (
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

CREATE TABLE earn_ingest_runs (
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

CREATE TABLE earn_opportunities (
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

CREATE TABLE earn_profile (
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

CREATE TABLE earn_saved (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL UNIQUE,
        saved_at INTEGER NOT NULL,
        notes TEXT,
        FOREIGN KEY (opportunity_id) REFERENCES earn_opportunities(id) ON DELETE CASCADE
      );

CREATE TABLE earn_source_connections (
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

CREATE TABLE hosts (
 host_id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_json TEXT, membership_id TEXT,
 position INTEGER NOT NULL DEFAULT 0, last_connection_status TEXT, last_connection_error TEXT, last_opened_at INTEGER);

CREATE TABLE off_peak_tasks (
        off_peak_task_id   TEXT PRIMARY KEY,
        server_ticket_id   TEXT,
        title              TEXT NOT NULL DEFAULT '',
        conversation_id    TEXT,
        session_id         TEXT,
        prompt             TEXT NOT NULL,
        permission_mode    TEXT NOT NULL,
        model              TEXT,
        thought_level      TEXT,
        model_selection    TEXT,
        workspace_key      TEXT NOT NULL,
        workspace_path     TEXT NOT NULL,
        workspace_identity TEXT,
        status             TEXT NOT NULL,
        queued_at          INTEGER NOT NULL,
        started_at         INTEGER,
        ended_at           INTEGER,
        failure_reason     TEXT,
        files_changed      INTEGER,
        settled_at         INTEGER,
        history_deleted_at INTEGER,
        registered_at      INTEGER,
        schedulable        INTEGER NOT NULL DEFAULT 0,
        queue_position     INTEGER,
        next_poll_at       INTEGER,
        claim_running      INTEGER NOT NULL DEFAULT 0,
        claimed_at         INTEGER,
        attempt_count      INTEGER NOT NULL DEFAULT 0,
        last_error         TEXT,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
      , project_id TEXT, host_id TEXT, additional_directories TEXT);

CREATE TABLE project_roots (
 project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
 root_path TEXT NOT NULL, position INTEGER NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(project_id,root_path));

CREATE TABLE projects (
 project_id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(host_id), name TEXT NOT NULL,
 name_overridden INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
 pinned_at INTEGER, deleted INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE remote_project_entries (
 entry_id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(host_id) ON DELETE CASCADE,
 remote_project_id TEXT, cached_name TEXT NOT NULL, cached_roots_json TEXT NOT NULL DEFAULT '[]',
 legacy_workspace_json TEXT, last_synced_at INTEGER, initial_position INTEGER, cached_deleted INTEGER NOT NULL DEFAULT 0, UNIQUE(host_id,remote_project_id));

CREATE TABLE "schema_migration" (id text primary key, checksum text not null, app_version text, "applied_at" integer not null);

CREATE TABLE session_creation_commands (
  workspace_key TEXT NOT NULL,
  client_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (workspace_key, client_id, command_id)
);

CREATE TABLE task_group_admissions (
  workspace_key TEXT NOT NULL,
  task_id TEXT NOT NULL,
  system_kind TEXT,
  user_organized INTEGER NOT NULL DEFAULT 0,
  creation_id TEXT,
  PRIMARY KEY (workspace_key, task_id)
);

CREATE TABLE task_group_members (
        group_id TEXT NOT NULL,
        workspace_key TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        workspace_identity TEXT,
        task_id TEXT NOT NULL,
        sort_order INTEGER,
        added_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_key, task_id),
        FOREIGN KEY (group_id) REFERENCES task_groups(group_id) ON DELETE CASCADE
      );

CREATE TABLE task_group_view_node_orders (
        node_type TEXT NOT NULL,
        node_key TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (node_type, node_key)
      );

CREATE TABLE task_group_workspace_bootstraps (
        workspace_key TEXT PRIMARY KEY,
        group_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

CREATE TABLE task_groups (
        group_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT 'gray',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

CREATE TABLE task_purge (
        workspace_key TEXT NOT NULL, task_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','deleted')),
        PRIMARY KEY(workspace_key,task_id)
      );

CREATE TABLE tasks (
        workspace_key TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        workspace_identity TEXT,
        task_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        task_status TEXT,
        provider TEXT,
        mode TEXT NOT NULL DEFAULT 'build',
        model TEXT,
        migration_source TEXT,
        forked_from_task_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        unread_at INTEGER,
        last_unread_at INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        title_overridden INTEGER NOT NULL DEFAULT 0,
        meta_json TEXT NOT NULL DEFAULT '{}', searchable_text TEXT NOT NULL DEFAULT '', cron_automation_id TEXT, off_peak_task_id TEXT, host_id TEXT, root_path TEXT, project_id TEXT, execution_directories TEXT, sort_order INTEGER, cli_title TEXT, handoff_pending INTEGER NOT NULL DEFAULT 0, cli_title_source TEXT, cli_created_at INTEGER, cli_updated_at INTEGER, cli_last_outcome TEXT, cli_deleted INTEGER, worktree_root TEXT,
        PRIMARY KEY (workspace_key, task_id)
      );

CREATE TABLE "tasks_schema_migration" (id text primary key, checksum text not null,  "time_applied" integer not null);

CREATE INDEX idx_automation_runs_by_automation
      ON automation_runs (automation_id, created_at DESC);

CREATE INDEX idx_automations_due
      ON automations (enabled, next_run_at);

CREATE INDEX idx_automations_retry
      ON automations (enabled, retry_at);

CREATE INDEX idx_automations_target_task ON automations(target_task_id) WHERE target_task_id IS NOT NULL;

CREATE INDEX idx_automations_workspace
      ON automations (workspace_key);

CREATE INDEX idx_earn_application_events_application
        ON earn_application_events (application_id, created_at);

CREATE INDEX idx_earn_applications_opportunity
        ON earn_applications (opportunity_id, created_at DESC);

CREATE INDEX idx_earn_ingest_runs_source
        ON earn_ingest_runs (source_key, started_at DESC);

CREATE INDEX idx_earn_opportunities_arrival
        ON earn_opportunities (first_seen_at, id);

CREATE INDEX idx_earn_opportunities_source
        ON earn_opportunities (source_key);

CREATE UNIQUE INDEX idx_off_peak_bound_active ON off_peak_tasks(workspace_key,session_id) WHERE session_id IS NOT NULL AND status NOT IN ('completed','failed','cancelled');

CREATE INDEX idx_off_peak_pick
      ON off_peak_tasks (status, queued_at);

CREATE INDEX idx_off_peak_ws
      ON off_peak_tasks (workspace_key, status);

CREATE UNIQUE INDEX idx_projects_host_name ON projects(host_id,name) WHERE deleted=0;

CREATE INDEX idx_task_group_members_group_order
      ON task_group_members (group_id, sort_order, added_at);

CREATE INDEX idx_task_group_view_node_orders_order
      ON task_group_view_node_orders (sort_order, created_at);

CREATE INDEX idx_tasks_cron_automation ON tasks(cron_automation_id, updated_at DESC)
    WHERE cron_automation_id IS NOT NULL AND deleted=0;

CREATE UNIQUE INDEX idx_tasks_host_task ON tasks(host_id,task_id);

CREATE INDEX idx_tasks_host_worktree ON tasks(host_id, worktree_root) WHERE worktree_root IS NOT NULL;

CREATE INDEX idx_tasks_off_peak_task ON tasks(off_peak_task_id, updated_at DESC)
    WHERE off_peak_task_id IS NOT NULL AND deleted=0;

CREATE INDEX idx_tasks_project ON tasks(project_id,archived,cli_updated_at DESC) WHERE deleted=0;

CREATE INDEX idx_tasks_workspace_archived_updated
      ON tasks (workspace_key, archived, updated_at DESC)
      WHERE deleted = 0;

CREATE INDEX idx_tasks_workspace_pinned_updated
      ON tasks (workspace_key, pinned, updated_at DESC)
      WHERE deleted = 0;

CREATE TRIGGER task_purge_insert_guard BEFORE INSERT ON tasks
      WHEN EXISTS(SELECT 1 FROM task_purge WHERE workspace_key=new.workspace_key AND task_id=new.task_id AND state='deleted')
      BEGIN SELECT RAISE(ABORT, 'task.permanently-deleted'); END;

CREATE TRIGGER task_purge_restore_guard BEFORE UPDATE OF archived ON tasks
      WHEN new.archived=0 AND EXISTS(SELECT 1 FROM task_purge WHERE workspace_key=new.workspace_key AND task_id=new.task_id)
      BEGIN SELECT RAISE(ABORT, 'task.permanent-deletion-pending'); END;
