# Introduction

## What is DashR?

DashR is the control plane for your OpenClaw agents. It gives every task, every agent, and every token a place to live — a single dashboard where your AI workforce is visible, accountable, and orchestrated. Instead of firing off CLI commands and guessing what happened, DashR surfaces the full lifecycle of your OpenClaw sessions: who did what, how long it took, what it cost, and whether it worked. If OpenClaw is the engine, DashR is the instrument panel.

---

## The Problem

Running OpenClaw agents at any meaningful scale surfaces the same friction fast: you have no idea what's happening. Sessions run in the terminal and vanish. Tasks pile up with no ownership. Costs accumulate invisibly. There is no way to see which agent is idle, which one is blocked, or which one failed silently three hours ago. Coordination is done manually — through notes, chat threads, or memory — which breaks the moment more than one person is involved.

DashR was built to close that gap. It wraps your OpenClaw runtime with a persistent orchestration layer: structured tasks, agent assignment, Kanban and WBS views, live log streaming, and cost tracking — all connected to OpenClaw through a WebSocket gateway and hook system.

---

## How It Works

DashR follows a three-step model:

**1. Plug in**
Connect DashR to your running OpenClaw instance by pointing it at the gateway URL and supplying an API token. DashR registers itself as a hook consumer — OpenClaw will notify DashR whenever a session starts, progresses, or completes.

**2. Create tasks**
Use the DashR UI or REST API to create tasks. Each task has a title, a prompt, an assigned agent, a priority, and an optional Work Breakdown Structure. DashR routes the task to the correct OpenClaw agent via the orchestrator and opens a tracked session.

**3. Watch live**
DashR streams logs from OpenClaw back to the dashboard in real time over WebSocket. You see token usage, cost estimates, status transitions, and structured WBS progress — as it happens.

---

## Core Concepts

| Concept | Description |
|---|---|
| **Tasks** | The primary unit of work. A task has a prompt, an assigned agent, a lifecycle status, and a tracked OpenClaw session ID. |
| **Agents** | The 8 named DashR agents, each mapped to a specific OpenClaw model and specialty. Connie is the default orchestrator. |
| **Kanban** | A board view of all tasks organized by status column: Created, Assigned, In Progress, Waiting, Blocked, Completed. |
| **WBS** | Work Breakdown Structure — an auto-generated 4-item checklist attached to each task, tracking subtask-level progress. |
| **Models** | The underlying OpenClaw model IDs used per agent. DashR tracks which model is active and allows switching via the UI or API. |
| **Logs** | Structured log entries emitted during a task's session. Logs include timestamps, agent IDs, token counts, and raw output. |

---

## How DashR Connects to OpenClaw

DashR integrates with OpenClaw through three mechanisms:

**CLI subprocess**
DashR can invoke OpenClaw commands directly using Node's `child_process` module. This is used for agent invocation when a direct WebSocket connection is unavailable, and for reading gateway status.

**WebSocket gateway**
DashR maintains a persistent WebSocket connection to the OpenClaw gateway (`OPENCLAW_GATEWAY_URL`). Session events — start, token stream, completion, error — are pushed to DashR in real time and written to the task log.

**Hooks**
OpenClaw supports a hook configuration that calls external URLs on lifecycle events. DashR exposes a `POST /api/hooks/openclaw` endpoint that receives these payloads and updates task state accordingly. Hooks are configured in `~/.openclaw/openclaw.json`.

---

## Who DashR Is For

DashR is built for teams and individuals running OpenClaw who need more than a terminal. Specifically:

- **Engineering teams** that assign AI tasks across multiple agents and need a shared view of progress
- **Operators** who want cost visibility and token tracking across all sessions
- **Developers** building on top of OpenClaw who want a structured task API rather than raw CLI calls
- **Project managers** who need Kanban and WBS views without touching the command line

If you run OpenClaw alone and rarely, DashR may be more than you need. If you run it regularly, across multiple agents, with any shared team context, DashR is the layer that makes it sustainable.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Client                      │
│              Dashboard UI  ·  REST API  ·  WebSocket         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                        DashR Server                          │
│                                                              │
│   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐   │
│   │  REST API    │   │  WebSocket   │   │  Orchestrator │   │
│   │  /api/*      │   │  Gateway     │   │  (Connie)     │   │
│   └──────┬───────┘   └──────┬───────┘   └──────┬────────┘   │
│          │                  │                  │             │
│   ┌──────▼──────────────────▼──────────────────▼────────┐   │
│   │                  SQLite Database                      │   │
│   │     tasks · agents · logs · wbs · models             │   │
│   └───────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       CLI subprocess   WebSocket      HTTP Hooks
              │          Gateway           │
              └──────────────┬────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      OpenClaw Runtime                        │
│            Agents · Sessions · Models · Gateway              │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

Ready to get DashR running? Head to the [Quickstart](./quickstart.md) to have it connected to OpenClaw in under five minutes.
