# Task Loading

How Task Studio loads Taskmaster tasks, where the data comes from, and how to
diagnose problems.

## Canonical source of truth

Tasks are **always** read from the active project's Taskmaster file:

```
<projectRoot>/.taskmaster/tasks/tasks.json
```

- The file is canonical. The SQLite `task_cache` table is only a read-through
  index refreshed **from** the file; it is never a data source for the task
  views and is never written back to Taskmaster files.
- When the cache and the file disagree, the file wins: every successful file
  read triggers a cache refresh when the file's mtime changed
  (`refreshTaskCacheIfStale`), which rebuilds the project's rows in one
  transaction and removes rows for deleted tasks.
- There is **no mock/demo data in the codebase**. When the file cannot be
  loaded, the UI shows an explicit error state (see below), never fake tasks.

## Project root resolution

The active project root is resolved server-side in `lib/taskmaster/project-root.ts`:

1. An explicit `?projectRoot=` query parameter — accepted only when it is in
   the allowlist (Settings → General → Project root allowlist) or equals the
   root the server was started in. Anything else is rejected with
   `PROJECT_ROOT_NOT_ALLOWLISTED` (403).
2. Settings → General → **Default project root**.
3. The root the server was started in (`TASKMASTER_DIR` / `USER_CWD` /
   `process.cwd()` — set by the `task-studio` CLI).

The same resolution is used by the task APIs, the task update (write) path,
the task cache, and the runner, so all features operate on the same project.

## Data flow

```
.taskmaster/tasks/tasks.json   (canonical, written by Taskmaster CLI)
        │
        │  chokidar watcher (scripts/ws.js, port 5566, 100ms debounce)
        │  → WebSocket "file-change" → React Query invalidation
        ▼
GET /api/taskmaster/tags, /tags/[tag], /tasks, /current, /source
        │  lib/taskmaster/load-tasks.ts
        │    ├─ resolveActiveProjectRoot()        (allowlist/default/env)
        │    ├─ read + JSON.parse                 (typed errors, no fallback)
        │    ├─ extractTagContexts()              (tagged / {tasks} / array)
        │    └─ refreshTaskCacheIfStale(SQLite)   (best-effort index update)
        ▼
React Query hooks (hooks/use-taskmaster-queries.ts, use-all-tasks.ts)
        ▼
Task views (components/common/tasks/all-tasks.tsx)
   ├─ TaskSourceBanner: active root, tasks path, task count, Refresh
   ├─ loading / error / empty states
   └─ list & board views
```

### Supported tasks.json shapes

`lib/taskmaster/parse-taskmaster-tasks.ts` accepts:

- Tagged (current): `{ "master": { "tasks": [...], "metadata": {...} }, ... }`
- Legacy flat: `{ "tasks": [...] }` (mapped to the `master` tag)
- Legacy array: `[ ...tasks ]` (mapped to the `master` tag)

Anything else fails with `UNSUPPORTED_FORMAT` — it is never guessed at.

### Error codes

API errors carry a machine-readable `code` which the UI maps to a specific
error state:

| Code | Meaning |
| --- | --- |
| `PROJECT_ROOT_NOT_ALLOWLISTED` | Requested root is not in the Settings allowlist |
| `PROJECT_ROOT_INVALID` | Configured root is unusable |
| `TASKS_FILE_NOT_FOUND` | `<root>/.taskmaster/tasks/tasks.json` does not exist |
| `INVALID_JSON` | tasks.json failed to parse (often a partial CLI write) |
| `UNSUPPORTED_FORMAT` | Valid JSON, but not a known Taskmaster shape |
| `PERMISSION_DENIED` | Filesystem permissions block the read |
| `TAG_NOT_FOUND` | Requested tag is not in the file |

## SQLite task_cache

Schema: `lib/db/schema.ts` (`task_cache` table); repository:
`lib/db/repositories/task-cache-repository.ts`.

- Rows store `project_root`, `tag`, `task_id` (dotted, e.g. `3.1`), scalar
  columns for filtering, `raw_json` (the untouched task), `source_file`, and
  `source_mtime_ms`.
- Refresh happens on every successful task load when the file's mtime changed,
  and manually via **Settings → Developer → Refresh task cache**
  (POST `/api/taskmaster/cache`).
- Invalid JSON or an unsupported format keeps the previous rows (partial-write
  protection) and reports the error; a *missing* file clears the rows — the
  canonical source says there are no tasks.
- The cache is never served in place of the file to the task views. If the
  file read fails, the API returns the error.

## File watching

`scripts/ws.js` (and `lib/websocket-server.ts` for the TS variant) watches the
active project's `tasks.json`, `state.json`, `config.json`, and reports. It
resolves the watched root the same way as the loader (settings default root →
env root), debounces changes 100 ms, skips unparseable/partial writes, and
handles file create (`add`) and delete (`unlink`). Browser clients invalidate
their React Query caches on each event, which re-reads the file server-side
and refreshes the SQLite cache.

Note: the WS process reads the settings mirror once at startup — restart
`pnpm dev` (or the CLI) after changing the default project root so the
watcher follows it.

## Diagnosing missing tasks

1. Open **Settings → Developer → Task source & cache**: shows the active
   project root, the expected tasks file path, whether the file exists, its
   mtime, the parsed task count, the cached row count, and cache sync state.
2. `GET /api/taskmaster/source` returns the same data as JSON.
3. Check the tasks page banner: it shows the active root and task count, plus
   a Refresh button.
4. Verify the project root: if you configured one in Settings → General, it
   must contain `.taskmaster/tasks/tasks.json` and (for explicit requests) be
   allowlisted.
5. If the file exists but tasks don't show, look for a parse error (invalid
   JSON / unsupported format) in the diagnostics.

## Mock/demo data policy

- There is no mock/demo data directory or module anywhere in the codebase.
  All task/tag/team views load real data; demo fallbacks (fake tag list,
  static mock team, demo cycles, random progress values) were removed.
- Runtime UI *definitions* live in `lib/` (view-model interfaces and helpers:
  `lib/task-view.ts`, `lib/tags.ts`, `lib/teams.ts`; static UI enums:
  `lib/status.tsx`, `lib/priorities.tsx`, `lib/labels.ts`; the local
  workspace user: `lib/users.ts`) and sidebar nav items in
  `components/layout/sidebar/nav-items.ts`. These are definitions, not data.
- New demo/test fixtures belong in test files (`**/__tests__/`), not in
  runtime modules.
