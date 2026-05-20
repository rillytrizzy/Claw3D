# Broker-First Local Workspace Design

## Goal

Make Claw3D feel fully live and operational without attaching it to OpenClaw.

The target experience is:

- Claw3D behaves like a real agent workspace with live movement, status, and actionable controls
- the runtime source of truth is a local workspace broker plus one shared workspace contract file
- Command Nexus and Claw3D reflect the same agents, tasks, and automation outcomes
- terminal control, repo actions, marketplace operations, local automations, setup flows, and `n8n` runs all route through the same broker surface

This should answer:

- what agents exist right now?
- what repo, automation, or terminal capability does each agent have?
- what is queued, routing, running, blocked, done, or failed?
- what action can the user trigger from Claw3D right now?
- what is actually confirmed by the underlying executor versus only locally staged in the UI?

## Scope

The V1 target is a broker-first runtime seam for Claw3D's office and live workspace behavior.

Included:

- one shared local workspace contract file used by both Claw3D and Command Nexus
- one local workspace broker that reads and writes the contract and exposes a normalized runtime API
- Claw3D live status, selection, action state, and scene animation driven from broker data instead of OpenClaw data
- routing for repo actions, terminal adapters, local automations, marketplace tasks, setup flows, and `n8n`
- hybrid event lifecycle so UI can feel immediate but still reconcile to confirmed execution state
- explicit per-agent capability definitions stored in the shared contract

Excluded:

- OpenClaw runtime integration
- direct dependency on OpenClaw agent records, sessions, or gateway APIs
- hard-coupling Claw3D to Command Nexus internal React state
- a large executor framework inside the broker
- remote cloud orchestration as a V1 dependency

## Product Shape

Claw3D remains the immersive visual workspace. Command Nexus remains the operational dashboard. Both surfaces point at the same local broker and shared workspace contract.

Claw3D should show:

- live agent roster and spatial presence
- selected-agent detail and controls
- queue and action status in the bottom command area
- terminal and automation activity as visible workspace state
- install/setup/flow states as inspectable system status, not hidden background behavior

Command Nexus should show:

- the same roster and lifecycle states in a denser operational view
- recent actions, failures, automations, and broker health
- the same truth as Claw3D, not a second runtime model

The broker should make both apps feel connected to a live system while keeping execution delegated to existing tools.

## Runtime Architecture

### Claw3D

Claw3D is a client of the broker.

It should:

- fetch workspace state
- subscribe to event updates
- submit user actions
- animate agents and scenes from normalized runtime state
- keep local-only view state such as camera, focus framing, and temporary scene emphasis

It should not:

- talk to OpenClaw
- own execution policy
- implement repo-specific action logic
- directly spawn terminal, marketplace, or `n8n` work outside broker APIs

### Workspace Broker

The broker is the single runtime authority for both apps.

It should:

- read and write the shared workspace contract
- validate actions against policy and capability definitions
- route actions to the correct executor
- normalize executor updates into one event stream
- persist the authoritative lifecycle state for agents, actions, sessions, and integrations

It should stay thin:

- routing
- normalization
- policy
- reconciliation
- health reporting

It should not become a heavy execution engine when an existing tool or local adapter already does the work.

### Executors Behind The Broker

The broker routes work to adapters such as:

- repo agent runners
- terminal adapters
- local scripts
- marketplace installers
- setup/bootstrap operations
- `n8n`

Each adapter should return normalized status and event updates so the UI never needs adapter-specific branching.

## Shared Workspace Contract

The shared workspace contract is the visible source of truth for runtime state and capability definition.

Suggested top-level shape:

```json
{
  "workspace": {},
  "broker": {},
  "agents": [],
  "actions": [],
  "sessions": [],
  "terminal": {},
  "automations": {},
  "marketplace": {},
  "n8n": {},
  "scene": {},
  "history": []
}
```

### Workspace

`workspace` should identify the local environment and routing context:

- workspace id
- label
- root paths
- active repos
- created/updated timestamps
- version/schema id

### Broker

`broker` should expose health and routing context:

- broker status
- startup time
- last heartbeat
- adapter availability
- degraded mode flags
- last error summary

### Agents

Each agent record should include:

- `id`
- `name`
- `role`
- `repoPath`
- `status`
- `intentState`
- `currentTask`
- `capabilities`
- `availableAutomations`
- `terminalTargets`
- `marketplaceScopes`
- `n8nFlows`
- `health`
- `lastEvent`
- `sceneProfile`

This same record should drive both:

- Claw3D visual behavior
- Command Nexus operational cards and tables

### Actions

`actions` should represent user-triggered and system-triggered work with normalized lifecycle state:

- action id
- agent id
- type
- target
- parameters
- lifecycle state
- timestamps
- executor type
- executor handle/reference
- result summary
- error summary

### Sessions

`sessions` should capture running or recent contextual work units:

- agent session state
- terminal session links
- repo task context
- focused automation run
- current room/scene binding when relevant

### Integration Buckets

`terminal`, `automations`, `marketplace`, and `n8n` should store the current normalized state for each subsystem:

- availability
- running items
- recent outcomes
- pending approvals
- failure reasons

### Scene

`scene` should contain only data the visual layer needs:

- focus target
- highlight state
- attention markers
- follow target
- room intent
- animation cues

This keeps Claw3D expressive without forcing scene-specific state into core broker logic.

## Hybrid Event Model

The UI should feel immediate without pretending execution already succeeded.

Action lifecycle:

- `queued`
- `routing`
- `awaiting_executor`
- `running`
- `succeeded`
- `failed`
- `cancelled`

Behavior rules:

- Claw3D may react visually at `queued` and `routing`
- Command Nexus may surface pending state immediately
- only broker-confirmed events may advance an action into `running`, `succeeded`, or `failed`
- local optimistic state must always reconcile to broker truth

This preserves responsiveness while preventing fake success states.

## Broker API Surface

The broker should expose one local API surface for both apps.

Minimum V1 endpoints:

- `GET /workspace`
- `GET /events/stream`
- `POST /actions/run`
- `POST /actions/cancel`
- `POST /terminal/open`
- `POST /automation/run`
- `POST /marketplace/install`
- `POST /n8n/trigger`
- `POST /agent/focus`

The API should return normalized payloads regardless of which executor handled the work.

## Claw3D Behavior

Claw3D should read broker-backed state as if it were a live runtime floor.

Examples:

- an agent with a queued repo task can move into an active work area and show routing state
- an agent with a running terminal session can surface terminal activity in inspect panels and dock status
- a failed marketplace install can raise attention state in the office without inventing fake agent output
- an `n8n` flow can appear as a visible automation run tied to the owning agent

Claw3D local-only controls such as camera follow, focus framing, and transient ping effects should remain local unless they are intentionally persisted into the shared scene state.

## Command Nexus Behavior

Command Nexus should use the same broker and shared contract but stay optimized for fast operational scanning.

It should surface:

- agent state
- action queues
- recent failures
- terminal availability
- automation health
- marketplace/install progress
- `n8n` run state

It should not become the only owner of runtime truth. It is a peer surface, not the backend.

## Policy And Permissions

The broker owns execution policy.

Per-agent policy should include:

- allowed repos
- allowed command scopes
- allowed automation types
- allowed marketplace scopes
- allowed `n8n` flows
- terminal access mode
- actions that require approval

This keeps Claw3D powerful without turning the visual workspace into an unsafe direct shell.

## Error Handling

The system must degrade explicitly.

Expected degraded states include:

- `terminal_unavailable`
- `repo_unbound`
- `automation_missing`
- `marketplace_unavailable`
- `n8n_unreachable`
- `install_blocked`
- `broker_degraded`

Claw3D and Command Nexus should both show these states clearly while continuing to render the rest of the workspace.

## Delivery Plan

### V1

- define the shared workspace contract
- add the local broker surface
- bind Claw3D live status and action state to broker-backed data
- bind Command Nexus to the same contract

### V2

- add terminal session routing
- add repo action routing
- add local automation routing

### V3

- add marketplace/install workflows
- add setup/bootstrap workflows
- add `n8n` routing
- add richer room-level action and automation visualization

## Verification Plan

Run from `C:\Users\b_bar\claw3d`:

```powershell
npm run typecheck
npm run build
```

Manual verification:

- open Claw3D and confirm it no longer requires OpenClaw-attached agent truth for live workspace behavior
- confirm Claw3D reads broker-backed workspace state and reflects real agent/action lifecycle changes
- confirm Command Nexus shows the same agent states and action outcomes as Claw3D
- trigger one repo action, one terminal action, one local automation, and one `n8n` action through the broker path
- confirm optimistic UI stages reconcile to confirmed broker events
- confirm degraded subsystem states remain visible and actionable instead of silently failing

## Success Criteria

- Claw3D feels attached to a live agent runtime without using OpenClaw
- the shared workspace contract is the visible source of truth for both Claw3D and Command Nexus
- the broker is the only runtime authority both apps talk to
- repo actions, terminal control, local automations, marketplace operations, setup flows, and `n8n` route through one normalized seam
- optimistic UI state never outruns confirmed execution truth
