# mcp-md-tasks

> An MCP server for managing task cards as local Markdown files — no database, no cloud, just files.

![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-compatible-blueviolet?style=flat)
![Markdown](https://img.shields.io/badge/Storage-Markdown-lightgrey?style=flat)

Cards are stored as `.md` files organized in status folders inside a `.tasks/` directory in your project. Everything is human-readable and version-control-friendly.

---

## Features

- **File-based storage** — cards live as `.md` files, readable and editable by humans
- **5 status lanes** — `todo`, `in-progress`, `review`, `done`, `archived`
- **Auto-incremented IDs** — configurable prefix (e.g. `TASK-001`, `FEAT-042`)
- **Full markdown** — descriptions and comments support markdown
- **Zero dependencies** beyond the MCP SDK and Zod
- **Works per-project** — `.tasks/` is created automatically inside the project where the agent runs

---

## Requirements

- [Bun](https://bun.sh) >= 1.0
- An MCP-compatible client (e.g. [Claude Code](https://claude.ai/code))

---

## Installation

```bash
git clone https://github.com/your-user/mcp-md-tasks.git
cd mcp-md-tasks
bun install
```

---

## Integration with Claude Code

Add the server to your project's `.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "md-tasks": {
      "command": "/home/your-user/.bun/bin/bun",
      "args": ["run", "/absolute/path/to/mcp-md-tasks/src/index.ts"]
    }
  }
}
```

> **Tip:** Find your Bun path with `~/.bun/bin/bun --version` or check the output of `which bun`.

### TASKS_ROOT (optional)

By default the server creates `.tasks/` in the working directory of the agent's project (`process.cwd()`). If you need to point to a different location, set the `TASKS_ROOT` env var to the full path of the desired `.tasks/` directory:

```json
{
  "mcpServers": {
    "md-tasks": {
      "command": "/home/your-user/.bun/bin/bun",
      "args": ["run", "/absolute/path/to/mcp-md-tasks/src/index.ts"],
      "env": {
        "TASKS_ROOT": "/absolute/path/to/your/project/.tasks"
      }
    }
  }
}
```

---

## Directory structure

The first time a tool is called, the server bootstraps the following layout automatically:

```
your-project/
└── .tasks/
    ├── config.yaml       # ID prefix and counter
    ├── todo/
    │   └── TASK-001.md
    ├── in-progress/
    │   └── TASK-002.md
    ├── review/
    ├── done/
    └── archived/
```

---

## Card format

Each card is a Markdown file with a YAML frontmatter block, a free-form description, and an optional comments section:

```markdown
---
id: TASK-001
title: Implement login flow
status: in-progress
due_date: 2026-03-15
created_at: 2026-03-01T10:00:00.000Z
updated_at: 2026-03-01T14:22:00.000Z
---

Users should be able to log in with email + password.
Redirect to dashboard on success, show inline errors on failure.

## Comments

### 2026-03-01 12:00:00
Started working on the auth middleware.

### 2026-03-01 14:22:00
JWT integration done, still need to wire up the frontend form.
```

### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | auto | Unique identifier, e.g. `TASK-001` |
| `title` | yes | Short card title |
| `status` | auto | Current lane (`todo`, `in-progress`, `review`, `done`, `archived`) |
| `due_date` | no | Due date in `YYYY-MM-DD` format |
| `created_at` | auto | ISO timestamp set on creation |
| `updated_at` | auto | ISO timestamp updated on every write |

---

## Configuration (`config.yaml`)

```yaml
id_prefix: TASK
id_counter: 5
```

| Field | Default | Description |
|-------|---------|-------------|
| `id_prefix` | `TASK` | Prefix for auto-generated IDs |
| `id_counter` | `1` | Next number to use (increments on each `create_card`) |

Edit this file to change the prefix or reset/continue the counter.

---

## Available tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `create_card` | `title`\*, `description`?, `due_date`? | Creates a new card in `todo/` |
| `list_cards` | `status`? | Lists all cards, or filtered by status |
| `get_card` | `id`\* | Returns the full card content |
| `update_card` | `id`\*, `title`?, `description`?, `due_date`? | Updates one or more fields in-place |
| `move_card` | `id`\*, `status`\* | Moves a card to a different status folder |
| `add_comment` | `id`\*, `text`\* | Appends a timestamped comment to the card |
| `delete_card` | `id`\* | Archives the card (moves to `archived/`, no permanent deletion) |
| `search_cards` | `query`\* | Case-insensitive search across title and description |

`*` required &nbsp; `?` optional

### Status values

`todo` · `in-progress` · `review` · `done` · `archived`

---

## Typical workflow

```
create_card → [todo]
   ↓ move_card
[in-progress]
   ↓ move_card
[review]
   ↓ move_card
[done]

at any point → delete_card → [archived]
```

An agent can use `add_comment` to log progress notes at any stage, and `search_cards` to locate cards across all statuses.

---

## Development

```bash
# Run with auto-reload
bun run dev

# Run once
bun run start
```

Server logs go to **stderr** only. Stdout is reserved for the MCP JSON-RPC transport.
