# Task Studio Settings

Task Studio has a Linear-inspired Settings area (sidebar → Settings, or `/settings`) covering
the app, the Taskmaster/Claude Code integration, the local runner, and connectivity. This page
documents where settings live, what each section does, and how to troubleshoot.

## Config file

Settings are stored per machine at:

```
<project>/.taskmaster/task-studio-settings.json
```

- **Versioned** (`"version": 1`) and validated with a Zod schema on every load and save.
- **Merged with defaults**: partial or older files are deep-merged over defaults, so new
  settings appear automatically after upgrades.
- **Corruption-safe**: unparseable or schema-invalid files are backed up next to the original
  (`task-studio-settings.json.corrupt-<timestamp>.bak`) and replaced with defaults.
- **Git-ignored** along with the audit log (`task-studio-audit.log`) - these are machine-local.
- Task data is never stored here; `.taskmaster/tasks/tasks.json` belongs to Taskmaster and is
  never written by the settings system.

## Sections

| Section                  | What it controls                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| General                  | Display name, startup behavior, project-root allowlist, confirmation prompts, reset-all.                                        |
| Preferences              | Theme, density, sidebar, date format, default view, task/log refresh intervals, max log size.                                   |
| Workspace                | Workspace identity, default tag, workspace runner policy, config metadata.                                                      |
| Projects                 | Configured project roots with per-project runner mode, sandbox preference, CLI overrides, env vars.                             |
| Taskmaster & Claude Code | `tm` / `claude` executable paths with live validation, runner defaults, Claude options.                                         |
| Runner                   | Enable/disable, default mode, retention (run count & log days), stop grace timeout, live state, maintenance.                    |
| Workflow                 | Status mapping (ready/in-progress/done/blocked), dependency policy (block/warn/ignore - enforced), auto-run trigger preference. |
| Labels                   | Task Studio-managed labels with colors/descriptions; ai-run / needs-review role labels.                                         |
| Templates                | Prompt prefix/suffix and per-type templates with `{{variable}}` preview. Text only - never commands.                            |
| Notifications            | In-app + desktop notifications per runner event; Slack/Discord webhook URLs with test buttons.                                  |
| Integrations             | GitHub/GitLab repo context, Linear placeholder, custom outgoing webhook with event filters.                                     |
| Webhooks                 | Outgoing endpoints (name, URL, HMAC secret, events), timeout, signed test delivery.                                             |
| Import / Export          | Export (secrets stripped), validated import with pre-import backup, reset, runner-data cleanup.                                 |
| Developer                | Diagnostics (versions, paths, CLI detection), debug logging, experimental feature flags.                                        |
| Security & Access        | Allowed runner modes, env-var policy, masking notes, audit log toggle.                                                          |
| About                    | App/Taskmaster info, config path, CLI detection status.                                                                         |

## CLI paths (`tm` and `claude`)

Set the executable paths under **Settings → Taskmaster & Claude Code**:

- A bare command name (`tm`) resolves via `PATH`; or use an absolute path
  (`/opt/homebrew/bin/tm`).
- Only the executable path is stored - never a command string.
- **Validate** runs the binary with a single fixed argument (`--version`) via `spawn` with
  `shell: false` and a 10s timeout, and shows the detected version or a specific error
  (not found, permission denied, non-zero exit).
- Precedence for the runner: `TASKMASTER_RUNNER_BIN` env var → per-project override
  (Settings → Projects) → global setting → `tm`.
- Claude behavior options (max turns, budget, permission mode, tool lists) are stored today and
  apply when Task Studio invokes Claude directly (planned); currently Taskmaster launches
  Claude itself.

## Project root allowlist

Settings → General. Each entry is validated server-side: it must be an absolute, existing
directory containing `.taskmaster/tasks/tasks.json`. When the allowlist is non-empty, run
requests for any root not in the list are rejected with HTTP 403. An empty allowlist means
"only the project Task Studio was started in" (which is the only root the server executes in
anyway).

## Runner integration

The runner reads settings at the start of every run:

- configured `tm` path (see precedence above)
- allowed runner modes (Security & Access) and runner enabled flag (Runner)
- project root allowlist (General)
- dependency policy (Workflow) - `block` rejects runs for tasks with unfinished dependencies
- sandbox preference (Taskmaster & Claude Code / per-project) - the loop button uses it
- custom environment variables (Claude env + per-project env, subject to the Security policy;
  `PATH`, `NODE_OPTIONS`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES` can never be overridden)
- stop grace timeout, history limit, and log retention (Runner) - old runs are pruned after
  each run finishes
- max log size and log refresh interval (Preferences) - applied to the logs API and UI polling
- confirmation prompts (General / Taskmaster) - shown before run, loop, and stop

## Secrets

Task Studio has **no secure secret storage**. Consequences:

- Webhook URLs and signing secrets are stored in plain text in the local settings file. The UI
  warns about this and masks values after save (`••••••••`); the mask sentinel sent back means
  "keep the stored value", so real secrets never round-trip through the browser.
- Exports always strip secrets.
- Access tokens for GitHub/GitLab/Linear are intentionally **not** accepted - use each tool's
  own CLI authentication instead.
- Secrets are never written to the audit log or run logs.

## Webhooks and notifications

- Webhook URLs must be `https://`; plain `http://` is allowed only for
  localhost / 127.0.0.1 / [::1].
- Test deliveries send a tiny JSON payload (`{"event":"webhook.test",…}`), signed with
  `X-TaskStudio-Signature: sha256=<hmac>` when a secret is set, with the configured timeout.
- Automatic event delivery is gated behind the experimental _Webhook event delivery_ flag
  (Settings → Developer) and is not implemented yet - the settings and test path are.
- In-app notifications for run start/complete/fail/cancel are live; desktop notifications use
  the browser Notification API after permission is granted.

## Import / export

- **Export** downloads the settings JSON with all secrets removed.
- **Import** validates the file against the schema first; invalid files are rejected without
  touching the current config. The current file is backed up
  (`task-studio-settings.json.pre-import-<timestamp>.bak`) before the import is applied.
- Task data import/export is deliberately not offered - use Taskmaster's own commands so task
  files cannot be corrupted.

## Audit log

When enabled (Security & Access), Task Studio appends JSONL entries to
`.taskmaster/task-studio-audit.log` for: settings saved/reset/imported, runner started/stopped,
validations, and maintenance actions. Entries contain event names and non-sensitive detail
strings only - never settings values or secrets. The file self-truncates past 512 KB.

## Troubleshooting

| Problem                               | What to do                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `tm` not found                        | Settings → Taskmaster & Claude Code → set the path and Validate. Or set `TASKMASTER_RUNNER_BIN`.           |
| `claude` not found                    | Same section - set the Claude path and Validate.                                                           |
| Claude not authenticated              | Run `claude` once in a terminal to log in; the failure appears in the run log.                             |
| Invalid project root                  | The path must be absolute, exist, and contain `.taskmaster/tasks/tasks.json`.                              |
| Permission denied validating a binary | The file exists but is not executable (`chmod +x`) or belongs to another user.                             |
| Webhook test fails                    | Check the URL scheme rules above, the endpoint's response code, and the timeout in Settings → Webhooks.    |
| Corrupted settings file               | Automatic: it is backed up as `.corrupt-<timestamp>.bak` and defaults are used. Re-import or re-configure. |
| Stale runner lock                     | Settings → Runner (or Developer) → _Clear stale lock_. Only clears when the lock's process is dead.        |
| Runner rejects every run              | Check: runner enabled (Runner), mode allowed (Security & Access), root allowlisted (General).              |

## Known limitations

- Single workspace and single active project; the Projects section stores multi-project
  configuration ahead of multi-project support.
- Claude behavior options are stored but not yet applied (Taskmaster owns the Claude launch).
- Automatic webhook delivery, auto-run triggers, WIP limits, worktrees, and PR creation are
  placeholders/flags, clearly labeled in the UI.
- Density/sidebar/date-format preferences are persisted but only partially applied to the UI.
