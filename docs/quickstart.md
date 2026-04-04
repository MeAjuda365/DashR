# Quickstart

Get DashR running and connected to OpenClaw in under five minutes.

---

## Prerequisites

Before starting, make sure you have the following:

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20 or higher | Check with `node --version` |
| npm | 9 or higher | Bundled with Node.js 20+ |
| OpenClaw | Latest | Must be installed and running |
| OpenClaw Gateway | Active | Run `openclaw gateway status` to verify |

---

## Step 1: Clone and Install

Clone the DashR repository and install dependencies.

```bash
git clone https://github.com/openclaw/dashr.git
cd dashr
npm install
```

---

## Step 2: Configure Environment Variables

Copy the example environment file and open it for editing.

```bash
cp .env.example .env
```

The three critical variables you must set before DashR will start:

```env
# The WebSocket/HTTP base URL of your running OpenClaw gateway
OPENCLAW_GATEWAY_URL=http://localhost:4000

# The authentication token for the OpenClaw gateway
OPENCLAW_GATEWAY_TOKEN=your_gateway_token_here

# The API key DashR uses to authenticate incoming requests to its own REST API
DASHBOARD_API_KEY=your_dashboard_api_key_here
```

`DASHBOARD_API_KEY` can be any strong random string. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 3: Get Your Gateway Token

DashR needs your OpenClaw gateway token to authenticate against the OpenClaw API. Retrieve it by running:

```bash
openclaw gateway status
```

The output will include a `token` field. Copy it into `OPENCLAW_GATEWAY_TOKEN` in your `.env` file.

If the gateway is not running, start it first:

```bash
openclaw gateway start
```

Then run `openclaw gateway status` again.

---

## Step 4: Run Migrations

Initialize the DashR database and seed it with the default agents and models.

```bash
npm run db:migrate && npm run db:seed
```

This creates a local SQLite database at `./data/dashr.db` and populates it with the 8 built-in DashR agents, their default model mappings, and base configuration.

---

## Step 5: Start DashR

**Production mode:**

```bash
npm start
```

**Development mode** (with hot reload and verbose logging):

```bash
npm run dev
```

DashR will print a confirmation when it successfully connects to the OpenClaw gateway:

```
[DashR] Server running on http://localhost:3000
[DashR] Connected to OpenClaw gateway at ws://localhost:4000
[DashR] Listening for OpenClaw hook events
```

---

## Step 6: Open the Dashboard

Navigate to the DashR dashboard in your browser:

```
http://localhost:3000
```

You will be prompted for your `DASHBOARD_API_KEY` on first load. Enter the value you set in `.env`. DashR stores this in `localStorage` and will not ask again until you clear it.

The main view opens on the Kanban board. All columns will be empty until you create your first task.

---

## Step 7: Create Your First Task

1. Click **New Task** in the top-right corner of the Kanban board.
2. Fill in the **Title** — a short label for the task (e.g., `Summarize Q1 report`).
3. Enter the **Prompt** — the full instruction that will be sent to the agent.
4. Choose an **Agent** from the dropdown. If you're unsure, leave it on **Connie** — she will route it automatically.
5. Set a **Priority**: `critical`, `high`, `medium`, or `low`.
6. Click **Create Task**.

DashR will create the task, assign it to the selected agent, and initiate an OpenClaw session. The task card will appear in the **Assigned** column and move to **In Progress** as soon as the agent begins work. Logs will stream live in the task detail panel.

---

## Plug Into OpenClaw Hooks

To enable automatic status updates from OpenClaw back to DashR, add the following to your OpenClaw configuration file at `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "session.start": "http://localhost:3000/api/hooks/openclaw",
    "session.progress": "http://localhost:3000/api/hooks/openclaw",
    "session.complete": "http://localhost:3000/api/hooks/openclaw",
    "session.error": "http://localhost:3000/api/hooks/openclaw"
  }
}
```

After saving the file, restart the OpenClaw gateway to apply the hook configuration:

```bash
openclaw gateway restart
```

With hooks active, DashR will receive lifecycle events from OpenClaw in real time and update task status, logs, and token counts without polling.

---

## Docker Alternative

If you prefer to run DashR in a container, use the included Docker Compose file:

```bash
docker compose up -d
```

The compose file sets up DashR and its SQLite volume. You still need to supply environment variables — either through a `.env` file in the project root or by exporting them before running compose.

To view logs:

```bash
docker compose logs -f dashr
```

To stop:

```bash
docker compose down
```

---

## Troubleshooting

| Issue | Likely Cause | Fix |
|---|---|---|
| `Error: Cannot connect to OpenClaw gateway` | Gateway is not running, or `OPENCLAW_GATEWAY_URL` is wrong | Run `openclaw gateway start`, then verify `OPENCLAW_GATEWAY_URL` in `.env` matches the gateway's actual address and port |
| Dashboard loads but tasks won't create | `DASHBOARD_API_KEY` mismatch between `.env` and the browser session | Clear `localStorage` in your browser, reload, and re-enter the correct key |
| Logs not streaming to task panel | Hooks not configured in `~/.openclaw/openclaw.json`, or gateway not restarted | Add the hooks config as shown above and run `openclaw gateway restart` |

---

## Next Steps

- Read [Concepts: Agents](./concepts/agents.md) to understand how DashR's 8 agents work and how Connie routes tasks.
- Read [Concepts: Tasks](./concepts/tasks.md) for the full task lifecycle and WBS system.
- Explore the [API Overview](./api/overview.md) to integrate DashR programmatically.
