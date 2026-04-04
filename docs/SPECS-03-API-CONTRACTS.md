# SPECS-03 — API Contracts
## OpenClaw Dashboard — MVP Build

All endpoints prefixed: `http://localhost:3000`
All `/api/*` routes require header: `X-API-Key: <DASHBOARD_API_KEY>`
All responses: `Content-Type: application/json`
All timestamps: ISO 8601 string

---

## GLOBAL RESPONSE ENVELOPE

**Success:**
```json
{
  "ok": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "ok": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

**Paginated list:**
```json
{
  "ok": true,
  "data": [ ... ],
  "meta": {
    "total": 148,
    "page": 1,
    "per_page": 25
  }
}
```

---

## 1. TASKS

### GET /api/tasks
List all tasks.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter: `created`, `assigned`, `in-progress`, `waiting`, `completed`, `blocked` |
| `agent` | string | Filter by agent ID: `connie`, `apex`, `devin`, etc. |
| `priority` | string | Filter: `critical`, `high`, `medium`, `low` |
| `q` | string | Search in title + prompt |
| `page` | int | Default: 1 |
| `per_page` | int | Default: 25, max: 100 |
| `sort` | string | `created_at`, `updated_at`, `tokens` — default: `created_at` |
| `order` | string | `asc`, `desc` — default: `desc` |

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "OCL-001",
      "title": "Design multi-tenant auth system",
      "prompt": "Design a complete authentication system...",
      "agent_id": "apex",
      "owner": "User",
      "status": "completed",
      "priority": "high",
      "model_id": "claude-opus-4-6",
      "tokens_used": 48200,
      "cost_usd": 0.72,
      "openclaw_session_id": "sess_abc123",
      "created_at": "2026-04-01T10:00:00Z",
      "updated_at": "2026-04-01T10:18:00Z"
    }
  ],
  "meta": { "total": 8, "page": 1, "per_page": 25 }
}
```

---

### POST /api/tasks
Create a new task.

**Request body:**
```json
{
  "title": "Build payment gateway integration",
  "prompt": "Integrate Stripe payment gateway with our existing Node.js backend...",
  "agent_id": "devin",
  "model_id": "claude-sonnet-4-6",
  "priority": "high",
  "owner": "User"
}
```

**Validation:**
- `title`: required, string, max 200 chars
- `prompt`: required, string, max 10000 chars
- `agent_id`: required, must be one of the 8 registered agents
- `model_id`: required, must be a registered model
- `priority`: optional, default `medium`
- `owner`: optional, default `User`

**On success:**
1. Inserts task into DB with `status='assigned'`
2. Generates WBS (3 default subtasks)
3. Calls `openclaw-cli.js` to invoke the agent
4. Stores returned `openclaw_session_id`
5. Inserts first log entry
6. Broadcasts `task:created` via WebSocket

**Response 201:**
```json
{
  "ok": true,
  "data": {
    "id": "OCL-009",
    "title": "Build payment gateway integration",
    "status": "assigned",
    "agent_id": "devin",
    "openclaw_session_id": "sess_xyz789",
    "created_at": "2026-04-03T11:00:00Z"
  }
}
```

**Error 400:** Invalid input
**Error 503:** OpenClaw gateway unreachable

---

### GET /api/tasks/:id
Get a single task with full detail.

**Path param:** `id` — Task ID, e.g. `OCL-001`

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "id": "OCL-001",
    "title": "Design multi-tenant auth system",
    "prompt": "Design a complete authentication system...",
    "agent_id": "apex",
    "agent": {
      "id": "apex",
      "name": "Apex",
      "role": "Architecture",
      "color": "#3b82f6"
    },
    "owner": "User",
    "status": "completed",
    "priority": "high",
    "model_id": "claude-opus-4-6",
    "tokens_used": 48200,
    "cost_usd": 0.72,
    "openclaw_session_id": "sess_abc123",
    "wbs": [
      { "id": 1, "text": "Requirements analysis", "done": true, "agent_id": "apex", "order": 1 },
      { "id": 2, "text": "Architecture design",   "done": true, "agent_id": "apex", "order": 2 },
      { "id": 3, "text": "Security review",        "done": true, "agent_id": "rex",  "order": 3 }
    ],
    "logs": [
      { "id": 1, "level": "info", "agent_id": "connie", "message": "Task routed to Apex", "created_at": "2026-04-01T10:00:00Z" },
      { "id": 2, "level": "ok",   "agent_id": "apex",   "message": "Architecture draft complete", "created_at": "2026-04-01T10:05:00Z" }
    ],
    "created_at": "2026-04-01T10:00:00Z",
    "updated_at": "2026-04-01T10:18:00Z"
  }
}
```

**Error 404:** Task not found

---

### PATCH /api/tasks/:id
Update task fields.

**Request body (all optional):**
```json
{
  "title": "Updated title",
  "status": "in-progress",
  "agent_id": "rex",
  "priority": "critical",
  "tokens_used": 52000,
  "cost_usd": 0.78
}
```

**Rules:**
- `status` transitions allowed: see Task Lifecycle section below
- On `status` change → inserts log entry + broadcasts `task:updated`
- If `status='waiting'` or `status='blocked'` → also broadcasts `task:moved-to-user`

**Response 200:** Updated task object

---

### DELETE /api/tasks/:id
Delete a task (soft delete — sets `deleted_at`).

**Response 200:**
```json
{ "ok": true, "data": { "deleted": true } }
```

---

### POST /api/tasks/:id/advance
Advance task to next status in lifecycle.

Lifecycle: `created → assigned → in-progress → waiting → completed`

**Response 200:** Updated task object
**Error 400:** `{ "error": "Task already completed", "code": "TASK_FINAL_STATE" }`

---

### POST /api/tasks/:id/block
Block a task and move it to the User column.

**Request body:**
```json
{ "reason": "Staging credentials required" }
```

**Response 200:** Updated task object

---

### POST /api/tasks/:id/complete
Mark task as completed.

**Response 200:** Updated task object

---

### GET /api/tasks/:id/logs
Get logs for a specific task.

**Response 200:**
```json
{
  "ok": true,
  "data": [
    { "id": 1, "level": "info", "agent_id": "connie", "message": "...", "created_at": "..." }
  ]
}
```

---

### GET /api/tasks/:id/wbs
Get WBS items for a task.

**Response 200:**
```json
{
  "ok": true,
  "data": [
    { "id": 1, "text": "Requirements analysis", "done": true, "agent_id": "apex", "order": 1 }
  ]
}
```

---

### PATCH /api/tasks/:id/wbs/:wbs_id
Update a WBS item (mark done/undone).

**Request body:**
```json
{ "done": true }
```

**Response 200:** Updated WBS item

---

## 2. AGENTS

### GET /api/agents
List all registered agents with stats.

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "connie",
      "name": "Connie",
      "role": "Orchestrator",
      "color": "#f97316",
      "status": "active",
      "model_default": "claude-opus-4-6",
      "tasks_total": 42,
      "tasks_completed": 40,
      "tasks_active": 2,
      "success_rate": 96.2,
      "tokens_total": 820000,
      "cost_total_usd": 41.00,
      "last_seen": "2026-04-03T12:41:03Z"
    }
  ]
}
```

---

### GET /api/agents/:id
Get single agent detail.

**Response 200:** Agent object + last 5 tasks + performance chart data

---

### GET /api/agents/:id/tasks
Get tasks assigned to a specific agent.

**Query params:** Same as `GET /api/tasks` (status, page, per_page)

---

### POST /api/agents/:id/invoke
Directly invoke an agent with a message (without creating a full task).

**Request body:**
```json
{
  "message": "What is the current status of all active tasks?",
  "model_id": "claude-sonnet-4-6"
}
```

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "session_id": "sess_invoke_123",
    "agent_id": "connie",
    "status": "running"
  }
}
```

---

## 3. DASHBOARD STATS

### GET /api/dashboard/stats
Aggregate stats for the 6 dashboard widgets.

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "activities": {
      "total": 148,
      "this_week": 12,
      "daily": [18, 24, 31, 19, 28, 14, 14]
    },
    "success_rate": {
      "percent": 94.2,
      "total": 148,
      "succeeded": 139,
      "warned": 6,
      "failed": 3,
      "delta_vs_last_period": 2.1
    },
    "tokens_by_provider": [
      { "provider": "Anthropic", "tokens": 1630000, "color": "#f97316" },
      { "provider": "OpenAI",    "tokens": 528000,  "color": "#3b82f6" },
      { "provider": "Google",    "tokens": 240000,  "color": "#22c55e" }
    ],
    "most_used_agents": [
      { "agent_id": "connie", "name": "Connie", "color": "#f97316", "tasks": 42 },
      { "agent_id": "devin",  "name": "Devin",  "color": "#06b6d4", "tasks": 38 }
    ],
    "issues": [
      { "task_id": "OCL-006", "title": "Pen test blocked — credentials needed", "type": "blocked" },
      { "task_id": "OCL-004", "title": "KB training waiting on doc upload",     "type": "waiting" }
    ],
    "recent_logs": [
      { "time": "12:41:03", "level": "ok", "agent_id": "connie", "message": "OCL-001 routing complete" }
    ]
  }
}
```

---

## 4. LOGS

### GET /api/logs
Get system logs with filtering.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `level` | string | `info`, `warn`, `error`, `ok` |
| `agent_id` | string | Filter by agent |
| `task_id` | string | Filter by task |
| `from` | ISO date | Start datetime |
| `to` | ISO date | End datetime |
| `page` | int | Default: 1 |
| `per_page` | int | Default: 50 |

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": 1001,
      "level": "ok",
      "agent_id": "connie",
      "task_id": "OCL-001",
      "message": "Task routing complete → Apex",
      "created_at": "2026-04-03T12:41:03Z"
    }
  ],
  "meta": { "total": 1420, "page": 1, "per_page": 50 }
}
```

---

### POST /api/logs
Write a log entry (used internally and by OpenClaw hooks).

**Request body:**
```json
{
  "level": "info",
  "agent_id": "devin",
  "task_id": "OCL-003",
  "message": "WebSocket server initialized"
}
```

**Response 201:** Created log entry

---

### DELETE /api/logs
Clear all logs (or filter).

**Query params:**
- `before` — ISO date — only delete logs before this date
- `agent_id` — only delete logs for this agent

**Response 200:**
```json
{ "ok": true, "data": { "deleted_count": 420 } }
```

---

## 5. MODELS

### GET /api/models
List all configured models.

**Response 200:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "claude-opus-4-6",
      "name": "Claude Opus 4.6",
      "provider": "Anthropic",
      "description": "Most capable model for complex reasoning.",
      "context_window": "200K",
      "cost_per_million_tokens": 15.00,
      "speed_tokens_per_sec": 50,
      "is_selected": true,
      "openclaw_model_id": "anthropic/claude-opus-4-6"
    }
  ]
}
```

---

### PATCH /api/models/:id/select
Set a model as the default for new tasks.

**Response 200:** Updated model object

---

## 6. WEBHOOKS / HOOKS

### POST /api/hooks/openclaw
Receives events from the OpenClaw gateway hook system.

**Authentication:** `Authorization: Bearer <OPENCLAW_HOOKS_TOKEN>`

**Request body (example — session update):**
```json
{
  "type": "session:update",
  "sessionId": "sess_abc123",
  "agentId": "apex",
  "tokens": 1240,
  "output": "Architecture draft ready...",
  "timestamp": "2026-04-03T12:41:03Z"
}
```

**Request body (example — session complete):**
```json
{
  "type": "session:complete",
  "sessionId": "sess_abc123",
  "agentId": "apex",
  "tokens": 48200,
  "result": "Final architecture document delivered.",
  "timestamp": "2026-04-03T12:41:03Z"
}
```

**Request body (example — session waiting):**
```json
{
  "type": "session:waiting",
  "sessionId": "sess_abc123",
  "agentId": "teacher",
  "reason": "Awaiting document upload from user",
  "timestamp": "2026-04-03T12:41:03Z"
}
```

**Response 200:**
```json
{ "ok": true }
```

**On receipt, the server:**
1. Validates `Authorization` header
2. Finds task by `sessionId` → `openclaw_session_id`
3. Updates task in DB
4. Inserts log entry
5. Broadcasts update via WebSocket

---

## 7. WEBSOCKET API

### Connection
```
ws://localhost:3001
```

**Client → Server messages:**
```json
{ "action": "subscribe", "channel": "tasks" }
{ "action": "subscribe", "channel": "logs" }
{ "action": "subscribe", "channel": "agents" }
{ "action": "ping" }
```

**Server → Client events:**

| Event | Payload |
|---|---|
| `task:created` | Full task object |
| `task:updated` | Full task object |
| `task:completed` | Full task object |
| `task:blocked` | `{ taskId, reason }` |
| `task:moved-to-user` | `{ taskId, reason }` |
| `log:entry` | Log entry object |
| `agent:status` | `{ agentId, status, lastSeen }` |
| `agents:heartbeat` | Array of agent statuses |
| `stats:update` | Full dashboard stats object |
| `pong` | `{ ts: timestamp }` |

**Example broadcast payload:**
```json
{
  "event": "task:updated",
  "data": {
    "id": "OCL-003",
    "status": "completed",
    "tokens_used": 31400
  },
  "ts": 1712145663000
}
```

---

## 8. TASK STATUS LIFECYCLE

```
                    ┌──────────┐
                    │ created  │  ← Initial state
                    └────┬─────┘
                         │ auto (on agent assignment)
                    ┌────▼─────┐
                    │ assigned │  ← Agent notified
                    └────┬─────┘
                         │ agent picks up
                ┌────────▼───────────┐
                │    in-progress     │  ← Agent working
                └──┬─────────────┬───┘
                   │             │
      agent needs  │             │  agent done
      user input   │             │
            ┌──────▼───┐   ┌─────▼──────┐
            │ waiting  │   │ completed  │  ← Final state
            └──┬───────┘   └────────────┘
               │ manual block
         ┌─────▼──────┐
         │  blocked   │  ← Needs intervention
         └─────┬──────┘
               │ user resolves
               └──► in-progress (resume)
```

**Valid transitions (enforced in API):**
```
created → assigned
assigned → in-progress
in-progress → waiting
in-progress → completed
in-progress → blocked
waiting → in-progress
waiting → blocked
blocked → in-progress
* → blocked  (any state can be blocked)
```

---

## 9. ERROR CODES

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_INPUT` | 400 | Request body validation failed |
| `TASK_NOT_FOUND` | 404 | Task ID does not exist |
| `AGENT_NOT_FOUND` | 404 | Agent ID not registered |
| `INVALID_TRANSITION` | 400 | Status change not allowed |
| `TASK_FINAL_STATE` | 400 | Task is already completed |
| `OPENCLAW_UNREACHABLE` | 503 | Cannot connect to OpenClaw gateway |
| `OPENCLAW_CLI_ERROR` | 502 | CLI subprocess failed |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `HOOK_UNAUTHORIZED` | 401 | Invalid hook token |
| `SERVER_ERROR` | 500 | Unexpected internal error |
