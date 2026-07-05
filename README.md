# Task Studio

AI task management UI compatible with [Task Master](https://github.com/eyaltoledano/claude-task-master).

## What is this?

A local web interface for visualizing and managing AI-generated development tasks.

- **Built for AI workflows** - Visualize tasks created by LLMs
- **Real-time updates** - Changes to `.taskmaster` files reflect instantly
- **Tagged task organization** - Visual separation of different feature contexts
- **Kanban board view** - Drag and drop tasks between status columns
- **Task dependencies** - See task relationships and subtasks clearly

## Getting Started

### Install Your Project

Run Task Studio:

```bash
npx task-studio@latest
```

Or install it as a dev dependency:

```bash
pnpm add -D task-studio
pnpm task-studio
```

Navigate to [http://localhost:5565](http://localhost:5565)

### CLI Options

```bash
npx task-studio --help            # Show help
npx task-studio -p 3000           # Use custom port (default: 5565)
npx task-studio --ws-port 3001    # Use custom WebSocket port (default: 5566)
npx task-studio --ws-url ws://example.com:8080  # Use external WebSocket URL
npx task-studio -d path/to/.taskmaster  # Custom .taskmaster directory
npx task-studio --no-open         # Don't open browser automatically
```

## How it works

Task UI watches your `.taskmaster/tasks/tasks.json` file and displays:

- AI-generated tasks across different tags
- Current tag context from `.taskmaster/state.json`
- Task status, priority, and dependencies
- Subtask hierarchies
- Real-time updates as you modify task files

## Features

### Task Views

- **List view** - Compact task list with inline status controls
- **Board view** - Kanban-style columns for visual task management
- **Tag filtering** - Switch between different feature contexts
- **Search** - Find tasks by title or description
- **Filters** - By status, priority, assignee, or labels

### Task Details

Click any task to see:

- Full description and implementation details
- Test strategy
- Subtasks and dependencies
- Priority and status
- Quick actions for task management

### Taskmaster Runner

Run Taskmaster + Claude Code straight from the UI — no webhook or external service needed.
From the task detail view you can run the open task (`tm start <id>`), run the next eligible
task, or start a (sandboxed) auto-loop, with live status, run history, and streaming-ish logs.
Logs and run metadata are stored under `.taskmaster/runs/`.

See [docs/taskmaster-runner.md](docs/taskmaster-runner.md) for requirements (Taskmaster CLI +
authenticated Claude Code), the safety model, and known limitations.

### Settings

A Linear-inspired Settings area (`/settings`) with grouped navigation: general preferences,
project roots and allowlists, Taskmaster & Claude Code CLI paths with live validation, runner
policies and retention, workflow/status mapping, labels, prompt templates, notifications,
integrations, outgoing webhooks, import/export, diagnostics, and security policies. Settings
persist to a versioned, validated `.taskmaster/task-studio-settings.json` (machine-local,
git-ignored). See [docs/settings.md](docs/settings.md).

### Real-time Sync

The UI uses WebSocket and file watchers to detect changes to:

- `.taskmaster/tasks/tasks.json` - Task data
- `.taskmaster/state.json` - Current tag context
- `.taskmaster/config.json` - Configuration
- `.taskmaster/reports/**/*.json` - Analysis reports

## Development

### Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/), [Tanstack Query](https://tanstack.com/query/latest)
- **Icons**: [Lucide](https://lucide.dev/)

### Development Commands

```bash
pnpm dev          # Start development server (port 5565) + WebSocket (port 5566)
pnpm build        # Build for production
pnpm start        # Start production server
pnpm lint         # Run ESLint
pnpm typecheck    # Run TypeScript type checking
pnpm test         # Run unit tests (vitest)
```

## Roadmap

- [ ] Write operations
- [ ] Bulk operations

## Contributing

Contributions welcome! This is an early project focused on making AI tasks more visual and accessible.

## Credits

- [Circle](https://github.com/ln-dev7/circle) - The beautiful UI template this project is based on
- [Task Master](https://github.com/eyaltoledano/claude-task-master) - The JSON schema standard for task management

## License

MIT
