/**
 * SQL schema for the Task Studio app database (SQLite).
 *
 * The database stores app-level metadata ONLY. Taskmaster's
 * `.taskmaster/tasks/tasks.json` remains the canonical source of truth for
 * tasks; `task_cache` is a read-through index refreshed from that file.
 *
 * All statements here are static DDL - user data only ever enters the
 * database through parameterized queries in the repositories.
 */

export const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS app_settings (
   id TEXT PRIMARY KEY,
   value_json TEXT NOT NULL,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
   id TEXT PRIMARY KEY,
   name TEXT,
   root_path TEXT NOT NULL UNIQUE,
   is_default INTEGER NOT NULL DEFAULT 0,
   is_valid INTEGER NOT NULL DEFAULT 0,
   validation_status TEXT,
   validation_error TEXT,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL,
   last_opened_at TEXT
);

CREATE TABLE IF NOT EXISTS runner_runs (
   id TEXT PRIMARY KEY,
   project_id TEXT,
   project_root TEXT NOT NULL,
   task_id TEXT,
   mode TEXT NOT NULL CHECK (mode IN ('run-task', 'run-next', 'loop', 'loop-sandbox')),
   command_json TEXT NOT NULL,
   status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
   started_at TEXT NOT NULL,
   finished_at TEXT,
   exit_code INTEGER,
   error TEXT,
   log_file TEXT,
   metadata_json TEXT,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runner_runs_project_started
   ON runner_runs (project_root, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runner_runs_status ON runner_runs (status);

CREATE TABLE IF NOT EXISTS runner_locks (
   project_root TEXT PRIMARY KEY,
   run_id TEXT NOT NULL,
   pid INTEGER,
   status TEXT NOT NULL,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL,
   expires_at TEXT
);

CREATE TABLE IF NOT EXISTS runner_log_index (
   id TEXT PRIMARY KEY,
   run_id TEXT NOT NULL UNIQUE REFERENCES runner_runs (id) ON DELETE CASCADE,
   log_file TEXT NOT NULL,
   size_bytes INTEGER NOT NULL DEFAULT 0,
   line_count INTEGER,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_cache (
   id TEXT PRIMARY KEY,
   project_id TEXT,
   project_root TEXT NOT NULL,
   tag TEXT NOT NULL,
   task_id TEXT NOT NULL,
   title TEXT,
   description TEXT,
   status TEXT,
   priority TEXT,
   dependencies_json TEXT,
   labels_json TEXT,
   raw_json TEXT NOT NULL,
   source_file TEXT NOT NULL,
   source_mtime_ms INTEGER,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL,
   UNIQUE (project_root, tag, task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_cache_status ON task_cache (project_root, tag, status);

CREATE TABLE IF NOT EXISTS webhooks (
   id TEXT PRIMARY KEY,
   name TEXT NOT NULL,
   url TEXT NOT NULL,
   enabled INTEGER NOT NULL DEFAULT 1,
   events_json TEXT NOT NULL,
   secret_encrypted TEXT,
   secret_masked TEXT,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL,
   last_tested_at TEXT,
   last_status TEXT,
   last_error TEXT
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
   id TEXT PRIMARY KEY,
   webhook_id TEXT NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
   event_type TEXT NOT NULL,
   status TEXT NOT NULL,
   request_json TEXT,
   response_status INTEGER,
   response_body_preview TEXT,
   error TEXT,
   created_at TEXT NOT NULL,
   delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
   ON webhook_deliveries (webhook_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
   id TEXT PRIMARY KEY,
   type TEXT NOT NULL,
   title TEXT NOT NULL,
   message TEXT,
   status TEXT NOT NULL,
   read_at TEXT,
   metadata_json TEXT,
   created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

CREATE TABLE IF NOT EXISTS integrations (
   id TEXT PRIMARY KEY,
   provider TEXT NOT NULL UNIQUE,
   enabled INTEGER NOT NULL DEFAULT 0,
   config_json TEXT NOT NULL,
   secret_masked TEXT,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
   id TEXT PRIMARY KEY,
   event_type TEXT NOT NULL,
   actor TEXT,
   project_root TEXT,
   task_id TEXT,
   run_id TEXT,
   message TEXT,
   metadata_json TEXT,
   created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events (created_at DESC);
`;
