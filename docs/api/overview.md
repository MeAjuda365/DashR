# API Overview

The DashR REST API gives you programmatic access to every resource in the dashboard — tasks, agents, logs, models, and more. All endpoints follow consistent conventions for authentication, response shape, pagination, and error handling.

---

## Base URL

```
http://localhost:3000/api
```

All paths in this reference are relative to the base URL. In production deployments, replace `localhost:3000` with your DashR server's host and port.

---

## Authentication

All API requests must include your `DASHBOARD_API_KEY` in the `X-API-Key` header. Requests without a valid key return `401 Unauthorized`.

```bash
curl http://localhost:3000/api/dashboard/stats \
  -H "X-API-Key: your_dashboard_api_key_here"
```

The API key is set in your `.env` file as `DASHBOARD_API_KEY`. There is currently one key per DashR instance. Multi-key support is on the roadmap.

---

## Content-Type

All request bodies must be sent as JSON. All responses are JSON.

```
Content-Type: application/json
```

---

## Response Envelope

Every response from the DashR API is wrapped in a standard envelope.

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
  "error": "Task not found",
  "code": "NOT_FOUND"
}
```

List responses include a `meta` object alongside `data`:

```json
{
  "ok": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 84,
    "total_pages": 5
  }
}
```

---

## Pagination

Endpoints that return collections support `page` and `per_page` query parameters.

| Parameter | Default | Max | Description |
|---|---|---|---|
| `page` | `1` | — | The page number to return |
| `per_page` | `20` | `100` | Number of items per page |

Example:

```bash
curl "http://localhost:3000/api/tasks?page=2&per_page=50" \
  -H "X-API-Key: your_key"
```

---

## Endpoints

### Tasks

| Method | Path | Description |
|---|---|---|
| `GET` | `/tasks` | List all tasks. Supports `?status=`, `?agent_id=`, `?priority=`, `?page=`, `?per_page=` filters. |
| `POST` | `/tasks` | Create a new task. Triggers agent assignment and OpenClaw session creation. |
| `GET` | `/tasks/:id` | Get a single task by ID, including its WBS and latest log entries. |
| `PATCH` | `/tasks/:id` | Update task fields: `title`, `prompt`, `priority`, `agent_id`, `owner`. |
| `DELETE` | `/tasks/:id` | Delete a task and all associated logs and WBS items. Only allowed if status is `created` or `completed`. |
| `POST` | `/tasks/:id/advance` | Advance the task's status to the next state in the lifecycle. |
| `POST` | `/tasks/:id/block` | Set the task to `blocked`. Accepts an optional `{ "reason": "..." }` body. |
| `POST` | `/tasks/:id/complete` | Mark the task as `completed`. Finalizes token and cost totals. |
| `GET` | `/tasks/:id/logs` | Get all log entries for a task, ordered by timestamp ascending. |
| `GET` | `/tasks/:id/wbs` | Get the WBS checklist for a task. |
| `PATCH` | `/tasks/:id/wbs/:wbs_id` | Update a single WBS item. Accepts `{ "status": "done" \| "in-progress" \| "pending", "title": "..." }`. |

### Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/agents` | List all agents with current status, metrics, and model assignment. |
| `GET` | `/agents/:id` | Get a single agent by ID. Includes `tasks_total`, `success_rate`, `tokens_total`, and `cost_total_usd`. |
| `GET` | `/agents/:id/tasks` | List all tasks assigned to an agent. Supports same filters as `GET /tasks`. |
| `POST` | `/agents/:id/invoke` | Directly invoke an agent with a prompt, bypassing the task system. Returns a session ID. Use for one-off queries. |

### Dashboard

| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboard/stats` | Returns aggregate statistics: task counts by status, agent utilization, total tokens, total cost, and active session count. |

### Logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/logs` | List all log entries across all tasks. Supports `?task_id=`, `?agent_id=`, `?level=`, `?page=`, `?per_page=`. |
| `POST` | `/logs` | Write a log entry manually. Accepts `{ "task_id", "agent_id", "level", "content" }`. |
| `DELETE` | `/logs` | Delete log entries. Requires either `?task_id=` or `?before=` (ISO timestamp) to scope the deletion. Bulk delete without scope is not allowed. |

### Models

| Method | Path | Description |
|---|---|---|
| `GET` | `/models` | List all model records, including per-token pricing and which agents are currently using each model. |
| `PATCH` | `/models/:id/select` | Assign a model to an agent. Body: `{ "agent_id": "maxwell" }`. Takes effect on the next task for that agent. |

### Hooks

| Method | Path | Description |
|---|---|---|
| `POST` | `/hooks/openclaw` | Receives lifecycle event payloads from OpenClaw. This endpoint is called by OpenClaw, not by your application. See the [Quickstart](../quickstart.md) for hook configuration. |

---

## Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `NOT_FOUND` | `404` | The requested resource does not exist. |
| `UNAUTHORIZED` | `401` | Missing or invalid `X-API-Key` header. |
| `FORBIDDEN` | `403` | The request is authenticated but not permitted (e.g., deleting an in-progress task). |
| `VALIDATION_ERROR` | `422` | The request body is missing required fields or contains invalid values. The `error` field describes which field failed. |
| `CONFLICT` | `409` | The operation conflicts with the current state (e.g., advancing a task that is already `completed`). |
| `GATEWAY_ERROR` | `502` | DashR could not reach the OpenClaw gateway. Check gateway connectivity and `OPENCLAW_GATEWAY_URL`. |
| `SESSION_ERROR` | `500` | An OpenClaw session failed to open or returned an unexpected error. Check the task logs for detail. |
| `RATE_LIMITED` | `429` | Too many requests. DashR applies a default rate limit of 120 requests per minute per API key. |

---

## WebSocket API

DashR broadcasts real-time events over WebSocket. Connect to:

```
ws://localhost:3000
```

Include your API key as a query parameter on connection:

```
ws://localhost:3000?api_key=your_dashboard_api_key_here
```

### Server-to-Client Events

All events are sent as JSON-encoded strings. Parse with `JSON.parse()`.

| Event | Payload | Description |
|---|---|---|
| `task.created` | `{ task }` | A new task was created. |
| `task.updated` | `{ task }` | A task's fields were updated (status, priority, agent, etc.). |
| `task.deleted` | `{ id }` | A task was deleted. |
| `task.log` | `{ task_id, log }` | A new log entry was appended to a task. |
| `task.wbs_updated` | `{ task_id, wbs_item }` | A WBS item's status or title changed. |
| `agent.status` | `{ agent_id, status }` | An agent's status changed (active / idle / offline). |
| `session.started` | `{ task_id, session_id }` | An OpenClaw session was opened for a task. |
| `session.token` | `{ task_id, delta_tokens, total_tokens }` | Incremental token update from a streaming session. |
| `session.completed` | `{ task_id, tokens_used, cost_usd }` | A session completed successfully. |
| `session.error` | `{ task_id, error }` | A session encountered an error. |
| `stats.updated` | `{ stats }` | Dashboard aggregate stats were recomputed. Fires every 5 seconds. |

### Ping / Pong

DashR sends a `ping` frame every 30 seconds. Clients should respond with a `pong` frame to keep the connection alive. Most WebSocket client libraries handle this automatically.

---

## Example: Complete curl Flow

The following sequence creates a task, retrieves it, and checks its status.

**1. Create a task**

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "X-API-Key: your_dashboard_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Draft onboarding email",
    "prompt": "Write a warm, concise onboarding email for new users of a B2B SaaS product. The email should introduce the product, highlight 3 key features, and include a clear call to action to schedule a demo.",
    "agent_id": "leo",
    "priority": "medium",
    "owner": "tomas"
  }'
```

Response:

```json
{
  "ok": true,
  "data": {
    "id": "a3f1c2d4-7b8e-4e9a-bc01-2f3d4e5f6a7b",
    "title": "Draft onboarding email",
    "status": "assigned",
    "agent_id": "leo",
    "priority": "medium",
    "tokens_used": 0,
    "cost_usd": 0,
    "openclaw_session_id": null,
    "created_at": "2026-04-03T14:22:01.000Z"
  }
}
```

**2. Get the task by ID**

```bash
curl http://localhost:3000/api/tasks/a3f1c2d4-7b8e-4e9a-bc01-2f3d4e5f6a7b \
  -H "X-API-Key: your_dashboard_api_key_here"
```

**3. Check task status after a moment**

```bash
curl http://localhost:3000/api/tasks/a3f1c2d4-7b8e-4e9a-bc01-2f3d4e5f6a7b \
  -H "X-API-Key: your_dashboard_api_key_here"
```

Response once the session is running:

```json
{
  "ok": true,
  "data": {
    "id": "a3f1c2d4-7b8e-4e9a-bc01-2f3d4e5f6a7b",
    "title": "Draft onboarding email",
    "status": "in-progress",
    "agent_id": "leo",
    "priority": "medium",
    "tokens_used": 412,
    "cost_usd": 0.000124,
    "openclaw_session_id": "oclaw_sess_7x9k2m",
    "wbs": [
      { "id": "wbs_01", "title": "Define email structure and tone", "status": "done" },
      { "id": "wbs_02", "title": "Write introduction paragraph", "status": "in-progress" },
      { "id": "wbs_03", "title": "List and describe 3 key features", "status": "pending" },
      { "id": "wbs_04", "title": "Write CTA and closing", "status": "pending" }
    ]
  }
}
```

**4. Check logs**

```bash
curl http://localhost:3000/api/tasks/a3f1c2d4-7b8e-4e9a-bc01-2f3d4e5f6a7b/logs \
  -H "X-API-Key: your_dashboard_api_key_here"
```
