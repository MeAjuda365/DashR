# SPECS-02 — System Architecture & OpenClaw Integration
## OpenClaw Dashboard — MVP Build

---

## 1. SYSTEM OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │              openclaw-os.html  (Dashboard UI)                │  │
│   │   Chart.js | Kanban | Task Form | Agent Cards | Log Stream   │  │
│   └────────────┬────────────────────────────┬────────────────────┘  │
│                │  REST (fetch)              │  WebSocket             │
└────────────────┼────────────────────────────┼───────────────────────┘
                 │                            │
                 ▼                            ▼
┌────────────────────────────────────────────────────────────────────┐
│                    DASHBOARD SERVER  (:3000 / :3001)               │
│                                                                    │
│  ┌─────────────────┐   ┌────────────────┐   ┌──────────────────┐  │
│  │  Express REST   │   │  WS Server     │   │  Orchestrator    │  │
│  │  /api/*         │   │  :3001         │   │  (Connie logic)  │  │
│  └────────┬────────┘   └───────┬────────┘   └────────┬─────────┘  │
│           │                    │                      │            │
│  ┌────────▼────────────────────▼──────────────────────▼─────────┐  │
│  │                      SQLite DB                               │  │
│  │        tasks | agents | logs | wbs_items | models            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  OpenClaw Bridge Layer                       │  │
│  │   openclaw-cli.js  ──►  openclaw agent --message ...        │  │
│  │   gateway-client.js ──► wss://localhost:18789               │  │
│  │   hooks.js          ◄── POST /api/hooks/openclaw            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
           ┌───────────────▼───────────────────┐
           │       OPENCLAW GATEWAY            │
           │         port 18789                │
           │                                   │
           │  ┌─────────┐  ┌─────────────────┐ │
           │  │ Session │  │ Model Router    │ │
           │  │ Manager │  │ Anthropic/OpenAI│ │
           │  └────┬────┘  └────────┬────────┘ │
           │       │                │           │
           │  ┌────▼────────────────▼────────┐  │
           │  │     AGENT RUNTIME POOL       │  │
           │  │  Connie | Apex | Teacher     │  │
           │  │  Rex | Olaf | Devin          │  │
           │  │  Ops | Max                   │  │
           │  └──────────────────────────────┘  │
           └───────────────────────────────────┘
```

---

## 2. DATA FLOW — TASK LIFECYCLE

### 2.1 User Creates a Task

```
Browser UI
    │
    ▼  POST /api/tasks  { title, agent, model, prompt, priority }
Dashboard API
    │
    ▼  INSERT into tasks (status='assigned')
SQLite DB
    │
    ▼  openclaw agent --message "<prompt>" --model <model> --agent <agent>
OpenClaw CLI
    │
    ▼  Routes to agent session
OpenClaw Gateway
    │
    ▼  Agent processes task, emits events via WebSocket
Agent Event Stream
    │
    ▼  gateway-client.js receives event, updates DB
Dashboard Server
    │
    ▼  WebSocket broadcast { event:'task:updated', task }
Browser UI (Kanban + Task List update)
```

### 2.2 Agent Sends Update Back

```
OpenClaw Gateway (event)
    │
    ├── gateway-client.js (WS subscription)
    │       │
    │       ▼  Parse event: { sessionId, agent, tokens, output, status }
    │       │
    │       ▼  UPDATE tasks SET status=..., tokens=... WHERE openclaw_session_id=?
    │       │
    │       ▼  INSERT into logs
    │       │
    │       └─► notifier.broadcast('task:updated', task)
    │
    └── OR via hook POST /api/hooks/openclaw
            │
            └─► same DB update + broadcast path
```

### 2.3 Task Moved to User Column (Input Needed)

```
Agent event: { type: 'waiting', reason: 'User input required' }
    │
    ▼  UPDATE tasks SET status='waiting'
    │
    ▼  notifier.broadcast('task:moved-to-user', { taskId, reason })
    │
    ▼  Browser: Task card moves to "User" column in Kanban
    │
    ▼  Browser: Toast notification "Task OCL-XXX needs your input"
```

---

## 3. INTEGRATION POINTS WITH OPENCLAW

### 3.1 OpenClaw CLI Bridge

File: `server/services/openclaw-cli.js`

The dashboard calls the OpenClaw CLI as a subprocess.

```
openclaw agent --message "<prompt>" --model <model-id>
```

OpenClaw's documented agent invocation:
```bash
openclaw agent --message "hi" --model claude-cli/opus-4.6
openclaw agent --message "hi" --model codex-cli/gpt-5.4
```

**What the bridge does:**
- Wraps `child_process.spawn('openclaw', [...])`
- Captures stdout/stderr as streaming log entries
- Extracts session ID from output to track the task
- Returns session handle for status polling

**Agent model mapping:**
```
Connie   → claude-cli/opus-4.6      (orchestrator needs most capability)
Apex     → claude-cli/opus-4.6      (architecture = complex reasoning)
Teacher  → claude-cli/sonnet-4.6    (learning tasks)
Rex      → claude-cli/sonnet-4.6    (control + review)
Olaf     → claude-cli/sonnet-4.6    (finance analysis)
Devin    → claude-cli/sonnet-4.6    (code generation)
Ops      → claude-cli/haiku-4.5     (operations = fast, high volume)
Max      → claude-cli/sonnet-4.6    (execution)
```

### 3.2 OpenClaw Gateway WebSocket Client

File: `server/services/gateway-client.js`

Dashboard subscribes to OpenClaw's WebSocket gateway at:
```
wss://localhost:18789
```

Authentication header:
```
Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}
```

**Events the dashboard listens for:**

```javascript
// Agent status changed
{ type: 'agent:status', agentId: 'devin', status: 'active'|'idle' }

// Task/session update
{ type: 'session:update', sessionId: '...', tokens: 1234, output: '...' }

// Task completed
{ type: 'session:complete', sessionId: '...', result: '...' }

// Task needs user input
{ type: 'session:waiting', sessionId: '...', reason: '...' }

// Error
{ type: 'session:error', sessionId: '...', error: '...' }
```

**On each event, the bridge:**
1. Looks up the task by `openclaw_session_id`
2. Updates task status/tokens/logs in DB
3. Broadcasts to browser via `notifier.broadcast()`

### 3.3 OpenClaw Hooks (Webhook Receiver)

File: `server/routes/hooks.js`

The dashboard registers itself as a hook receiver in OpenClaw's config.
This is an alternative/complement to the WS gateway client.

**OpenClaw hook config** (`~/.openclaw/openclaw.json`):
```json5
{
  "hooks": {
    "enabled": true,
    "token": "${OPENCLAW_HOOKS_TOKEN}",
    "defaultSessionKey": "hook:ingress",
    "allowRequestSessionKey": false
  }
}
```

Dashboard receives events at:
```
POST http://localhost:3000/api/hooks/openclaw
Authorization: Bearer <OPENCLAW_HOOKS_TOKEN>
```

### 3.4 Reading OpenClaw Config

File: `server/services/openclaw-cli.js`

On startup, the dashboard reads the OpenClaw config to:
- Discover registered agents
- Read model assignments
- Check gateway status

```javascript
const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
```

### 3.5 CRON Heartbeat

File: `server/services/gateway-client.js`

Every 60 seconds:
```javascript
cron.schedule('* * * * *', async () => {
  const status = await execCLI('openclaw gateway status');
  await db('agents').update({ last_seen: new Date() }).where({ online: true });
  notifier.broadcast('agents:heartbeat', agentStatuses);
});
```

---

## 4. AGENT ROUTING LOGIC (Connie Orchestration)

File: `server/services/orchestrator.js`

When a task is created without a specific agent, Connie routes it:

```javascript
function routeTask(task) {
  const { prompt, priority } = task;
  const lower = prompt.toLowerCase();

  if (lower.includes('architect') || lower.includes('design') || lower.includes('system'))
    return 'apex';
  if (lower.includes('code') || lower.includes('implement') || lower.includes('build') || lower.includes('develop'))
    return 'devin';
  if (lower.includes('finance') || lower.includes('cost') || lower.includes('budget') || lower.includes('expense'))
    return 'olaf';
  if (lower.includes('security') || lower.includes('audit') || lower.includes('review') || lower.includes('test'))
    return 'rex';
  if (lower.includes('deploy') || lower.includes('infra') || lower.includes('pipeline') || lower.includes('ci'))
    return 'ops';
  if (lower.includes('learn') || lower.includes('train') || lower.includes('knowledge'))
    return 'teacher';
  if (lower.includes('execute') || lower.includes('run') || lower.includes('perform'))
    return 'max';

  return 'connie'; // default: orchestrator handles it
}
```

---

## 5. REAL-TIME ARCHITECTURE

### WebSocket Server (Browser ↔ Dashboard)

```
Browser opens: ws://localhost:3001

Messages server → client:
  { event: 'task:created',   data: Task }
  { event: 'task:updated',   data: Task }
  { event: 'task:completed', data: Task }
  { event: 'task:blocked',   data: Task }
  { event: 'log:entry',      data: LogEntry }
  { event: 'agent:status',   data: { agentId, status } }
  { event: 'stats:update',   data: DashboardStats }
  { event: 'agents:heartbeat', data: AgentStatus[] }

Messages client → server:
  { action: 'subscribe', channel: 'tasks' }
  { action: 'subscribe', channel: 'logs' }
  { action: 'ping' }
```

### Notifier Service

```javascript
// server/services/notifier.js
class Notifier {
  constructor(wss) { this.wss = wss; }

  broadcast(event, data) {
    const payload = JSON.stringify({ event, data, ts: Date.now() });
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }
}
```

---

## 6. DATABASE ↔ API ↔ FRONTEND DATA FLOW

```
SQLite tables:
  tasks       → GET /api/tasks       → renderTasks() / renderKanban()
  agents      → GET /api/agents      → renderAgentsGrid() / sidebar
  logs        → GET /api/logs        → renderLogs()
  wbs_items   → GET /api/tasks/:id   → openDetail() → WBS list
  models      → GET /api/models      → renderModels()

Stats derived from tasks table:
  COUNT(*) WHERE status='completed'           → success rate
  SUM(tokens)                                → token totals
  GROUP BY agent_id                          → most used agent
  WHERE status IN ('waiting','blocked')      → issues
```

---

## 7. SECURITY CONSIDERATIONS (MVP)

| Threat | Mitigation |
|---|---|
| Unauthorized API access | `DASHBOARD_API_KEY` header check on all `/api/*` routes |
| XSS in task titles | HTML-escape all user content before rendering |
| SSRF via hook endpoint | Validate `Authorization` header with `OPENCLAW_HOOKS_TOKEN` |
| CLI injection | Sanitize all user inputs before passing to `spawn()` — use array args, never string concat |
| Database injection | Use Knex parameterized queries — never raw string SQL |

**CLI safety pattern (CRITICAL):**
```javascript
// SAFE — arguments as array
spawn('openclaw', ['agent', '--message', userInput, '--model', modelId])

// UNSAFE — never do this
exec(`openclaw agent --message ${userInput}`)
```

---

## 8. OPENCLAW CONFIG ADDITIONS REQUIRED

Add to `~/.openclaw/openclaw.json` to enable dashboard integration:

```json5
{
  // Existing config...
  "hooks": {
    "enabled": true,
    "token": "${OPENCLAW_HOOKS_TOKEN}",
    "defaultSessionKey": "hook:dashboard",
    "allowRequestSessionKey": false,
    "allowedSessionKeyPrefixes": ["hook:"],
    "endpoints": [
      {
        "url": "http://localhost:3000/api/hooks/openclaw",
        "events": ["session:update", "session:complete", "session:waiting", "session:error"]
      }
    ]
  }
}
```

After editing config:
```bash
openclaw gateway restart
```
