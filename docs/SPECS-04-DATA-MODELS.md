# SPECS-04 — Data Models & Database Schemas
## OpenClaw Dashboard — MVP Build

Database: **SQLite 3** via `better-sqlite3` + **Knex.js** migrations
File path: `~/.openclaw/dashboard.db`
All IDs: string (UUID v4 or custom format like `OCL-001`)
All dates: stored as ISO 8601 strings in SQLite TEXT columns

---

## 1. ENTITY RELATIONSHIP DIAGRAM

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   agents    │       │    tasks    │       │    logs     │
│─────────────│       │─────────────│       │─────────────│
│ id (PK)     │◄──────│ agent_id   │       │ id (PK)     │
│ name        │       │ id (PK)    │◄──────│ task_id     │
│ role        │       │ title      │       │ agent_id    │
│ color       │       │ prompt     │       │ level       │
│ status      │       │ owner      │       │ message     │
│ model_def.. │       │ status     │       │ created_at  │
│ created_at  │       │ priority   │       └─────────────┘
└─────────────┘       │ model_id   │
                      │ tokens_used│       ┌─────────────┐
┌─────────────┐       │ cost_usd   │       │  wbs_items  │
│   models    │       │ session_id │       │─────────────│
│─────────────│       │ created_at │◄──────│ task_id     │
│ id (PK)     │◄──────│ model_id   │       │ id (PK)     │
│ name        │       │ updated_at │       │ text        │
│ provider    │       │ deleted_at │       │ done        │
│ is_selected │       └─────────────┘       │ agent_id    │
│ ...         │                             │ sort_order  │
└─────────────┘                             └─────────────┘
```

---

## 2. TABLE DEFINITIONS

### 2.1 `agents` table

Seeded at startup — these are the 8 fixed agents. Not created by users.

```sql
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,    -- 'connie', 'apex', 'teacher', etc.
  name            TEXT NOT NULL,       -- 'Connie', 'Apex', etc.
  role            TEXT NOT NULL,       -- 'Orchestrator', 'Architecture', etc.
  color           TEXT NOT NULL,       -- '#f97316' (hex)
  status          TEXT NOT NULL DEFAULT 'idle',  -- 'active' | 'idle' | 'offline'
  model_default   TEXT NOT NULL,       -- FK → models.id
  description     TEXT,                -- Agent purpose description
  tasks_total     INTEGER DEFAULT 0,   -- Denormalized counter (updated on task change)
  tokens_total    INTEGER DEFAULT 0,   -- Denormalized total tokens
  cost_total_usd  REAL    DEFAULT 0.0, -- Denormalized total cost
  last_seen       TEXT,                -- ISO timestamp of last activity
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Seed data:**
```javascript
const AGENT_SEEDS = [
  { id: 'connie',  name: 'Connie',  role: 'Orchestrator', color: '#f97316', model_default: 'claude-opus-4-6' },
  { id: 'apex',    name: 'Apex',    role: 'Architecture', color: '#3b82f6', model_default: 'claude-opus-4-6' },
  { id: 'teacher', name: 'Teacher', role: 'Learning',     color: '#a855f7', model_default: 'claude-sonnet-4-6' },
  { id: 'rex',     name: 'Rex',     role: 'Control',      color: '#ef4444', model_default: 'claude-sonnet-4-6' },
  { id: 'olaf',    name: 'Olaf',    role: 'Finance',      color: '#22c55e', model_default: 'claude-sonnet-4-6' },
  { id: 'devin',   name: 'Devin',   role: 'Development',  color: '#06b6d4', model_default: 'claude-sonnet-4-6' },
  { id: 'ops',     name: 'Ops',     role: 'Operations',   color: '#f59e0b', model_default: 'claude-haiku-4-5' },
  { id: 'max',     name: 'Max',     role: 'Execution',    color: '#ec4899', model_default: 'claude-sonnet-4-6' },
];
```

---

### 2.2 `tasks` table

Core entity. One row per task.

```sql
CREATE TABLE tasks (
  id                    TEXT PRIMARY KEY,  -- 'OCL-001', 'OCL-002', ...
  title                 TEXT NOT NULL,
  prompt                TEXT NOT NULL,
  agent_id              TEXT NOT NULL REFERENCES agents(id),
  owner                 TEXT NOT NULL DEFAULT 'User',
  status                TEXT NOT NULL DEFAULT 'created',
  -- status: 'created'|'assigned'|'in-progress'|'waiting'|'completed'|'blocked'
  priority              TEXT NOT NULL DEFAULT 'medium',
  -- priority: 'critical'|'high'|'medium'|'low'
  model_id              TEXT NOT NULL REFERENCES models(id),
  tokens_used           INTEGER DEFAULT 0,
  cost_usd              REAL    DEFAULT 0.0,
  openclaw_session_id   TEXT,             -- Session ID from OpenClaw gateway
  block_reason          TEXT,             -- Filled when status='blocked'
  deleted_at            TEXT,             -- Soft delete timestamp
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_agent_id  ON tasks(agent_id);
CREATE INDEX idx_tasks_status    ON tasks(status);
CREATE INDEX idx_tasks_created   ON tasks(created_at DESC);
CREATE INDEX idx_tasks_session   ON tasks(openclaw_session_id);
```

**ID Generation logic:**
```javascript
// server/services/task-id.js
async function nextTaskId(db) {
  const last = await db('tasks')
    .orderBy('created_at', 'desc')
    .first('id');
  if (!last) return 'OCL-001';
  const num = parseInt(last.id.replace('OCL-', ''), 10);
  return `OCL-${String(num + 1).padStart(3, '0')}`;
}
```

---

### 2.3 `wbs_items` table

Work Breakdown Structure — subtasks within a task.

```sql
CREATE TABLE wbs_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,       -- Subtask description
  done        INTEGER NOT NULL DEFAULT 0,  -- Boolean: 0 | 1
  agent_id    TEXT REFERENCES agents(id),  -- Who does this subtask
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wbs_task_id ON wbs_items(task_id);
```

**Auto-generated WBS on task creation:**
```javascript
function generateDefaultWBS(taskId, agentId) {
  return [
    { task_id: taskId, text: 'Task intake & analysis',  agent_id: 'connie', sort_order: 1 },
    { task_id: taskId, text: 'Execution',               agent_id: agentId,  sort_order: 2 },
    { task_id: taskId, text: 'Quality review',          agent_id: 'rex',    sort_order: 3 },
    { task_id: taskId, text: 'Delivery & documentation',agent_id: 'connie', sort_order: 4 },
  ];
}
```

---

### 2.4 `logs` table

System-wide log stream. Both task-scoped and global entries.

```sql
CREATE TABLE logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level       TEXT NOT NULL DEFAULT 'info',
  -- level: 'info'|'warn'|'error'|'ok'
  agent_id    TEXT REFERENCES agents(id),
  task_id     TEXT REFERENCES tasks(id),
  message     TEXT NOT NULL,
  metadata    TEXT,  -- JSON string for extra data
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_logs_created   ON logs(created_at DESC);
CREATE INDEX idx_logs_task_id   ON logs(task_id);
CREATE INDEX idx_logs_agent_id  ON logs(agent_id);
CREATE INDEX idx_logs_level     ON logs(level);
```

**Kept to last 5,000 rows** — auto-pruned by a scheduled job:
```javascript
cron.schedule('0 * * * *', () => {
  db.raw(`
    DELETE FROM logs WHERE id NOT IN (
      SELECT id FROM logs ORDER BY created_at DESC LIMIT 5000
    )
  `);
});
```

---

### 2.5 `models` table

Seeded at startup. User can set `is_selected` to change default.

```sql
CREATE TABLE models (
  id                         TEXT PRIMARY KEY,
  -- e.g. 'claude-opus-4-6', 'gpt-4o'
  name                       TEXT NOT NULL,
  provider                   TEXT NOT NULL,
  -- 'Anthropic' | 'OpenAI' | 'Google' | 'Ollama'
  description                TEXT,
  context_window             TEXT,           -- '200K', '128K', '1M'
  cost_per_million_tokens    REAL,
  speed_tokens_per_sec       INTEGER,
  openclaw_model_id          TEXT NOT NULL,
  -- e.g. 'anthropic/claude-opus-4-6' — used in CLI calls
  is_selected                INTEGER DEFAULT 0,  -- Boolean: 0|1
  created_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Seed data:**
```javascript
const MODEL_SEEDS = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'Anthropic',
    description: 'Most capable model for complex reasoning and orchestration.',
    context_window: '200K',
    cost_per_million_tokens: 15.00,
    speed_tokens_per_sec: 50,
    openclaw_model_id: 'anthropic/claude-opus-4-6',
    is_selected: 1
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    description: 'Balanced performance. Ideal for most agent tasks.',
    context_window: '200K',
    cost_per_million_tokens: 3.00,
    speed_tokens_per_sec: 120,
    openclaw_model_id: 'anthropic/claude-sonnet-4-6',
    is_selected: 0
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description: 'Fastest model for simple tasks and high-volume operations.',
    context_window: '200K',
    cost_per_million_tokens: 0.25,
    speed_tokens_per_sec: 300,
    openclaw_model_id: 'anthropic/claude-haiku-4-5-20251001',
    is_selected: 0
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description: 'OpenAI flagship. Strong at code generation.',
    context_window: '128K',
    cost_per_million_tokens: 5.00,
    speed_tokens_per_sec: 80,
    openclaw_model_id: 'openai/gpt-4o',
    is_selected: 0
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    provider: 'OpenAI',
    description: 'Optimized reasoning for math and logic.',
    context_window: '128K',
    cost_per_million_tokens: 1.10,
    speed_tokens_per_sec: 60,
    openclaw_model_id: 'openai/o3-mini',
    is_selected: 0
  },
  {
    id: 'gemini-2-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    description: 'Multimodal with 1M context. Great for documents.',
    context_window: '1M',
    cost_per_million_tokens: 0.10,
    speed_tokens_per_sec: 200,
    openclaw_model_id: 'google/gemini-2.0-flash',
    is_selected: 0
  },
];
```

---

## 3. KNEX MIGRATION FILES

### Migration 001 — Tasks

```javascript
// db/migrations/001_create_tasks.js
exports.up = function(knex) {
  return knex.schema.createTable('tasks', (t) => {
    t.string('id').primary();
    t.string('title').notNullable();
    t.text('prompt').notNullable();
    t.string('agent_id').notNullable().references('id').inTable('agents');
    t.string('owner').notNullable().defaultTo('User');
    t.string('status').notNullable().defaultTo('created');
    t.string('priority').notNullable().defaultTo('medium');
    t.string('model_id').notNullable().references('id').inTable('models');
    t.integer('tokens_used').defaultTo(0);
    t.float('cost_usd').defaultTo(0.0);
    t.string('openclaw_session_id');
    t.text('block_reason');
    t.timestamp('deleted_at');
    t.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('tasks');
};
```

### Migration 002 — WBS Items

```javascript
// db/migrations/002_create_wbs_items.js
exports.up = function(knex) {
  return knex.schema.createTable('wbs_items', (t) => {
    t.increments('id').primary();
    t.string('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.text('text').notNullable();
    t.boolean('done').notNullable().defaultTo(false);
    t.string('agent_id').references('id').inTable('agents');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('wbs_items');
};
```

### Migration 003 — Logs

```javascript
// db/migrations/003_create_logs.js
exports.up = function(knex) {
  return knex.schema.createTable('logs', (t) => {
    t.increments('id').primary();
    t.string('level').notNullable().defaultTo('info');
    t.string('agent_id').references('id').inTable('agents');
    t.string('task_id').references('id').inTable('tasks');
    t.text('message').notNullable();
    t.text('metadata');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('logs');
};
```

---

## 4. JAVASCRIPT MODEL SHAPES (for API layer)

These are the TypeScript-like shapes used in route handlers.
Even though we're writing plain JS, Claude Code should follow these shapes exactly.

### Task (full)
```javascript
/**
 * @typedef {Object} Task
 * @property {string}  id                    - 'OCL-001'
 * @property {string}  title
 * @property {string}  prompt
 * @property {string}  agent_id              - FK to agents
 * @property {Object}  agent                 - Joined agent object
 * @property {string}  owner
 * @property {string}  status                - 'created'|'assigned'|'in-progress'|'waiting'|'completed'|'blocked'
 * @property {string}  priority              - 'critical'|'high'|'medium'|'low'
 * @property {string}  model_id              - FK to models
 * @property {number}  tokens_used
 * @property {number}  cost_usd
 * @property {string}  openclaw_session_id
 * @property {string}  block_reason
 * @property {Array}   wbs                   - WBS items (included in GET /tasks/:id)
 * @property {Array}   logs                  - Recent logs (included in GET /tasks/:id)
 * @property {string}  created_at
 * @property {string}  updated_at
 */
```

### Agent (full)
```javascript
/**
 * @typedef {Object} Agent
 * @property {string}  id                    - 'connie'
 * @property {string}  name
 * @property {string}  role
 * @property {string}  color                 - Hex color
 * @property {string}  status                - 'active'|'idle'|'offline'
 * @property {string}  model_default
 * @property {number}  tasks_total
 * @property {number}  tasks_completed
 * @property {number}  tasks_active
 * @property {number}  success_rate          - percentage 0-100
 * @property {number}  tokens_total
 * @property {number}  cost_total_usd
 * @property {string}  last_seen
 */
```

### LogEntry
```javascript
/**
 * @typedef {Object} LogEntry
 * @property {number}  id
 * @property {string}  level                 - 'info'|'warn'|'error'|'ok'
 * @property {string}  agent_id
 * @property {string}  task_id
 * @property {string}  message
 * @property {string}  created_at
 */
```

### WBSItem
```javascript
/**
 * @typedef {Object} WBSItem
 * @property {number}  id
 * @property {string}  task_id
 * @property {string}  text
 * @property {boolean} done
 * @property {string}  agent_id
 * @property {number}  sort_order
 */
```

---

## 5. KNEX QUERY PATTERNS (for Claude Code)

Claude Code must use Knex — not raw SQL strings.

```javascript
// Import
const db = require('../db/connection');

// Select all tasks (not deleted)
const tasks = await db('tasks')
  .whereNull('deleted_at')
  .orderBy('created_at', 'desc');

// Select task with agent join
const task = await db('tasks')
  .join('agents', 'tasks.agent_id', 'agents.id')
  .select('tasks.*', 'agents.name as agent_name', 'agents.color as agent_color')
  .where('tasks.id', taskId)
  .whereNull('tasks.deleted_at')
  .first();

// Insert task
const [taskId] = await db('tasks').insert({
  id: newId,
  title,
  prompt,
  agent_id: agentId,
  model_id: modelId,
  owner,
  priority,
  status: 'assigned'
});

// Update task status
await db('tasks')
  .where({ id: taskId })
  .update({ status: newStatus, updated_at: new Date().toISOString() });

// Aggregate stats
const stats = await db('tasks')
  .select('agent_id')
  .count('* as task_count')
  .sum('tokens_used as total_tokens')
  .whereNull('deleted_at')
  .groupBy('agent_id');

// Insert log
await db('logs').insert({
  level,
  agent_id: agentId,
  task_id: taskId,
  message
});
```

---

## 6. COMPUTED FIELDS (not stored, derived in queries)

```javascript
// Agent success rate — computed from tasks table
async function getAgentSuccessRate(agentId) {
  const { total, completed } = await db('tasks')
    .where({ agent_id: agentId })
    .whereNull('deleted_at')
    .select(
      db.raw('COUNT(*) as total'),
      db.raw(`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed`)
    )
    .first();
  return total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
}

// Tokens by provider — derived from tasks + models join
async function getTokensByProvider() {
  return db('tasks')
    .join('models', 'tasks.model_id', 'models.id')
    .select('models.provider')
    .sum('tasks.tokens_used as tokens')
    .whereNull('tasks.deleted_at')
    .groupBy('models.provider');
}

// Issues = tasks with status 'waiting' or 'blocked'
async function getIssues() {
  return db('tasks')
    .whereIn('status', ['waiting', 'blocked'])
    .whereNull('deleted_at')
    .orderBy('updated_at', 'desc')
    .limit(10);
}
```
