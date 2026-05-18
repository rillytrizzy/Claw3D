# Live Status Deck Design

## Goal

Add a first-pass Live Status Deck to the Claw3D office so the user can see agent condition and run light local interactions from the 3D command floor.

The deck should make the office feel live and operational without adding real runtime mutations. It should answer:

- is the gateway/live layer healthy?
- how many agents are working, idle, or in error?
- what agent is selected?
- what can I inspect or follow right now?
- which agent needs local attention?

## Scope

The V1 target is a Bottom Command Dock that upgrades the existing mini status area in `RetroOffice3D`.

Included:

- gateway/live health summary using existing status inputs already available to the office UI
- working, idle, and error counts from the existing office agent list
- selected-agent panel opened from existing agent selection/click behavior
- local-only `Inspect`, `Focus`, `Follow`, `Ping`, and `Attention` controls
- compact visual treatment that preserves the office scene as the primary surface

Excluded:

- new backend routes
- gateway writes
- OpenClaw agent creation, deletion, or execution commands
- Command Nexus changes
- a separate second floor or new spatial room system
- floating status cards above every agent

## Product Shape

The deck sits at the bottom of the office scene. In its collapsed state, it behaves like the current mini status bar but with clearer status grouping:

- live/gateway state
- agent counts
- most recent visible status event

When an agent is selected, the deck expands enough to show:

- agent name
- visible office status
- scene posture such as walking, sitting, standing, away, working out, or dancing
- last visible status/reply signal when available
- light command buttons

The deck should not cover the main interaction zone more than necessary. It should be readable at desktop size and avoid competing with immersive screens, context menus, and follow-cam HUDs.

## Light Commands

### Inspect

Inspect is the default selected-agent state. It shows the selected agent's current visible details in the deck. It does not call the gateway.

### Focus

Focus selects the agent and triggers the same style of local visual emphasis already used by the office scene, such as spotlight/focus behavior. It should not change agent runtime state.

### Follow

Follow reuses the existing follow-cam state and controls in `RetroOffice3D`. If the selected agent is already followed, the control exits follow mode.

### Ping

Ping creates a local visual attention cue for the selected agent. This can be a short-lived deck pulse, spotlight pulse, or existing scene cue if one is already available. Ping is local UI state only.

### Attention

Attention toggles a local "needs attention" marker for the selected agent inside the deck. It should be session-local for V1 and should not write to gateway-owned agent records.

## Data Flow

The implementation should stay inside the existing office scene path.

Primary inputs:

- `agents` passed into `RetroOffice3D`
- render agent snapshots from `renderAgentLookupRef`
- existing `followAgentId` state
- existing agent click and hover handlers
- existing `statusFeedEvents`
- existing gateway/status props already used by the mini status area

New local UI state:

- selected deck agent id
- single active ping agent id with expiry timestamp
- attention agent id set

No new source of truth should be created for agent records. Runtime-owned data remains gateway-owned and is only read through the existing app state.

## Component Boundary

V1 can be implemented directly where the current mini status bar is rendered in `RetroOffice3D`.

If the deck grows past a compact block, the follow-up extraction point is a `LiveStatusDeck` child component owned by `src/features/retro-office/RetroOffice3D.tsx`. That extraction should receive plain props and callbacks rather than importing gateway clients directly.

## Interaction Rules

- Clicking an agent opens or updates the deck for that agent.
- Clicking Focus emphasizes the selected agent and keeps the deck open.
- Clicking Follow toggles existing follow-cam behavior for the selected agent.
- Clicking Ping creates a short visual cue and expires automatically.
- Clicking Attention toggles local attention state.
- Selecting a different agent keeps attention markers for previously marked agents during the current session.
- Context-menu behavior, edit mode, immersive screens, and furniture placement should keep priority over deck shortcuts.

## Error Handling

If no agent is selected, the deck shows aggregate live status only.

If the selected agent disappears, the deck clears the selected agent id and returns to aggregate mode.

If gateway status is disconnected or unknown, the deck should still show local office agents and clearly label the live layer as disconnected or unavailable.

## Verification Plan

Run from `C:\Users\b_bar\claw3d`:

```powershell
npm run typecheck
npm run build
```

Manual verification:

- open `/office`
- confirm the deck renders in the bottom command area
- confirm aggregate working, idle, and error counts match visible office state
- click an agent and confirm the selected-agent panel updates
- confirm Follow enters and exits existing follow-cam behavior
- confirm Ping produces a temporary local cue
- confirm Attention toggles locally and does not call runtime actions
- confirm existing agent movement and scene interactions continue working

## Success Criteria

- The office has a live, working bottom command dock.
- The user can inspect, focus, follow, ping, and locally mark attention for agents.
- The change stays inside Claw3D office UI code.
- No gateway writes or backend additions are introduced.
- The implementation remains compatible with existing agent movement, follow cam, context menus, and status feed behavior.
