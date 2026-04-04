# SPECS-05 — Module Build Instructions for Claude Code
## OpenClaw Dashboard — MVP Build

---

## HOW TO USE THIS DOCUMENT

Each module is a **self-contained prompt** to give Claude Code.
Pass one module at a time. Each module tells Claude Code exactly:
- What files to create
- What code to write
- What to reference from previous modules
- How to test that the module works

**Build order is mandatory:**
```
MODULE 1 → MODULE 2 → MODULE 3 + MODULE 4 + MODULE 5 (parallel) → MODULE 6 → MODULE 7
```

**Before starting:** Place this entire folder on your desktop.
Claude Code's working directory: `C:\Users\Tomás Aiza\Desktop\openclaw-dashboard\`

---

## MODULE 1 — Project Foundation
### Prompt to give Claude Code:

```
Create a new Node.js project at C:\Users\Tomás Aiza\Desktop\openclaw-dashboard\

Requirements:
- Node.js 20, CommonJS (require/module.exports — NOT ES modules)
- Create package.json with these exact dependencies:
    express: ^4.18.2
    better-sqlite3: ^9.4.3
    knex: ^3.1.0
    ws: ^8.16.0
    node-cron: ^3.0.3
    dotenv: ^16.4.1
    uuid: ^9.0.0
    cors: ^2.8.5
    morgan: ^1.10.0
    helmet: ^7.1.0
  devDependencies:
    nodemon: ^3.1.0

- Create scripts:
    "start": "node server/index.js"
    "dev": "nodemon server/index.js"
    "db:migrate": "knex migrate:latest"
    "db:seed": "knex seed:run"

- Create .env.example:
    PORT=3000
    WS_PORT=3001
    NODE_ENV=development
    DB_PATH=./data/dashboard.db
    OPENCLAW_GATEWAY_URL=wss://localhost:18789
    OPENCLAW_GATEWAY_TOKEN=
    OPENCLAW_HOOKS_TOKEN=
    DASHBOARD_API_KEY=ocl-dashboard-dev
    OPENCLAW_CLI_PATH=openclaw

- Create .env (copy of .env.example, filled with dev defaults)

- Create .gitignore (node_modules, .env, *.db, data/)

- Create knexfile.js:
    module.exports = {
      development: {
        client: 'better-sqlite3',
        connection: { filename: process.env.DB_PATH || './data/dashboard.db' },
        useNullAsDefault: true,
        migrations: { directory: './server/db/migrations' },
        seeds: { directory: './server/db/seeds' }
      }
    }

- Create server/config.js that:
    - Loads dotenv
    - Exports: PORT, WS_PORT, DB_PATH, OPENCLAW_GATEWAY_URL,
               OPENCLAW_GATEWAY_TOKEN, OPENCLAW_HOOKS_TOKEN,
               DASHBOARD_API_KEY, OPENCLAW_CLI_PATH, NODE_ENV

- Create server/index.js that:
    - Creates Express app
    - Uses cors(), helmet(), morgan('dev'), express.json()
    - Serves public/ as static files
    - Has a GET /health endpoint returning { ok: true, ts: Date.now() }
    - Listens on PORT from config
    - Logs "OpenClaw Dashboard running on http://localhost:PORT"

- Create public/ directory (empty for now)
- Create data/ directory with .gitkeep

- Run: npm install
- Test: node server/index.js — should start without errors
  curl http://localhost:3000/health → { "ok": true }
```

---

## MODULE 2 — Database Layer
### Prompt to give Claude Code:

```
Working directory: C:\Users\Tomás Aiza\Desktop\openclaw-dashboard\

Create the database layer. Reference SPECS-04-DATA-MODELS.md for exact schemas.

Files to create:

1. server/db/connection.js
   - Creates Knex instance using config.js DB_PATH
   - Creates data/ directory if it doesn't exist (use fs.mkdirSync)
   - Runs migrations automatically on first load (knex.migrate.latest())
   - Exports the knex instance as `db`

2. server/db/migrations/001_create_agents.js
   - Creates agents table exactly as defined in SPECS-04 Section 2.1
   - up() creates table, down() drops it

3. server/db/migrations/002_create_models.js
   - Creates models table exactly as defined in SPECS-04 Section 2.5
   - up() creates table, down() drops it

4. server/db/migrations/003_create_tasks.js
   - Creates tasks table exactly as defined in SPECS-04 Section 2.2
   - up() creates table with all indexes, down() drops table + indexes

5. server/db/migrations/004_create_wbs_items.js
   - Creates wbs_items table as defined in SPECS-04 Section 2.3
   - up() creates table, down() drops it

6. server/db/migrations/005_create_logs.js
   - Creates logs table as defined in SPECS-04 Section 2.4
   - up() creates table with indexes, down() drops table

7. server/db/seeds/001_seed_agents.js
   - Seeds exactly the 8 agents from SPECS-04 Section 2.1 seed data
   - Uses knex('agents').insert() with onConflict('id').merge() so it's idempotent

8. server/db/seeds/002_seed_models.js
   - Seeds exactly the 6 models from SPECS-04 Section 2.5 seed data
   - Uses onConflict('id').merge()

After creating all files:
- Run: npm run db:migrate
- Run: npm run db:seed
- Verify: run `sqlite3 data/dashboard.db ".tables"` — should show all 5 tables
- Verify: run `sqlite3 data/dashboard.db "SELECT id, name FROM agents;"` — should show 8 rows
```

---

## MODULE 3 — Task Engine (REST API)
### Prompt to give Claude Code:

```
Working directory: C:\Users\Tomás Aiza\Desktop\openclaw-dashboard\

Create the task management API. Reference SPECS-03-API-CONTRACTS.md for exact
request/response shapes and SPECS-04 for DB patterns.

Modules 1 and 2 are already built. Import db from server/db/connection.js

Files to create:

1. server/middleware/auth.js
   - Express middleware function
   - Checks header: X-API-Key === process.env.DASHBOARD_API_KEY
   - Returns 401 if missing or wrong: { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
   - Exports as module.exports = authMiddleware

2. server/services/task-id.js
   - Exports: async function nextTaskId(db)
   - Queries last task by created_at desc, parses OCL-NNN number, returns next
   - If no tasks exist: returns 'OCL-001'

3. server/services/orchestrator.js
   - Exports: function routeTask(prompt, priority)
   - Implements routing logic from SPECS-02 Section 4
   - Returns agent ID string: 'apex', 'devin', 'olaf', 'rex', 'ops', 'teacher', 'max', 'connie'

4. server/services/wbs-generator.js
   - Exports: function generateWBS(taskId, agentId)
   - Returns array of 4 wbs_items as defined in SPECS-04 Section 2.3

5. server/routes/tasks.js
   - Express Router
   - Implement ALL task endpoints from SPECS-03 Section 1:
       GET    /                    → list tasks (filters: status, agent, q, page, per_page)
       POST   /                    → create task
       GET    /:id                 → get task (include wbs + last 10 logs)
       PATCH  /:id                 → update task
       DELETE /:id                 → soft delete (set deleted_at)
       POST   /:id/advance         → advance status through lifecycle
       POST   /:id/block           → set status='blocked', save block_reason
       POST   /:id/complete        → set status='completed'
       GET    /:id/logs            → get task logs
       GET    /:id/wbs             → get wbs items
       PATCH  /:id/wbs/:wbs_id     → update wbs item (toggle done)

   - Use authMiddleware on all routes
   - Validate status transitions using SPECS-03 Section 8 lifecycle rules
   - Return proper error codes from SPECS-03 Section 9
   - After any status change: call notifier.broadcast() if notifier is initialized
     (use a module-level setter: tasks.setNotifier(n))
   - Insert a log entry on every status change

6. server/routes/agents.js
   - Express Router
   - Use authMiddleware
   - GET  /       → list agents with computed stats (join tasks table for counts)
   - GET  /:id    → single agent + last 5 tasks
   - GET  /:id/tasks → agent's tasks (paginated)

7. Update server/index.js to mount routers:
   app.use('/api/tasks',  require('./routes/tasks'))
   app.use('/api/agents', require('./routes/agents'))

Test:
  curl -H "X-API-Key: ocl-dashboard-dev" http://localhost:3000/api/agents
  → Should return 8 agents with stats

  curl -X POST http://localhost:3000/api/tasks \
    -H "X-API-Key: ocl-dashboard-dev" \
    -H "Content-Type: application/json" \
    -d '{"title":"Test task","prompt":"Test prompt","agent_id":"apex","model_id":"claude-opus-4-6"}'
  → Should return { ok: true, data: { id: "OCL-001", status: "assigned", ... } }
```

---

## MODULE 4 — OpenClaw Bridge
### Prompt to give Claude Code:

```
Working directory: C:\Users\Tomás Aiza\Desktop\openclaw-dashboard\

Create the OpenClaw integration bridge. Reference SPECS-02 Sections 3 and 4.

Files to create:

1. server/services/openclaw-cli.js
   Exports:
   - async function invokeAgent({ agentId, message, modelId, taskId })
     * Spawns: openclaw agent --message "<message>" --model <openclaw_model_id>
     * CRITICAL SECURITY: use spawn(cmd, argsArray) NEVER exec(string)
     * Gets openclaw_model_id by querying models table: SELECT openclaw_model_id FROM models WHERE id=?
     * Returns: { sessionId: string, pid: number }
     * Logs each stdout line to logs table with agent_id and task_id
     * On exit code !== 0: logs error, updates task status to 'blocked'
     * The sessionId is parsed from the first line of stdout that matches: /session[: ]+([a-z0-9_-]+)/i
       If not found: generates UUID v4 and prefixes 'local-'

   - async function getGatewayStatus()
     * Spawns: openclaw gateway status
     * Returns: { online: boolean, version: string }
     * Timeout: 5000ms — if no response, returns { online: false }

   - async function readOpenClawConfig()
     * Reads: path.join(os.homedir(), '.openclaw', 'openclaw.json')
     * Returns parsed JSON or {} if file not found (never throws)

2. server/services/gateway-client.js
   Exports a singleton GatewayClient class:

   class GatewayClient {
     constructor(db, notifier) { ... }

     connect()
       * Creates WebSocket client to OPENCLAW_GATEWAY_URL
       * Authenticates with Authorization: Bearer OPENCLAW_GATEWAY_TOKEN header
       * On message: calls this._handleEvent(parsed)
       * On close: tries to reconnect after 5s (max 10 retries)
       * On error: logs error, does NOT throw
       * If OPENCLAW_GATEWAY_URL is empty: logs warning and skips (graceful degradation)

     _handleEvent(event)
       * Handles these event types (see SPECS-02 Section 3.2):
         'session:update'   → UPDATE tasks SET tokens_used+=, updated_at= | insert log | broadcast task:updated
         'session:complete' → UPDATE tasks SET status='completed' | insert log | broadcast task:completed
         'session:waiting'  → UPDATE tasks SET status='waiting' | insert log | broadcast task:moved-to-user
         'session:error'    → UPDATE tasks SET status='blocked' | insert log | broadcast task:blocked
         'agent:status'     → UPDATE agents SET status=, last_seen= | broadcast agent:status
       * Matches events to tasks via openclaw_session_id column

     disconnect() { closes WS connection }
   }

   module.exports = GatewayClient

3. server/routes/hooks.js
   Express Router:

   POST /openclaw
     * Validates: Authorization header === `Bearer ${OPENCLAW_HOOKS_TOKEN}`
     * If OPENCLAW_HOOKS_TOKEN is empty: accept all (dev mode) + log warning
     * Parses event body (see SPECS-03 Section 6 for event shapes)
     * Calls same _handleEvent logic as gateway-client
     * Returns { ok: true } always (even on errors — to avoid OpenClaw retrying)

4. Update server/index.js:
   - Import GatewayClient
   - After server starts: initialize GatewayClient and call .connect()
   - Mount: app.use('/api/hooks', require('./routes/hooks'))
   - Export app for testing

Note: If openclaw CLI is not installed (ENOENT error from spawn),
log a clear warning "OpenClaw CLI not found — task execution disabled"
and continue running. The dashboard still works for viewing/managing tasks.
```

---

## MODULE 5 — Real-Time WebSocket Server
### Prompt to give Claude Code:

```
Working directory: C:\Users\Tomás Aiza\Desktop\openclaw-dashboard\

Create the real-time WebSocket layer. Reference SPECS-03 Section 7 and SPECS-02 Section 5.

Files to create:

1. server/services/notifier.js
   Exports a Notifier class:

   class Notifier {
     constructor() { this.wss = null; }

     init(wss) { this.wss = wss; }

     broadcast(event, data) {
       if (!this.wss) return;
       const payload = JSON.stringify({ event, data, ts: Date.now() });
       this.wss.clients.forEach(client => {
         if (client.readyState === 1) client.send(payload);  // 1 = OPEN
       });
     }

     broadcastStats(db) {
       // Computes and broadcasts full dashboard stats
       // Use the query patterns from SPECS-04 Section 6
     }
   }

   module.exports = new Notifier()  // Singleton export

2. server/ws/ws-server.js
   Exports: function createWsServer(server, db, notifier)
   - Creates WebSocket.Server({ server })  -- attaches to existing HTTP server
     OR if WS_PORT is set differently: WebSocket.Server({ port: WS_PORT })
   - On connection:
     * Sends initial payload: { event: 'connected', data: { ts: Date.now() } }
     * On message: handles 'ping' → sends 'pong', handles 'subscribe' → logs subscription
     * On close: logs disconnection
   - Calls notifier.init(wss)
   - Sets up node-cron for stats broadcast every 30 seconds:
       cron.schedule('*/30 * * * * *', () => notifier.broadcastStats(db))
   - Sets up heartbeat ping every 60 seconds to prune dead connections
   - Returns wss instance

3. Update server/index.js to:
   - Import http from 'http'
   - Create HTTP server: const httpServer = http.createServer(app)
   - Import createWsServer and notifier
   - After DB is ready: createWsServer(httpServer, db, notifier)
   - Change: httpServer.listen(PORT, ...) instead of app.listen(PORT, ...)
   - Pass notifier to task routes: require('./routes/tasks').setNotifier(notifier)

Test:
  Start server, open browser console:
    const ws = new WebSocket('ws://localhost:3000')
    ws.onmessage = (e) => console.log(JSON.parse(e.data))
  Should see: { event: 'connected', data: { ts: ... } }

  Create a task via API — browser should receive task:created event
```

---

## MODULE 6 — Dashboard Stats & Remaining API Routes
### Prompt to give Claude Code:

```
Working directory: C:\Users\Tomás Aiza\Desktop\openclaw-dashboard\

Create the remaining API routes. All modules 1-5 are built.

Files to create:

1. server/routes/dashboard.js
   GET /api/dashboard/stats
   Returns exactly the shape from SPECS-03 Section 3:
   {
     activities: { total, this_week, daily: [7 days of counts] },
     success_rate: { percent, total, succeeded, warned, failed, delta_vs_last_period },
     tokens_by_provider: [ { provider, tokens, color } ],
     most_used_agents: [ { agent_id, name, color, tasks } ] (top 5),
     issues: [ { task_id, title, type, agent_id } ] (status: waiting|blocked),
     recent_logs: [ last 5 log entries ]
   }

   All values derived from DB queries (see SPECS-04 Section 6 for patterns).
   For this_week: COUNT tasks WHERE created_at >= datetime('now', '-7 days')
   For daily[]: one query per day for last 7 days

2. server/routes/logs.js
   - GET  /api/logs        → list logs (filters: level, agent_id, task_id, from, to)
   - POST /api/logs        → insert log entry
   - DELETE /api/logs      → delete logs (optional filters: before, agent_id)
   Use authMiddleware on all. Reference SPECS-03 Section 4.

3. server/routes/models.js
   - GET   /api/models          → list all models
   - PATCH /api/models/:id/select → set is_selected=1, all others is_selected=0
   Use authMiddleware. Reference SPECS-03 Section 5.

4. Update server/index.js to mount:
   app.use('/api/dashboard', require('./routes/dashboard'))
   app.use('/api/logs',      require('./routes/logs'))
   app.use('/api/models',    require('./routes/models'))

Test:
  curl -H "X-API-Key: ocl-dashboard-dev" http://localhost:3000/api/dashboard/stats
  → Should return full stats object with real DB data

  curl -H "X-API-Key: ocl-dashboard-dev" http://localhost:3000/api/models
  → Should return 6 models, one with is_selected: true
```

---

## MODULE 7 — Frontend Wire-Up
### Prompt to give Claude Code:

```
Working directory: C:\Users\Tomás Aiza\Desktop\openclaw-dashboard\

The last module. Connect the existing dashboard UI to the real backend.
The dashboard HTML is at: C:\Users\Tomás Aiza\Desktop\openclaw\openclaw-os.html
Copy it to: public/index.html

Then modify public/index.html to replace all mock data with real API calls.
Keep ALL existing CSS, layout, and visual design unchanged.
Only modify the JavaScript section.

Changes to make:

1. ADD API_KEY constant at top of <script>:
   const API_KEY = 'ocl-dashboard-dev';

2. ADD fetchAPI helper function:
   async function fetchAPI(path, options = {}) {
     const res = await fetch(path, {
       ...options,
       headers: {
         'X-API-Key': API_KEY,
         'Content-Type': 'application/json',
         ...(options.headers || {})
       }
     });
     if (!res.ok) throw new Error(`API error ${res.status}`);
     return res.json();
   }

3. ADD WebSocket connection:
   const ws = new WebSocket(`ws://${location.host}`);
   ws.onmessage = (e) => {
     const { event, data } = JSON.parse(e.data);
     handleWsEvent(event, data);
   };

   function handleWsEvent(event, data) {
     switch(event) {
       case 'task:created':
       case 'task:updated':
       case 'task:completed':
       case 'task:blocked':
         // Find task in TASKS array, update or prepend
         // Re-render affected views
         break;
       case 'log:entry':
         LOGS.unshift(data);
         renderDashLogs();
         if active logs view: renderLogs();
         break;
       case 'agent:status':
         // Update agent in AGENTS array
         renderSidebar(); renderAgentsGrid();
         break;
       case 'stats:update':
         // Update widget values from data
         break;
     }
   }

4. REPLACE createTask() function:
   Current: pushes to local TASKS array
   New: calls POST /api/tasks with form values, waits for response,
        updates TASKS array with returned task, then refreshes views.
        Handle errors: show "Failed to create task" toast.

5. REPLACE the DOMContentLoaded init block:
   Instead of using hardcoded TASKS/AGENTS/LOGS arrays as the source of truth,
   load from API on startup:

   async function loadInitialData() {
     const [tasksRes, agentsRes, modelsRes, statsRes, logsRes] = await Promise.all([
       fetchAPI('/api/tasks'),
       fetchAPI('/api/agents'),
       fetchAPI('/api/models'),
       fetchAPI('/api/dashboard/stats'),
       fetchAPI('/api/logs?per_page=50')
     ]);
     TASKS   = tasksRes.data;
     AGENTS  = agentsRes.data;
     MODELS  = modelsRes.data;
     LOGS    = logsRes.data;
     // Populate dashboard widgets from statsRes.data
     // Then call all render functions
   }

   Call loadInitialData() in DOMContentLoaded, then call all render functions.

6. UPDATE advanceTask(), blockTask(), completeTask() to call API:
   - PATCH /api/tasks/:id  { status: newStatus }  (or POST /:id/advance etc.)
   - On success: update local TASKS array, refresh views
   - On error: show error toast

7. REMOVE startLiveLogs() simulation function — real data comes from WebSocket now.
   Keep the setInterval only if WS is disconnected (fallback polling):
   if (ws.readyState !== WebSocket.OPEN) { ... poll /api/logs ... }

8. Keep all existing render functions (renderKanban, renderTasks, etc.) exactly as-is.
   They read from TASKS/AGENTS/LOGS arrays — just make sure those arrays are
   populated from the API now.

Final test sequence:
1. Start server: npm run dev
2. Open http://localhost:3000 in browser
3. Dashboard should load with real data from DB
4. Create a task via the form — should appear in Kanban + task list
5. Open two browser tabs — action in one tab should update the other (WebSocket)
6. Check the Logs view — should show real log entries
```

---

## INTEGRATION CHECKLIST

Run these checks after completing all 7 modules:

```
□ npm run dev — server starts without errors
□ GET /health → { ok: true }
□ GET /api/agents → 8 agents with stats
□ GET /api/models → 6 models, one selected
□ GET /api/dashboard/stats → full stats object
□ POST /api/tasks → creates task, returns OCL-XXX id
□ GET /api/tasks/OCL-001 → task with wbs[] and logs[]
□ POST /api/tasks/OCL-001/advance → status advances
□ GET /api/logs → log entries
□ Browser: http://localhost:3000 loads dashboard
□ Browser: creating task via UI → appears in Kanban
□ Browser: two tabs → task change in tab 1 updates tab 2
□ OpenClaw CLI test (if installed):
    openclaw gateway status → returns something
    POST /api/tasks → openclaw CLI is invoked
□ Logs view shows real entries
□ Models view shows 6 models, selection works
```

---

## COMMON ERRORS & FIXES

| Error | Cause | Fix |
|---|---|---|
| `Cannot find module 'better-sqlite3'` | Not installed | `npm install` |
| `SQLITE_CANTOPEN` | data/ dir missing | `mkdir data` |
| `ENOENT openclaw` | CLI not in PATH | Set OPENCLAW_CLI_PATH to full path in .env |
| WS connection fails | Port mismatch | Check WS_PORT in .env matches server |
| `401 Unauthorized` | Wrong API key | Check X-API-Key header matches .env |
| CORS error in browser | CORS not set up | Ensure cors() middleware is before routes |
| Knex migration error | Wrong migration order | Delete dashboard.db, run migrate again |
