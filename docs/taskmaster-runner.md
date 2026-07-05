# Taskmaster Runner

Task Studio can trigger Taskmaster (and, through it, Claude Code) directly from the UI. The
runner spawns the Taskmaster CLI as a local child process, streams its output to a log file,
and shows live status and logs in the task detail view — no webhook or external SaaS involved.

## What it does

```
Task Studio UI
  → "Run with Claude" on a task
  → POST /api/runner/run-task
  → server validates taskId + project root
  → creates a run record (.taskmaster/runs/<runId>.json)
  → spawns `tm start <taskId>` (spawn, shell: false)
  → stdout/stderr → .taskmaster/runs/<runId>.log
  → UI polls /api/runner/status and /api/runner/logs
  → on exit, the run is marked completed / failed / cancelled
```

## Requirements

- **Taskmaster CLI** installed — the `tm` command must work in a terminal.
  If it lives somewhere unusual, set its path in **Settings → Taskmaster & Claude Code**
  (or set `TASKMASTER_RUNNER_BIN=/path/to/tm`, which takes precedence).
- **Claude Code** installed and authenticated (Taskmaster launches it; if it is not
  authenticated the failure shows up in the run log).
- The project has `.taskmaster/tasks/tasks.json` (i.e. it is an initialized Taskmaster project).

## Using the UI

Open any task — the **Taskmaster Runner** panel appears under the task description:

| Button             | What it runs                  | Notes                                                           |
| ------------------ | ----------------------------- | --------------------------------------------------------------- |
| Run with Claude    | `tm start <taskId>`           | Runs the open task.                                             |
| Run Next           | `tm start <nextId>`           | Task Studio resolves the next eligible task itself (see below). |
| Start Loop         | `tm loop --verbose`           | Runs available tasks until Taskmaster stops.                    |
| Start Sandbox Loop | `tm loop --sandbox --verbose` | Same, inside Taskmaster's Docker sandbox.                       |
| Stop Run           | SIGTERM → SIGKILL after 5s    | Marks the run `cancelled`.                                      |

While a run is active the panel shows a **running** badge, run metadata (run ID, mode, task,
timestamps, exit code) and a log viewer that refreshes every ~1.5s. A pulsing blue dot appears
next to the running task in the list and board views. Runs and logs from previous sessions are
kept and the latest one is shown when the runner is idle.

### "Run Next" behavior

The Taskmaster CLI does not expose a non-interactive "start the next task" command, so the
runner computes the next eligible task itself: the lowest-ID `pending` task in the current tag
whose dependencies are all done, and then runs a single bounded `tm start <id>`. This is
deliberately not `tm loop` — it starts exactly one task. If Taskmaster's own "next" logic ever
diverges from this (e.g. priority-based ordering), the CLI remains the source of truth for
`loop` mode; `Run Next` may pick a different task than `tm next` would in edge cases.

## Where things are stored

Everything lives under the project's `.taskmaster` directory (git-ignored):

- `.taskmaster/runs/<runId>.log` — full stdout/stderr of the run
- `.taskmaster/runs/<runId>.json` — run metadata (mode, task, status, timestamps, exit code)
- `.taskmaster/runner.lock` — present while a run is active; used to detect concurrent or
  stale runners

Run IDs look like `2026-07-05T10-30-00-abc123`.

## Safety model

The runner is **not** a command executor. The browser can never influence what gets executed
beyond choosing one of four predefined modes:

- **Fixed command allowlist.** Only `run-task`, `run-next`, `loop`, `loop-sandbox` exist. The
  argv for each mode is constructed server-side in one place
  (`lib/runner/runner-validation.ts#buildRunnerCommand`); no client string is ever passed as an
  argument except the task ID, which must match `^\d+(\.\d+)*$`.
- **No shell.** Processes are started with `spawn(..., { shell: false })`, so there is no shell
  to inject into even if validation were bypassed.
- **Single allowlisted project root.** The server only ever runs inside the project root it was
  configured with at startup (`TASKMASTER_DIR` / `USER_CWD` / cwd). A client-supplied
  `projectRoot` is only compared against that root and rejected otherwise — it is never used to
  build a path.
- **Path-traversal-safe log access.** Run IDs are charset-validated and resolved paths must stay
  inside `.taskmaster/runs/`.
- **One run per project.** An in-memory registry plus `.taskmaster/runner.lock` prevent
  concurrent runs. A lock whose process is dead is reported as _stale_ and cleared automatically
  on the next start; a lock with a live pid (e.g. a runner from another Task Studio instance)
  blocks new runs.
- **Crash recovery.** If the server restarts while a run is active, orphaned `running` metadata
  is reconciled to `failed` the next time status is read.

## Error surfaces

| Situation                        | What you see                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `tm` not installed / not on PATH | Toast + run error: "Taskmaster CLI ('tm') was not found on PATH…"             |
| Claude Code not authenticated    | The Taskmaster/Claude error output appears in the run log; run ends `failed`. |
| Run already active               | Toast: "Another run is already active for this project." (HTTP 409)           |
| Foreign runner holds the lock    | Amber warning in the panel with the pid; start buttons disabled.              |
| Invalid task ID / project root   | HTTP 400 with a specific message.                                             |
| Process exits non-zero           | Run marked `failed` with the exit code.                                       |
| Stop clicked                     | Run marked `cancelled` once the process exits.                                |

## Known limitations

- One active run per project root; there is no queue yet (starting while busy returns 409).
- Logs are polled (~1.5s), not streamed; each poll returns at most the last 256 KB of the log.
- `Run Next` uses Task Studio's own next-task resolution (see above), which may differ from
  `tm next` in priority-based edge cases.
- Loop runs continue until Taskmaster exits on its own or you press Stop.
- Stopping kills the `tm` process group; work Claude Code had in flight is interrupted.

## Settings integration

The runner is configured through the Settings area (see [settings.md](settings.md)):

- `tm` path: `TASKMASTER_RUNNER_BIN` env → per-project override → Settings → `tm`
- Enable/disable, default mode, retention, and stop grace timeout: Settings → Runner
- Allowed modes and env-var policy: Settings → Security & Access
- Project root allowlist and confirmation prompts: Settings → General
- Dependency policy (block/warn/ignore for unfinished dependencies): Settings → Workflow
- Log tail size and polling intervals: Settings → Preferences
- Custom environment variables (Claude env + per-project env; `PATH`-like keys always blocked)

## Future improvements

The service module is structured so these can be added without reshaping the API:

- Durable run queue (replace the in-memory single-slot registry in
  `lib/runner/taskmaster-runner.ts`)
- Streaming logs via SSE/WebSocket (the existing ws server in `scripts/ws.ts` is a natural home)
- Git worktree per task and PR creation after completion
- Webhook endpoints (GitHub/Linear) that enqueue runs
- Multi-agent runners and per-task sandbox policies
- Configurable `tm` path per project (today: `TASKMASTER_RUNNER_BIN` env var)

## Manual test checklist

1. In a Taskmaster project, run Task Studio (`pnpm dev` in this repo, or `npx task-studio`).
2. Open a pending task → the Taskmaster Runner panel is visible with an _Idle_ badge.
3. Click **Run with Claude** → badge switches to _Running_, log lines start appearing.
4. Check `.taskmaster/runs/` → a `<runId>.log` and `<runId>.json` exist; `runner.lock` exists.
5. Click **Run with Claude** again while running → error toast "Another run is already active".
6. Click **Stop Run** → run ends as _Cancelled_; `runner.lock` is gone.
7. Let a run finish naturally → badge shows _Completed_ (exit 0) or _Failed_ (non-zero),
   metadata has `finishedAt` and `exitCode`.
8. Rename `tm` temporarily → starting a run shows the "Taskmaster CLI not found" error.
