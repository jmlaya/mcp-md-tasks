#!/usr/bin/env bun
import { mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
// ─── A: Imports & Constants ──────────────────────────────────────────────────
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const TASKS_DIR = process.env.TASKS_ROOT ?? join(process.cwd(), '.tasks');
const CONFIG_PATH = join(TASKS_DIR, 'config.yaml');

const STATUS_FOLDERS = ['todo', 'in-progress', 'review', 'done', 'archived'] as const;
type Status = (typeof STATUS_FOLDERS)[number];

const server = new McpServer({ name: 'md-tasks', version: '1.0.0' });

// ─── B: Interfaces ───────────────────────────────────────────────────────────
interface Comment {
  timestamp: string;
  text: string;
}

interface Card {
  id: string;
  title: string;
  status: Status;
  due_date?: string;
  created_at: string;
  updated_at: string;
  description: string;
  comments: Comment[];
}

interface Config {
  id_prefix: string;
  id_counter: number;
}

// ─── C: Config (manual key:value parse — no YAML library needed) ─────────────
function parseConfig(text: string): Config {
  const map: Record<string, string> = {};
  for (const line of text.trim().split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return {
    id_prefix: map['id_prefix'] ?? 'TASK',
    id_counter: parseInt(map['id_counter'] ?? '1', 10),
  };
}

function serializeConfig(config: Config): string {
  return `id_prefix: ${config.id_prefix}\nid_counter: ${config.id_counter}\n`;
}

async function readConfig(): Promise<Config> {
  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) return { id_prefix: 'TASK', id_counter: 1 };
  return parseConfig(await file.text());
}

async function writeConfig(config: Config): Promise<void> {
  await Bun.write(CONFIG_PATH, serializeConfig(config));
}

// ─── D: Filesystem Initialization ────────────────────────────────────────────
async function ensureTasksDir(): Promise<void> {
  await mkdir(TASKS_DIR, { recursive: true });
  for (const s of STATUS_FOLDERS) {
    await mkdir(join(TASKS_DIR, s), { recursive: true });
  }
  if (!(await Bun.file(CONFIG_PATH).exists())) {
    await writeConfig({ id_prefix: 'TASK', id_counter: 1 });
  }
}

// ─── E: ID Generation ────────────────────────────────────────────────────────
async function nextId(): Promise<string> {
  const config = await readConfig();
  const id = `${config.id_prefix}-${String(config.id_counter).padStart(3, '0')}`;
  await writeConfig({ ...config, id_counter: config.id_counter + 1 });
  return id;
}

// ─── F: Card Parse & Serialize ───────────────────────────────────────────────
function parseFrontmatter(text: string): Omit<Card, 'description' | 'comments'> {
  const map: Record<string, string> = {};
  for (const line of text.trim().split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    // Use everything after first colon (handles ISO timestamps containing colons)
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return {
    id: map['id'] ?? '',
    title: map['title'] ?? '',
    status: (map['status'] as Status) ?? 'todo',
    due_date: map['due_date'] || undefined,
    created_at: map['created_at'] ?? new Date().toISOString(),
    updated_at: map['updated_at'] ?? new Date().toISOString(),
  };
}

function parseCard(id: string, text: string): Card {
  // Split on "---" delimiter lines. Expected layout:
  //   parts[0]: "" (empty string before opening ---)
  //   parts[1]: frontmatter block
  //   parts[2+]: body (description + optional comments section)
  const parts = text.split(/^---$/m);
  const frontmatter = parseFrontmatter(parts[1] ?? '');
  const body = parts.slice(2).join('---').trim();

  // Split body at the "## Comments" section header
  const commentSectionMarker = '\n## Comments';
  const commentIdx = body.indexOf(commentSectionMarker);

  let description: string;
  let commentsRaw: string;

  if (commentIdx === -1) {
    description = body;
    commentsRaw = '';
  } else {
    description = body.slice(0, commentIdx).trim();
    commentsRaw = body.slice(commentIdx + commentSectionMarker.length).trim();
  }

  // Each comment starts with "### TIMESTAMP\n"
  const comments: Comment[] = [];
  const chunks = commentsRaw.split(/^### /m).filter(Boolean);
  for (const chunk of chunks) {
    const newlineIdx = chunk.indexOf('\n');
    if (newlineIdx === -1) continue;
    const timestamp = chunk.slice(0, newlineIdx).trim();
    const commentText = chunk.slice(newlineIdx + 1).trim();
    if (timestamp && commentText) {
      comments.push({ timestamp, text: commentText });
    }
  }

  return { ...frontmatter, description, comments };
}

function serializeCard(card: Card): string {
  const fmLines = [
    `id: ${card.id}`,
    `title: ${card.title}`,
    `status: ${card.status}`,
    ...(card.due_date ? [`due_date: ${card.due_date}`] : []),
    `created_at: ${card.created_at}`,
    `updated_at: ${card.updated_at}`,
  ];

  let content = `---\n${fmLines.join('\n')}\n---\n\n${card.description}`;

  if (card.comments.length > 0) {
    const commentBlocks = card.comments.map((c) => `### ${c.timestamp}\n${c.text}`);
    content += `\n\n## Comments\n\n${commentBlocks.join('\n\n')}`;
  }

  return content + '\n';
}

async function findCard(id: string): Promise<{ card: Card; filePath: string }> {
  for (const status of STATUS_FOLDERS) {
    const filePath = join(TASKS_DIR, status, `${id}.md`);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return { card: parseCard(id, await file.text()), filePath };
    }
  }
  throw new Error(`Card not found: ${id}`);
}

// ─── G: CRUD Helpers ─────────────────────────────────────────────────────────
async function writeCard(card: Card): Promise<void> {
  await Bun.write(join(TASKS_DIR, card.status, `${card.id}.md`), serializeCard(card));
}

async function listCardsInStatus(status: Status): Promise<Card[]> {
  const dir = join(TASKS_DIR, status);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const cards: Card[] = [];
  for (const filename of files) {
    if (!filename.endsWith('.md')) continue;
    const id = filename.slice(0, -3);
    const text = await Bun.file(join(dir, filename)).text();
    cards.push(parseCard(id, text));
  }
  return cards.sort((a, b) => a.id.localeCompare(b.id));
}

async function listAllCards(): Promise<Card[]> {
  const all: Card[] = [];
  for (const status of STATUS_FOLDERS) {
    all.push(...(await listCardsInStatus(status)));
  }
  return all;
}

// ─── H: MCP Tool Registrations ───────────────────────────────────────────────

server.registerTool(
  'create_card',
  {
    description: 'Create a new task card in the todo folder',
    inputSchema: {
      title: z.string().describe('Card title (required)'),
      description: z.string().optional().describe('Card body/description in markdown'),
      due_date: z.string().optional().describe('Due date in ISO format YYYY-MM-DD'),
    },
  },
  async ({ title, description, due_date }) => {
    await ensureTasksDir();
    const id = await nextId();
    const now = new Date().toISOString();
    const card: Card = {
      id,
      title,
      status: 'todo',
      due_date,
      created_at: now,
      updated_at: now,
      description: description ?? '',
      comments: [],
    };
    await writeCard(card);
    return { content: [{ type: 'text', text: `Created card ${id}: ${title}` }] };
  },
);

server.registerTool(
  'list_cards',
  {
    description: 'List task cards, optionally filtered by status',
    inputSchema: {
      status: z.enum(STATUS_FOLDERS).optional().describe('Filter by status. Omit to list all cards'),
    },
  },
  async ({ status }) => {
    await ensureTasksDir();
    const cards = status ? await listCardsInStatus(status) : await listAllCards();

    if (cards.length === 0) {
      return { content: [{ type: 'text', text: 'No cards found' }] };
    }

    const lines = cards.map((c) => {
      const due = c.due_date ? ` [due: ${c.due_date}]` : '';
      return `- ${c.id} [${c.status}]${due}: ${c.title}`;
    });
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.registerTool(
  'get_card',
  {
    description: 'Get the full content of a task card by ID',
    inputSchema: {
      id: z.string().describe('Card ID, e.g. TASK-001'),
    },
  },
  async ({ id }) => {
    await ensureTasksDir();
    const { card } = await findCard(id);
    return { content: [{ type: 'text', text: serializeCard(card) }] };
  },
);

server.registerTool(
  'update_card',
  {
    description: 'Update fields on an existing task card',
    inputSchema: {
      id: z.string().describe('Card ID'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description (replaces existing)'),
      due_date: z.string().optional().describe('New due date YYYY-MM-DD, or empty string to clear'),
    },
  },
  async ({ id, title, description, due_date }) => {
    await ensureTasksDir();
    const { card, filePath } = await findCard(id);
    const updated: Card = {
      ...card,
      title: title ?? card.title,
      description: description ?? card.description,
      // Empty string clears due_date; undefined means no change
      due_date: due_date === '' ? undefined : (due_date ?? card.due_date),
      updated_at: new Date().toISOString(),
    };
    await Bun.write(filePath, serializeCard(updated));
    return { content: [{ type: 'text', text: `Updated card ${id}` }] };
  },
);

server.registerTool(
  'move_card',
  {
    description: 'Move a task card to a different status folder',
    inputSchema: {
      id: z.string().describe('Card ID'),
      status: z.enum(STATUS_FOLDERS).describe('Target status'),
    },
  },
  async ({ id, status }) => {
    await ensureTasksDir();
    const { card, filePath } = await findCard(id);
    if (card.status === status) {
      return {
        content: [{ type: 'text', text: `Card ${id} is already in ${status}` }],
      };
    }
    const updatedCard: Card = {
      ...card,
      status,
      updated_at: new Date().toISOString(),
    };
    const newFilePath = join(TASKS_DIR, status, `${id}.md`);
    // Write new file first, then delete old — data is never lost
    await Bun.write(newFilePath, serializeCard(updatedCard));
    await unlink(filePath);
    return { content: [{ type: 'text', text: `Moved card ${id} to ${status}` }] };
  },
);

server.registerTool(
  'add_comment',
  {
    description: 'Append a comment to an existing task card',
    inputSchema: {
      id: z.string().describe('Card ID'),
      text: z.string().describe('Comment text (markdown supported)'),
    },
  },
  async ({ id, text }) => {
    await ensureTasksDir();
    const { card, filePath } = await findCard(id);
    const now = new Date();
    // Format as "YYYY-MM-DD HH:MM:SS" for human readability
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    const updatedCard: Card = {
      ...card,
      comments: [...card.comments, { timestamp, text }],
      updated_at: now.toISOString(),
    };
    await Bun.write(filePath, serializeCard(updatedCard));
    return { content: [{ type: 'text', text: `Comment added to card ${id}` }] };
  },
);

server.registerTool(
  'delete_card',
  {
    description: 'Archive a task card (moves to archived/, does not permanently delete)',
    inputSchema: {
      id: z.string().describe('Card ID to archive'),
    },
  },
  async ({ id }) => {
    await ensureTasksDir();
    const { card, filePath } = await findCard(id);
    if (card.status === 'archived') {
      return {
        content: [{ type: 'text', text: `Card ${id} is already archived` }],
      };
    }
    const archivedCard: Card = {
      ...card,
      status: 'archived',
      updated_at: new Date().toISOString(),
    };
    const newPath = join(TASKS_DIR, 'archived', `${id}.md`);
    await Bun.write(newPath, serializeCard(archivedCard));
    await unlink(filePath);
    return { content: [{ type: 'text', text: `Card ${id} moved to archived` }] };
  },
);

server.registerTool(
  'search_cards',
  {
    description: 'Search cards by matching a query string against title and description',
    inputSchema: {
      query: z.string().describe('Search query (case-insensitive substring match)'),
    },
  },
  async ({ query }) => {
    await ensureTasksDir();
    const all = await listAllCards();
    const q = query.toLowerCase();
    const matches = all.filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
    if (matches.length === 0) {
      return {
        content: [{ type: 'text', text: `No cards matching "${query}"` }],
      };
    }
    const lines = matches.map((c) => `- ${c.id} [${c.status}]: ${c.title}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ─── I: Startup ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await ensureTasksDir();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('md-tasks MCP server running on stdio');
  console.error(`Tasks directory: ${TASKS_DIR}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
