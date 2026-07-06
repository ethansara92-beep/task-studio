# SQLite App Database

Task Studio keeps its app-level data in a local SQLite database. This page documents why the
database exists, what lives in it (and what deliberately does not), the schema, migrations,
backups, and troubleshooting.

## Why SQLite

Task Studio started fully file-based (settings JSON, per-run JSON metadata, JSONL audit log).
That works, but queryable history (runner runs, deliveries, notifications, audit events) and a
fast task search index need a real local database. SQLite fits a single-user local tool:
zero-setup, one file, transactional.

Task Studio uses the **Node.js built-in `node:sqlite` module** (`DatabaseSync`) rather than a
native npm addon. This package publishes a prebuilt Next.js standalone server to npm, so a
compiled native dependency (e.g. `better-sqlite3`) would tie the published artifact to one
platform. The built-in module adds **zero dependencies**, needs no compilation, and has the
same synchronous API shape.

> **Runtime requirement**: `node:sqlite` needs **Node.js >= 22.5**. On older runtimes Task
> Studio still works: settings fall back to the JSON file, and the runner falls back to
> file-based run metadata. Database-backed features (projects registry, task cache,
> notifications, run history queries) are disabled and the Developer settings page shows why.

## What is stored where

| Data                                            | Store                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Tasks**                                       | `.taskmaster/tasks/tasks.json` — **canonical, owned by Taskmaster**. Never written by the database layer. |
| Task cache/index                                | SQLite `task_cache` — read-through copy for fast search/filter. File always wins.                         |
| Settings                                        | SQLite `app_settings` (primary) + JSON mirror `task-studio-settings.json` (human-readable, fallback).     |
| Projects registry                               | SQLite `projects`.                                                                                        |
| Runner history                                  | SQLite `runner_runs` (+ per-run `.taskmaster/runs/<runId>.json` files kept as on-disk artifacts).         |
| Runner logs                                     | Files under `.taskmaster/runs/*.log`; SQLite `runner_log_index` stores metadata only (path, size).        |
| Runner lock                                     | `.taskmaster/runner.lock` file (cross-process enforcement) mirrored into SQLite `runner_locks`.           |
| Webhooks / integrations                         | Edited in Settings; mirrored into `webhooks` / `integrations` tables on save.                             |
| Webhook deliveries, notifications, audit events | SQLite only.                                                                                              |

## Database location

```
<project>/.taskmaster/task-studio.sqlite
```

- Lives next to the other machine-local Task Studio files (settings JSON, audit log), so one
  `.taskmaster` directory holds everything for a project. Git-ignored together with its
  `-wal`/`-shm` sidecars and `.taskmaster/backups/`.
- Override with the `TASK_STUDIO_DB_PATH` environment variable (used by tests; also handy if
  you want the database outside the repository).
- The database is per-project by design: a Task Studio server instance is bound to one project
  root (`TASKMASTER_DIR`/`USER_CWD`), and the `projects` table exists for the planned
  multi-project registry.

Connection settings applied on every open:

```
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

The connection is cached on `globalThis`, so Next.js dev-mode HMR does not open duplicate
handles. The WebSocket file-watcher process never writes to the database — all writes happen
in the Next.js server process.

## Schema overview

Twelve tables, created by migration 1 (`lib/db/schema.ts`):

| Table                | Purpose                                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_migrations`  | Migration ledger (`id`, `name`, `applied_at`).                                                                                                                                                                                                      |
| `app_settings`       | One row per settings section (`id` = section key, `value_json`).                                                                                                                                                                                    |
| `projects`           | Project roots with default flag, validation state, last-opened timestamp. A valid root contains `.taskmaster/tasks/tasks.json`.                                                                                                                     |
| `runner_runs`        | Run history. `command_json` is a structured argv array (e.g. `["tm","start","12"]`) — arbitrary shell strings are never stored. Status ∈ queued/running/completed/failed/cancelled; mode ∈ run-task/run-next/loop/loop-sandbox (CHECK-constrained). |
| `runner_locks`       | One active run per project root; mirrors the lock file.                                                                                                                                                                                             |
| `runner_log_index`   | Log file path/size per run (FK → `runner_runs`, cascade delete).                                                                                                                                                                                    |
| `task_cache`         | Read-through task index: tag, dotted task id, title/status/priority, labels, raw task JSON, source file mtime. Unique on (project_root, tag, task_id).                                                                                              |
| `webhooks`           | Endpoint mirror. `secret_masked` only — see security notes below.                                                                                                                                                                                   |
| `webhook_deliveries` | Delivery/test history (FK → `webhooks`, cascade delete).                                                                                                                                                                                            |
| `notifications`      | In-app notification history (runner start/complete/fail/cancel).                                                                                                                                                                                    |
| `integrations`       | Provider mirror (github/gitlab/linear/custom), secrets stripped.                                                                                                                                                                                    |
| `audit_events`       | Local audit trail with optional project/task/run context.                                                                                                                                                                                           |

All access goes through typed repositories in `lib/db/repositories/` using **parameterized
queries only** — user input is never interpolated into SQL.

## Migrations

- Defined in `lib/db/migrations.ts` as an append-only list (`id`, `name`, `up`).
- Each pending migration runs inside its own transaction; a failure rolls back and leaves the
  ledger untouched (no partial schema).
- Applied automatically whenever the database is opened (server start, first API call), and on
  demand via **Settings → Developer → Run migrations**.
- The current migration version is shown in Developer settings and in `/api/settings/diagnostics`.

## Settings migration & mirroring

On the first run with a database, existing `task-studio-settings.json` content is validated and
imported into `app_settings`. The JSON file is **not deleted**; every save rewrites it as a
human-readable mirror (and it remains the full fallback store on Node < 22.5). If database rows
and the file disagree, the database wins while it is available.

Import/Export in Settings keeps working against the database: exports strip secrets, imports
are schema-validated with a pre-import backup of the JSON mirror.

## How the runner uses the database

1. Run request validated (task id charset, project root vs. configured root).
2. Lock check: in-memory slot + `.taskmaster/runner.lock` (stale locks — dead pid — are cleared,
   including the `runner_locks` mirror row).
3. Run row inserted (`running`) + lock row created; the per-run JSON file is still written.
4. `tm` is spawned with a fixed argv (`shell: false`); stdout/stderr stream to the log file.
5. On exit: run row updated (status/exit code/error), log metadata indexed into
   `runner_log_index`, lock removed, audit event + optional notification written.
6. History shown in the UI comes from `runner_runs` (legacy `.taskmaster/runs/*.json` files are
   imported once per server process). Retention settings prune files and rows together.

## Task cache behavior

- `GET /api/taskmaster/cache` compares the stored `source_mtime_ms` with the file's mtime and
  rebuilds the project's rows in one transaction when the file changed (`POST` forces it).
- A temporarily invalid `tasks.json` (e.g. a partial write by the CLI) keeps the previous cache
  and reports the parse error instead of destroying rows.
- A missing tasks file empties the cache — the canonical source says there are no tasks.
- The cache **never writes back** to `tasks.json`. Live file watching over WebSocket is
  untouched; the existing tasks API keeps reading the file directly.

## Backups & maintenance (Settings → Developer)

- **Run migrations** — creates the database if missing, applies pending migrations.
- **Export backup** — `VACUUM INTO` a timestamped snapshot under `.taskmaster/backups/`
  (consistent even mid-WAL).
- **Vacuum** — compacts the file.
- **Clear run history / audit log / stale lock** — clears files and database rows together.
- **Copy diagnostics** — includes database path, availability, migration version and row counts.

## Security notes

- Parameterized SQL everywhere; repository tests include injection attempts.
- `command_json` only ever contains the argv arrays built from the fixed mode allowlist.
- **Secrets are not stored in the database.** Raw webhook secrets/URLs live only in the settings
  store (masked in every API response, stripped from exports), exactly as before. The
  `webhooks`/`integrations` tables carry `secret_masked` for display; `secret_encrypted` is
  reserved for a future encrypted implementation and currently always NULL.
- Project roots and run ids are validated before any path is built; log/metadata paths resolve
  strictly inside `.taskmaster/runs/`.

## Troubleshooting

| Symptom                                   | Cause / fix                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “database is locked”                      | Another process is writing. WAL + `busy_timeout=5000` make this rare; close extra Task Studio instances pointed at the same project.                                                                                                                                         |
| “Migration N failed”                      | The migration rolled back; the database is still at the previous version. Check the error, update, and use **Run migrations**.                                                                                                                                               |
| Corrupted database                        | Stop the app, move `task-studio.sqlite*` aside (or restore a file from `.taskmaster/backups/`), restart — the schema is recreated and settings re-import from the JSON mirror. Run history in the removed file is lost; run files under `.taskmaster/runs/` are re-imported. |
| Missing database file                     | Created automatically on first use; or press **Run migrations** in Developer settings. Check the Developer page for the exact path.                                                                                                                                          |
| “SQLite is unavailable … Node.js >= 22.5” | Upgrade Node. Until then Task Studio runs in file-fallback mode (settings + runner work; registry/cache/notifications are off).                                                                                                                                              |
| Invalid project root                      | The root must contain `.taskmaster/tasks/tasks.json`. Validate in Settings → Projects or `PATCH /api/projects/<id>` with `{"action":"validate"}`.                                                                                                                            |
| Stale runner lock                         | Shown in the runner panel / Developer settings; **Clear stale lock** removes the lock file and the mirror row (only when the pid is dead) and writes an audit event.                                                                                                         |
