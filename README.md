<div align="center">
  <img src="docs/assets/dashr-banner.svg" alt="DashR" width="600" />
  <h1>DashR</h1>
  <p><strong>The orchestration control plane for OpenClaw agents.</strong></p>
  <p>Plug in. Deploy. Watch your agents work.</p>

  <p>
    <a href="#quickstart"><img src="https://img.shields.io/badge/quickstart-5%20min-orange?style=flat-square" /></a>
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
    <img src="https://img.shields.io/badge/node-%3E%3D20-blue?style=flat-square" />
    <img src="https://img.shields.io/badge/openclaw-compatible-f97316?style=flat-square" />
    <img src="https://img.shields.io/badge/status-MVP-yellow?style=flat-square" />
  </p>
</div>

---

> **DashR** is a task management and orchestration dashboard that plugs directly into any OpenClaw environment. Create tasks, assign them to agents, track execution in real time via Kanban, monitor token usage, and get full observability over your AI workforce — all in a single self-hosted web app.

---

## What DashR does

```
User creates task → Connie routes it → Agents execute → You watch it happen live
```

- **Task Kanban** — 9 columns (User + 8 agents), tasks move automatically as agents work
- **Live Dashboard** — 6 widgets: activities, success rate, tokens by provider, agent usage, issues, log stream
- **WBS Engine** — every task auto-generates a Work Breakdown Structure
- **Agent Registry** — monitor all 8 agents: status, success rate, token spend, cost
- **Model Management** — switch between Claude, GPT-4o, Gemini per task
- **Full Logs** — filterable by agent, level, and time
- **Real-time WebSocket** — all tabs stay in sync, no refresh needed
- **OpenClaw-native** — hooks directly into your OpenClaw gateway

---

## Quickstart

### Option A — Docker (recommended, 1 command)

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/dashr/main/scripts/install.sh | bash
```

Then open: **http://localhost:3000**

### Option B — Manual

```bash
git clone https://github.com/YOUR_ORG/dashr.git
cd dashr
cp .env.example .env        # edit with your OpenClaw gateway token
npm install
npm run db:migrate
npm run db:seed
npm start
```

### Option C — Docker Compose

```bash
git clone https://github.com/YOUR_ORG/dashr.git
cd dashr
cp .env.example .env
docker compose up -d
```

---

## Configuration

Edit `.env` before starting:

```env
# Required
OPENCLAW_GATEWAY_URL=wss://localhost:18789    # Your OpenClaw gateway
OPENCLAW_GATEWAY_TOKEN=                       # openclaw gateway status → copy token

# Optional
PORT=3000
DASHBOARD_API_KEY=your-secret-key            # Protects the API
DB_PATH=./data/dashboard.db                  # SQLite file location
```

Find your gateway token:
```bash
openclaw gateway status
```

---

## Architecture

```
Browser (DashR UI)
    ↕ REST + WebSocket
DashR Server (:3000)
    ↕ CLI subprocess + WebSocket client
OpenClaw Gateway (:18789)
    ↕ Agent sessions
Your Agents (Connie, Apex, Teacher, Rex, Olaf, Devin, Ops, Max)
```

Full architecture: [docs/architecture.md](docs/architecture.md)

---

## Agent Roster

DashR ships pre-configured for these 8 OpenClaw agents:

| Agent | Role | Default Model |
|---|---|---|
| **Connie** | Orchestrator — routes all tasks | Claude Opus 4.6 |
| **Apex** | Architecture & system design | Claude Opus 4.6 |
| **Teacher** | Learning & knowledge management | Claude Sonnet 4.6 |
| **Rex** | Control, security & review | Claude Sonnet 4.6 |
| **Olaf** | Finance & cost analysis | Claude Sonnet 4.6 |
| **Devin** | Development & code generation | Claude Sonnet 4.6 |
| **Ops** | Operations & infrastructure | Claude Haiku 4.5 |
| **Max** | Execution & delivery | Claude Sonnet 4.6 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20 + Express 4 |
| Database | SQLite 3 (zero config) → PostgreSQL upgrade path |
| Real-time | WebSocket (`ws` library) |
| Frontend | Vanilla JS + Chart.js (no build step) |
| OpenClaw | CLI subprocess + gateway WebSocket client |
| Deployment | Docker / PM2 / bare Node |

---

## Project Structure

```
dashr/
├── server/
│   ├── index.js              # Entry point
│   ├── config.js             # Environment config
│   ├── db/                   # Knex migrations + seeds
│   ├── routes/               # REST API routes
│   ├── services/             # OpenClaw bridge, orchestrator, notifier
│   └── ws/                   # WebSocket server
├── public/
│   └── index.html            # Dashboard UI
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── docs/                     # Full documentation
├── scripts/
│   └── install.sh            # One-line installer
└── .env.example
```

---

## Documentation

| Doc | Description |
|---|---|
| [Introduction](docs/introduction.md) | What is DashR and why |
| [Quickstart](docs/quickstart.md) | Up and running in 5 minutes |
| [Agents](docs/concepts/agents.md) | Agent roster, roles, routing |
| [Tasks & WBS](docs/concepts/tasks.md) | Task lifecycle and work breakdown |
| [Kanban](docs/concepts/kanban.md) | Board columns and task flow |
| [API Overview](docs/api/overview.md) | REST API reference |
| [Webhooks](docs/api/webhooks.md) | OpenClaw hook integration |
| [Deployment](docs/deployment/docker.md) | Docker, PM2, cloud |

---

## Deploying to Production

### Fly.io
```bash
fly launch --name dashr
fly secrets set OPENCLAW_GATEWAY_TOKEN=your_token
fly deploy
```

### Docker
```bash
docker compose up -d
```

### PM2
```bash
npm install -g pm2
pm2 start server/index.js --name dashr
pm2 save && pm2 startup
```

---

## Plug DashR into any OpenClaw

DashR is designed to work with **any** OpenClaw deployment. Add to `~/.openclaw/openclaw.json`:

```json5
{
  "hooks": {
    "enabled": true,
    "token": "${OPENCLAW_HOOKS_TOKEN}",
    "endpoints": [
      {
        "url": "http://localhost:3000/api/hooks/openclaw",
        "events": ["session:update", "session:complete", "session:waiting", "session:error"]
      }
    ]
  }
}
```

Then restart: `openclaw gateway restart`

---

## Contributing

DashR is MIT licensed. PRs welcome.

```bash
git clone https://github.com/YOUR_ORG/dashr.git
cd dashr && npm install
npm run dev     # starts with nodemon + live reload
```

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  <sub>Built for <a href="https://openclaw.ai">OpenClaw</a> · Inspired by <a href="https://paperclip.ing">Paperclip</a></sub>
</div>
