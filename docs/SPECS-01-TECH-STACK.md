# SPECS-01 — Technology Stack
## OpenClaw Dashboard — MVP Build

---

## 1. WHY THIS STACK

OpenClaw's gateway is built in **Node.js** (npm build, CLI tooling, JS config files).
The dashboard backend must be Node-native to:
- Call the OpenClaw CLI via `child_process`
- Subscribe to the OpenClaw WebSocket gateway (`wss://localhost:18789`)
- Share the same ecosystem (npm, .env, PM2)

Everything is designed so **Claude Code can build each module independently**
and assemble them into a working system.

---

## 2. FULL TECHNOLOGY DECISIONS

### 2.1 Backend Runtime

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | **Node.js 20 LTS** | Same as OpenClaw gateway |
| Framework | **Express 4** | Minimal, well-known, easy for Claude Code |
| Language | **JavaScript (CommonJS)** | No transpile step, instant run |

### 2.2 Database

| Decision | Choice | Rationale |
|---|---|---|
| MVP database | **SQLite 3** (via `better-sqlite3`) | Zero setup, single file, no Docker needed |
| Query builder | **Knex.js** | Migration system + PostgreSQL upgrade path |
| Migration path | **PostgreSQL** (Supabase or self-hosted) | When multi-user or cloud is needed |

SQLite file lives at: `~/.openclaw/dashboard.db`
No Docker required for MVP. One command to run.

### 2.3 Real-Time

| Decision | Choice | Rationale |
|---|---|---|
| Frontend ↔ Dashboard | **WebSocket** (`ws` library) | Same protocol OpenClaw uses internally |
| Dashboard ↔ OpenClaw | **WebSocket client** to port 18789 | Subscribe to agent events directly |
| Fallback | **Server-Sent Events (SSE)** | Simpler for log streaming if WS blocked |

### 2.4 Frontend

| Decision | Choice | Rationale |
|---|---|---|
| UI framework | **Vanilla JS + HTML** (the existing `openclaw-os.html`) | Already built, no build pipeline |
| Charts | **Chart.js 4** (CDN) | Already integrated |
| Serving | **Express static** | Single server for API + UI |

No React, no Vite, no bundler for MVP.
The frontend file is already complete — backend drives the data.

### 2.5 OpenClaw Integration Layer

| Integration Point | Method | Details |
|---|---|---|
| Send task to agent | **CLI subprocess** | `openclaw agent --message "..." --model ...` |
| Receive agent events | **WebSocket client** | Connect to `wss://localhost:18789` |
| Hook callbacks | **Express route** | Register `/api/hooks/openclaw` as webhook |
| Read agent config | **File read** | Parse `~/.openclaw/openclaw.json` |
| CRON scheduling | **node-cron** | Mirror OpenClaw CRON syntax |

### 2.6 Process Management

| Environment | Tool |
|---|---|
| Development | `nodemon` — auto-restart on file change |
| Production | `PM2` — daemon, auto-restart, log rotation |

### 2.7 Authentication (MVP)

| Decision | Choice |
|---|---|
| MVP | Single shared API key in `.env` (`DASHBOARD_API_KEY`) |
| Future | OpenClaw's own `OPENCLAW_GATEWAY_TOKEN` for SSO |

---

## 3. DEPENDENCY LIST

### package.json (production)

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^9.4.3",
    "knex": "^3.1.0",
    "ws": "^8.16.0",
    "node-cron": "^3.0.3",
    "dotenv": "^16.4.1",
    "uuid": "^9.0.0",
    "cors": "^2.8.5",
    "morgan": "^1.10.0",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

### What each dependency does

| Package | Role |
|---|---|
| `express` | HTTP server + routing |
| `better-sqlite3` | Synchronous SQLite driver (fast, simple) |
| `knex` | SQL query builder + migrations |
| `ws` | WebSocket server (frontend) + client (OpenClaw gateway) |
| `node-cron` | CRON scheduling for heartbeat checks |
| `dotenv` | Environment variables from `.env` |
| `uuid` | Task ID generation (`OCL-xxx` format) |
| `cors` | Allow dashboard to call API from browser |
| `morgan` | HTTP request logging |
| `helmet` | HTTP security headers |

---

## 4. ENVIRONMENT VARIABLES (`.env`)

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_PATH=~/.openclaw/dashboard.db

# OpenClaw Gateway
OPENCLAW_GATEWAY_URL=wss://localhost:18789
OPENCLAW_GATEWAY_TOKEN=          # from: openclaw gateway status
OPENCLAW_HOOKS_TOKEN=            # from: openclaw config

# Dashboard Auth
DASHBOARD_API_KEY=ocl-dashboard-local-dev

# Agent CLI
OPENCLAW_CLI_PATH=openclaw       # or full path if not in PATH
```

---

## 5. PROJECT FILE STRUCTURE

```
openclaw-dashboard/
│
├── server/
│   ├── index.js                  # Entry point — starts Express + WS
│   │
│   ├── config.js                 # Loads .env, exports constants
│   │
│   ├── db/
│   │   ├── connection.js         # Knex + SQLite connection
│   │   ├── migrations/
│   │   │   ├── 001_tasks.js
│   │   │   ├── 002_agents.js
│   │   │   ├── 003_logs.js
│   │   │   └── 004_wbs.js
│   │   └── seeds/
│   │       └── seed_agents.js    # Pre-populate 8 agents
│   │
│   ├── routes/
│   │   ├── tasks.js              # /api/tasks CRUD
│   │   ├── agents.js             # /api/agents
│   │   ├── logs.js               # /api/logs
│   │   ├── models.js             # /api/models
│   │   ├── dashboard.js          # /api/dashboard/stats
│   │   └── hooks.js              # /api/hooks/openclaw (webhook receiver)
│   │
│   ├── services/
│   │   ├── openclaw-cli.js       # Runs CLI commands via child_process
│   │   ├── gateway-client.js     # WebSocket client → OpenClaw gateway
│   │   ├── orchestrator.js       # Connie routing logic
│   │   └── notifier.js           # Broadcasts events to frontend via WS
│   │
│   └── ws/
│       └── ws-server.js          # WebSocket server for browser clients
│
├── public/
│   └── index.html                # The dashboard UI (openclaw-os.html)
│
├── .env                          # Environment variables
├── .env.example                  # Template
├── package.json
├── knexfile.js                   # Knex migration config
└── README.md
```

---

## 6. PORTS & SERVICES

| Service | Port | Notes |
|---|---|---|
| Dashboard HTTP API | `3000` | REST API + serve `public/` |
| Dashboard WebSocket | `3001` | Browser ↔ Dashboard real-time |
| OpenClaw Gateway | `18789` | Existing — dashboard connects as client |

---

## 7. UPGRADE PATH (Post-MVP)

| Component | MVP | Production |
|---|---|---|
| Database | SQLite (file) | PostgreSQL (Supabase) |
| Frontend | Vanilla JS | React + Vite |
| Auth | API key | OpenClaw gateway token / OAuth |
| Deployment | Local / PM2 | Docker + Fly.io or GCP |
| Real-time | WebSocket | WebSocket + Redis pub/sub |
| Monitoring | Console logs | OpenTelemetry + Grafana |

---

## 8. WHAT CLAUDE CODE NEEDS TO BUILD

Each module can be built independently and plugged together:

| Module | File(s) | Depends on |
|---|---|---|
| **M1** Foundation | `server/index.js`, `config.js`, `package.json` | Nothing |
| **M2** Database | `db/connection.js`, `db/migrations/*` | M1 |
| **M3** Task Engine | `routes/tasks.js`, `services/orchestrator.js` | M2 |
| **M4** Agent Bridge | `services/openclaw-cli.js`, `services/gateway-client.js` | M1 |
| **M5** Real-Time | `ws/ws-server.js`, `services/notifier.js` | M1 |
| **M6** Dashboard API | `routes/dashboard.js`, `routes/agents.js`, `routes/logs.js` | M2, M3 |
| **M7** Frontend Wire | Update `public/index.html` to call real API | M3, M5, M6 |

Build order: M1 → M2 → M3+M4+M5 (parallel) → M6 → M7
