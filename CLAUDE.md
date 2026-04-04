# DashR — Claude Code Project Context

DashR is a self-hosted orchestration dashboard for OpenClaw agents.
This file gives Claude Code full context so every session starts informed.

## What we're building
A Node.js + Express API server with SQLite database and WebSocket real-time layer.
The frontend is plain HTML/JS (no build step) served from `public/`.

## Key facts
- **Port:** 3000 (HTTP + WebSocket on same port)
- **Database:** SQLite via `better-sqlite3` + Knex migrations
- **OpenClaw gateway:** `wss://localhost:18789`
- **OpenClaw CLI:** `openclaw agent --message "<prompt>" --model <model-id>`
- **Auth:** `X-API-Key` header on all `/api/*` routes

## Folder structure
```
server/
  index.js          ← Express entry point (M1)
  config.js         ← env loader (M1)
  db/
    connection.js   ← Knex singleton (M2)
    migrations/     ← 5 migration files (M2)
    seeds/          ← seed data for agents + models (M2)
  routes/
    tasks.js        ← Task CRUD + orchestrator (M3)
    hooks.js        ← OpenClaw webhook receiver (M4)
    logs.js         ← Log query routes (M6)
    models.js       ← Model registry routes (M6)
    dashboard.js    ← Stats aggregation (M6)
  services/
    orchestrator.js ← Connie routing logic (M3)
    wbsGenerator.js ← Auto WBS from task title (M3)
    openclawBridge.js ← CLI subprocess + gateway WS (M4)
    wsServer.js     ← WebSocket broadcaster (M5)
    notifier.js     ← Singleton notifier (M5)
  middleware/
    auth.js         ← API key validation (M3)
public/
  index.html        ← Full dashboard UI (M7 wires this up)
```

## Build order
Run SPECS-05-MODULE-BUILDS.md prompts in this order:
1. M1 — Foundation
2. M2 — Database
3. M3 + M4 + M5 in parallel
4. M6 — Stats routes
5. M7 — Frontend wire-up

## Agents
| Name | Role | Model |
|------|------|-------|
| Connie | Orchestrator (routes tasks) | claude-opus-4-6 |
| Apex | Lead engineer | claude-opus-4-6 |
| Teacher | Docs & onboarding | claude-sonnet-4-6 |
| Rex | QA & testing | claude-sonnet-4-6 |
| Olaf | Frontend | claude-sonnet-4-6 |
| Devin | Backend | claude-sonnet-4-6 |
| Ops | DevOps | claude-haiku-4-5-20251001 |
| Max | Data & analytics | claude-sonnet-4-6 |

## Task lifecycle
`created → assigned → in-progress → waiting/blocked → completed`

## API response envelope
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "...", "code": "ERROR_CODE" }
```

## Security rules
- Always spawn CLI with array args — never interpolate user input into shell strings
- Use Knex parameterized queries — never raw string SQL with user data
- Validate all request bodies with explicit field checks before DB writes

## Spec files (read these before building any module)
- `docs/SPECS-01-TECH-STACK.md` — dependencies + env vars
- `docs/SPECS-02-ARCHITECTURE.md` — system diagram + data flow
- `docs/SPECS-03-API-CONTRACTS.md` — all endpoints + WS events
- `docs/SPECS-04-DATA-MODELS.md` — DB schema + migrations
- `docs/SPECS-05-MODULE-BUILDS.md` — 7 Claude Code build prompts
