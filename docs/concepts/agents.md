# Agents

DashR ships with 8 named agents, each mapped to a specific OpenClaw model and optimized for a distinct type of work. Every task in DashR is assigned to one of these agents — either explicitly by the user or automatically by Connie, the default orchestrator.

---

## The 8 DashR Agents

| Agent ID | Name | Role | Default Model | Color | Specialty |
|---|---|---|---|---|---|
| `connie` | Connie | Orchestrator | `claude-opus-4-5` | Indigo | Task routing, planning, and delegation. Connie reads task prompts and decides which specialist agent is best suited to handle them. |
| `maxwell` | Maxwell | Engineer | `claude-sonnet-4-5` | Blue | Software development, code review, debugging, and technical architecture. |
| `ada` | Ada | Researcher | `claude-sonnet-4-5` | Teal | Deep research, literature synthesis, structured summaries, and knowledge retrieval. |
| `leo` | Leo | Writer | `claude-haiku-4-5` | Amber | Long-form writing, editing, copywriting, documentation, and tone refinement. |
| `iris` | Iris | Analyst | `claude-sonnet-4-5` | Purple | Data analysis, metrics interpretation, financial modeling, and quantitative reasoning. |
| `rex` | Rex | Executor | `claude-haiku-4-5` | Orange | Fast, high-volume task execution — batch processing, repetitive transformations, and structured output generation. |
| `nova` | Nova | Designer | `claude-sonnet-4-5` | Pink | UX reasoning, interface critique, visual design direction, and accessibility review. |
| `sage` | Sage | Strategist | `claude-opus-4-5` | Green | High-level strategy, decision support, risk analysis, and long-horizon planning. |

---

## How Connie Orchestrates

When a task is created with no explicit agent assignment — or when the agent is set to `connie` — the orchestrator reads the task's `title` and `prompt` and applies a routing decision.

Connie's routing logic (defined in `src/orchestrator.js`) evaluates the prompt against a set of keyword and intent signals:

- Prompts containing code, technical stack references, file paths, or debugging language are routed to **Maxwell**.
- Prompts requesting summaries, research, citations, or factual retrieval are routed to **Ada**.
- Prompts involving writing, editing, tone, or voice are routed to **Leo**.
- Prompts involving numbers, datasets, percentages, or financial terms are routed to **Iris**.
- Prompts that are high-volume, repetitive, or templated in nature are routed to **Rex**.
- Prompts describing UI, layout, user flow, or accessibility are routed to **Nova**.
- Prompts involving strategy, trade-offs, roadmaps, or organizational decisions are routed to **Sage**.
- If no signal is confident enough, Connie handles the task herself using `claude-opus-4-5`.

Connie does not re-route tasks mid-session. Once an agent is assigned and the session starts, the assignment is locked. To re-route, the task must be manually reassigned and its session restarted.

---

## Agent Status Lifecycle

Each agent has a real-time status that DashR tracks based on its active sessions:

| Status | Description |
|---|---|
| `active` | The agent currently has one or more tasks in the `in-progress` state. An OpenClaw session is open and consuming tokens. |
| `idle` | The agent is available and has no active sessions. It is ready to accept new task assignments. |
| `offline` | DashR cannot reach the agent's model via the OpenClaw gateway. This typically indicates a gateway connectivity issue or a model outage. |

Status is derived from live session state — it is not stored permanently. DashR recomputes each agent's status from the task table on every WebSocket broadcast cycle (every 5 seconds) and whenever a hook event is received.

---

## How Agents Connect to OpenClaw

Each agent is backed by a specific OpenClaw model ID. When DashR invokes an agent, it passes the agent's `model_id` to the OpenClaw CLI or gateway call, which selects the correct underlying model for the session.

The mapping is stored in the `models` table and can be updated via the API (`PATCH /api/models/:id/select`) or the Models settings page in the UI. Changing a model takes effect on the next task created for that agent — running sessions are not affected.

---

## Agent Performance Metrics

DashR tracks the following metrics per agent, aggregated from all completed and in-progress tasks:

| Metric | Field | Description |
|---|---|---|
| Total tasks | `tasks_total` | Number of tasks ever assigned to this agent |
| Success rate | `success_rate` | Percentage of tasks that reached `completed` status without error |
| Total tokens | `tokens_total` | Cumulative token count across all sessions for this agent |
| Total cost | `cost_total_usd` | Estimated cumulative spend in USD across all sessions |

These metrics are available via `GET /api/agents/:id` and displayed on each agent's detail page in the dashboard.

---

## Customizing Agent Routing

Connie's routing logic lives in `src/orchestrator.js`. The file exports a single function, `routeTask(task)`, which receives a task object and returns an `agent_id` string.

The default implementation uses a weighted keyword match. To customize it:

1. Open `src/orchestrator.js`.
2. Modify the `ROUTING_RULES` array. Each rule is an object with a `pattern` (regex), a `agent_id` (string), and a `weight` (number).
3. Add, remove, or reorder rules to match your team's workflow.
4. Restart DashR for the changes to take effect.

```js
// Example: always route legal-related prompts to Sage
{
  pattern: /\b(contract|liability|compliance|regulation|legal)\b/i,
  agent_id: 'sage',
  weight: 10
}
```

Higher `weight` values take precedence when multiple rules match the same prompt. The rule with the highest total weight wins.
