# Live Status Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom command dock to `/office` that shows live gateway and agent status, expands for a selected agent, and supports local-only `Inspect`, `Focus`, `Follow`, `Ping`, and `Attention` actions.

**Architecture:** Keep the feature inside the existing Claw3D office scene path. Add one small helper module for deterministic deck state derivation and one contained UI/state wiring pass inside `RetroOffice3D`, reusing existing `followAgentId`, `spotlightAgentId`, agent click handlers, and status feed data instead of adding backend routes or gateway writes.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Testing Library, Tailwind utility classes already used in `RetroOffice3D`

---

## File Map

- Create: `src/features/retro-office/liveStatusDeck.ts`
  Responsibility: pure deck-state helpers for counts, selected-agent summary, last visible signal lookup, and local attention/ping cleanup.
- Create: `tests/unit/liveStatusDeck.test.ts`
  Responsibility: unit coverage for the helper module without rendering the full office scene.
- Modify: `src/features/retro-office/RetroOffice3D.tsx`
  Responsibility: add local dock state, wire agent selection into the dock, connect `Focus` and `Follow` to existing scene state, and replace the current mini status bar with the new bottom command dock UI.

### Task 1: Add a pure deck-state helper

**Files:**
- Create: `src/features/retro-office/liveStatusDeck.ts`
- Test: `tests/unit/liveStatusDeck.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from "vitest";

import {
  buildLiveStatusDeckSummary,
  createAttentionSet,
  pruneLiveStatusDeckState,
  toggleAttentionAgent,
} from "@/features/retro-office/liveStatusDeck";

const agents = [
  { id: "alpha", name: "Alpha", status: "working", color: "#f59e0b", item: "desk" },
  { id: "beta", name: "Beta", status: "idle", color: "#60a5fa", item: "desk" },
  { id: "gamma", name: "Gamma", status: "error", color: "#f87171", item: "desk" },
] as const;

describe("liveStatusDeck helpers", () => {
  it("builds aggregate counts and selected-agent detail", () => {
    const summary = buildLiveStatusDeckSummary({
      agents,
      renderAgentUiById: {
        alpha: { state: "walking", status: "working" },
        beta: { state: "standing", status: "idle" },
        gamma: { state: "away", status: "error" },
      },
      statusFeedEvents: [
        { id: "alpha", name: "Alpha", text: "Opened GitHub review", ts: 50_000 },
        { id: "beta", name: "Beta", text: "Waiting for input", ts: 40_000 },
      ],
      gatewayStatus: "connected",
      selectedAgentId: "alpha",
      followAgentId: "beta",
      spotlightAgentId: "alpha",
      attentionAgentIds: new Set(["gamma"]),
      pingAgentId: "alpha",
      pingExpiresAt: 60_000,
      nowMs: 55_000,
    });

    expect(summary.counts).toEqual({ working: 1, idle: 1, error: 1 });
    expect(summary.selectedAgent).toEqual(
      expect.objectContaining({
        id: "alpha",
        visibleStatus: "working",
        sceneState: "walking",
        lastSignalText: "Opened GitHub review",
        isFollowed: false,
        isFocused: true,
        isAttentionMarked: false,
        isPingActive: true,
      }),
    );
    expect(summary.gatewayLabel).toBe("connected");
  });

  it("clears stale selection and ping state when the agent is no longer present", () => {
    const next = pruneLiveStatusDeckState({
      agents,
      selectedAgentId: "missing",
      pingAgentId: "missing",
      pingExpiresAt: 10_000,
      attentionAgentIds: new Set(["alpha", "missing"]),
      nowMs: 11_000,
    });

    expect(next.selectedAgentId).toBeNull();
    expect(next.pingAgentId).toBeNull();
    expect(next.pingExpiresAt).toBeNull();
    expect([...next.attentionAgentIds]).toEqual(["alpha"]);
  });

  it("toggles attention markers without mutating the original set", () => {
    const original = createAttentionSet(["alpha"]);
    const added = toggleAttentionAgent(original, "beta");
    const removed = toggleAttentionAgent(added, "alpha");

    expect([...original]).toEqual(["alpha"]);
    expect([...added].sort()).toEqual(["alpha", "beta"]);
    expect([...removed]).toEqual(["beta"]);
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `npm test -- --run tests/unit/liveStatusDeck.test.ts`

Expected: FAIL with `Cannot find module "@/features/retro-office/liveStatusDeck"` or missing export errors.

- [ ] **Step 3: Write the minimal helper implementation**

```ts
import type { OfficeAgent, RenderAgent } from "@/features/retro-office/core/types";

type RenderAgentUiSnapshot = Pick<RenderAgent, "state" | "status">;

type FeedEvent = {
  id: string;
  name: string;
  text: string;
  ts: number;
  kind?: "status" | "reply";
};

export type LiveStatusDeckSummary = {
  gatewayLabel: string;
  counts: { working: number; idle: number; error: number };
  latestEvent: FeedEvent | null;
  selectedAgent: {
    id: string;
    name: string;
    visibleStatus: OfficeAgent["status"];
    sceneState: RenderAgent["state"] | null;
    lastSignalText: string | null;
    isFocused: boolean;
    isFollowed: boolean;
    isAttentionMarked: boolean;
    isPingActive: boolean;
  } | null;
};

export function createAttentionSet(ids: string[] = []): Set<string> {
  return new Set(ids);
}

export function toggleAttentionAgent(current: Set<string>, agentId: string): Set<string> {
  const next = new Set(current);
  if (next.has(agentId)) next.delete(agentId);
  else next.add(agentId);
  return next;
}

export function pruneLiveStatusDeckState(params: {
  agents: readonly Pick<OfficeAgent, "id">[];
  selectedAgentId: string | null;
  pingAgentId: string | null;
  pingExpiresAt: number | null;
  attentionAgentIds: Set<string>;
  nowMs: number;
}) {
  const available = new Set(params.agents.map((agent) => agent.id));
  const selectedAgentId =
    params.selectedAgentId && available.has(params.selectedAgentId)
      ? params.selectedAgentId
      : null;
  const pingStillValid =
    params.pingAgentId &&
    params.pingExpiresAt &&
    params.pingExpiresAt > params.nowMs &&
    available.has(params.pingAgentId);

  return {
    selectedAgentId,
    pingAgentId: pingStillValid ? params.pingAgentId : null,
    pingExpiresAt: pingStillValid ? params.pingExpiresAt : null,
    attentionAgentIds: new Set(
      [...params.attentionAgentIds].filter((agentId) => available.has(agentId)),
    ),
  };
}

export function buildLiveStatusDeckSummary(params: {
  agents: readonly OfficeAgent[];
  renderAgentUiById: Record<string, RenderAgentUiSnapshot | undefined>;
  statusFeedEvents: readonly FeedEvent[];
  gatewayStatus?: string;
  selectedAgentId: string | null;
  followAgentId: string | null;
  spotlightAgentId: string | null;
  attentionAgentIds: Set<string>;
  pingAgentId: string | null;
  pingExpiresAt: number | null;
  nowMs: number;
}): LiveStatusDeckSummary {
  const counts = params.agents.reduce(
    (acc, agent) => {
      acc[agent.status] += 1;
      return acc;
    },
    { working: 0, idle: 0, error: 0 },
  );

  const latestEvent = params.statusFeedEvents[0] ?? null;
  const selectedAgent =
    params.selectedAgentId
      ? params.agents.find((agent) => agent.id === params.selectedAgentId) ?? null
      : null;
  const selectedEvent =
    selectedAgent
      ? params.statusFeedEvents.find((event) => event.id === selectedAgent.id) ?? null
      : null;
  const renderAgent = selectedAgent
    ? params.renderAgentUiById[selectedAgent.id] ?? null
    : null;

  return {
    gatewayLabel: (params.gatewayStatus ?? "unknown").trim() || "unknown",
    counts,
    latestEvent,
    selectedAgent: selectedAgent
      ? {
          id: selectedAgent.id,
          name: selectedAgent.name,
          visibleStatus: renderAgent?.status ?? selectedAgent.status,
          sceneState: renderAgent?.state ?? null,
          lastSignalText: selectedEvent?.text ?? null,
          isFocused: params.spotlightAgentId === selectedAgent.id,
          isFollowed: params.followAgentId === selectedAgent.id,
          isAttentionMarked: params.attentionAgentIds.has(selectedAgent.id),
          isPingActive:
            params.pingAgentId === selectedAgent.id &&
            Boolean(params.pingExpiresAt && params.pingExpiresAt > params.nowMs),
        }
      : null,
  };
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `npm test -- --run tests/unit/liveStatusDeck.test.ts`

Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit the helper module and tests**

```bash
git add src/features/retro-office/liveStatusDeck.ts tests/unit/liveStatusDeck.test.ts
git commit -m "Add live status deck state helpers"
```

### Task 2: Wire dock state into `RetroOffice3D`

**Files:**
- Modify: `src/features/retro-office/RetroOffice3D.tsx`
- Create: `src/features/retro-office/liveStatusDeck.ts`

- [ ] **Step 1: Add the failing state integration imports and local state**

Add these imports near the top of `src/features/retro-office/RetroOffice3D.tsx`:

```ts
import {
  buildLiveStatusDeckSummary,
  createAttentionSet,
  pruneLiveStatusDeckState,
  toggleAttentionAgent,
} from "@/features/retro-office/liveStatusDeck";
```

Add these local state values near the existing `followAgentId` / `spotlightAgentId` state:

```ts
const [deckAgentId, setDeckAgentId] = useState<string | null>(null);
const [pingAgentId, setPingAgentId] = useState<string | null>(null);
const [pingExpiresAt, setPingExpiresAt] = useState<number | null>(null);
const [attentionAgentIds, setAttentionAgentIds] = useState<Set<string>>(
  () => createAttentionSet(),
);
```

Expected TypeScript failure before the rest of the task: imported helpers are unused and the new state does not drive any UI yet.

- [ ] **Step 2: Update the existing agent click flow to open the dock**

Extend `handleAgentClick` so agent clicks continue to recenter the camera and chat-select, but also select the dock agent:

```ts
const handleAgentClick = useCallback(
  (agentId: string) => {
    const agent = renderAgentLookupRef.current.get(agentId);
    if (!agent || !orbitRef.current) return;
    const [wx, , wz] = toWorld(agent.x, agent.y);
    orbitRef.current.target.set(wx, 0, wz);
    orbitRef.current.update();
    setDeckAgentId(agentId);
    onAgentChatSelect?.(agentId);
  },
  [onAgentChatSelect, renderAgentLookupRef],
);
```

- [ ] **Step 3: Add state pruning and ping expiry effects**

Add one effect to clear stale selected agents and expired ping cues when agent membership changes, and one effect to expire the ping on time:

```ts
useEffect(() => {
  const next = pruneLiveStatusDeckState({
    agents,
    selectedAgentId: deckAgentId,
    pingAgentId,
    pingExpiresAt,
    attentionAgentIds,
    nowMs: Date.now(),
  });
  if (next.selectedAgentId !== deckAgentId) setDeckAgentId(next.selectedAgentId);
  if (next.pingAgentId !== pingAgentId) setPingAgentId(next.pingAgentId);
  if (next.pingExpiresAt !== pingExpiresAt) setPingExpiresAt(next.pingExpiresAt);
  if (next.attentionAgentIds !== attentionAgentIds) setAttentionAgentIds(next.attentionAgentIds);
}, [agents, attentionAgentIds, deckAgentId, pingAgentId, pingExpiresAt]);

useEffect(() => {
  if (!pingAgentId || !pingExpiresAt) return;
  const delay = pingExpiresAt - Date.now();
  if (delay <= 0) {
    setPingAgentId(null);
    setPingExpiresAt(null);
    return;
  }
  const timeoutId = window.setTimeout(() => {
    setPingAgentId(null);
    setPingExpiresAt(null);
  }, delay);
  return () => window.clearTimeout(timeoutId);
}, [pingAgentId, pingExpiresAt]);
```

- [ ] **Step 4: Build a memoized deck summary from existing office inputs**

Add one derived view model near the current `statusFeedEvents` / `agentStatusLookup` section:

```ts
const liveStatusDeck = useMemo(
  () =>
    buildLiveStatusDeckSummary({
      agents,
      renderAgentUiById,
      statusFeedEvents,
      gatewayStatus,
      selectedAgentId: deckAgentId,
      followAgentId,
      spotlightAgentId,
      attentionAgentIds,
      pingAgentId,
      pingExpiresAt,
      nowMs: Date.now(),
    }),
  [
    agents,
    attentionAgentIds,
    deckAgentId,
    followAgentId,
    gatewayStatus,
    pingAgentId,
    pingExpiresAt,
    renderAgentUiById,
    spotlightAgentId,
    statusFeedEvents,
  ],
);
```

- [ ] **Step 5: Add local action handlers for Focus, Follow, Ping, and Attention**

Use the existing scene state instead of introducing new runtime mutations:

```ts
const handleDeckFocus = useCallback(() => {
  if (!deckAgentId) return;
  setSpotlightAgentId(deckAgentId);
}, [deckAgentId]);

const handleDeckFollow = useCallback(() => {
  if (!deckAgentId) return;
  setFollowAgentId((current) => (current === deckAgentId ? null : deckAgentId));
}, [deckAgentId]);

const handleDeckPing = useCallback(() => {
  if (!deckAgentId) return;
  setPingAgentId(deckAgentId);
  setPingExpiresAt(Date.now() + 2_500);
  setSpotlightAgentId(deckAgentId);
}, [deckAgentId]);

const handleDeckAttention = useCallback(() => {
  if (!deckAgentId) return;
  setAttentionAgentIds((current) => toggleAttentionAgent(current, deckAgentId));
}, [deckAgentId]);
```

- [ ] **Step 6: Run typecheck before touching the dock markup**

Run: `npm run typecheck`

Expected: PASS. If this fails, fix the state wiring before editing the rendered dock markup.

- [ ] **Step 7: Commit the state integration**

```bash
git add src/features/retro-office/RetroOffice3D.tsx src/features/retro-office/liveStatusDeck.ts
git commit -m "Wire live status deck state into retro office"
```

### Task 3: Replace the mini status bar with the bottom command dock UI

**Files:**
- Modify: `src/features/retro-office/RetroOffice3D.tsx`

- [ ] **Step 1: Replace the current bottom-left mini status markup with dock markup**

Replace the block near the existing `Mini status bar` comment with a dock that keeps the feed rows and upgrades the aggregate bar into an interactive panel:

```tsx
<div className="absolute bottom-3 left-3 z-10 flex max-w-[min(34rem,calc(100%-1.5rem))] flex-col items-start gap-2 select-none">
  {statusFeedEvents
    .slice(0, 4)
    .reverse()
    .map((ev) => (
      <div
        key={`${ev.id}-${ev.ts}`}
        className="pointer-events-none flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[10px] font-mono backdrop-blur-sm"
      >
        <span className="font-semibold text-amber-400/80">{ev.name}</span>
        <span className="text-amber-600/70">{ev.text}</span>
      </div>
    ))}

  <div className="pointer-events-auto w-full rounded-2xl border border-amber-800/35 bg-black/70 px-3 py-2 text-[11px] font-mono text-amber-100 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
    <div className="flex items-center gap-3">
      <span className="text-amber-300/90">{liveStatusDeck.gatewayLabel}</span>
      <span className="text-amber-500/70">{liveStatusDeck.counts.working} working</span>
      <span className="text-amber-500/70">{liveStatusDeck.counts.idle} idle</span>
      <span className="text-amber-500/70">{liveStatusDeck.counts.error} error</span>
      <span className="truncate text-amber-200/55">
        {liveStatusDeck.latestEvent
          ? `${liveStatusDeck.latestEvent.name}: ${liveStatusDeck.latestEvent.text}`
          : "No recent live signals"}
      </span>
    </div>

    {liveStatusDeck.selectedAgent ? (
      <div className="mt-2 flex items-center gap-2 border-t border-amber-900/40 pt-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-100">
              {liveStatusDeck.selectedAgent.name}
            </span>
            <span className="rounded-full border border-amber-700/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-300/80">
              {liveStatusDeck.selectedAgent.visibleStatus}
            </span>
            {liveStatusDeck.selectedAgent.isAttentionMarked ? (
              <span className="text-rose-300/80">attention</span>
            ) : null}
          </div>
          <div className="mt-1 text-[10px] text-amber-200/60">
            {liveStatusDeck.selectedAgent.sceneState ?? "unknown posture"}
            {" - "}
            {liveStatusDeck.selectedAgent.lastSignalText ?? "No recent agent signal"}
          </div>
        </div>

        <button type="button" onClick={() => setDeckAgentId(liveStatusDeck.selectedAgent!.id)} className="rounded-full border border-amber-700/40 px-2 py-1 text-amber-200/80 hover:bg-amber-500/10">
          Inspect
        </button>
        <button type="button" onClick={handleDeckFocus} className="rounded-full border border-amber-700/40 px-2 py-1 text-amber-200/80 hover:bg-amber-500/10">
          Focus
        </button>
        <button type="button" onClick={handleDeckFollow} className="rounded-full border border-amber-700/40 px-2 py-1 text-amber-200/80 hover:bg-amber-500/10">
          {liveStatusDeck.selectedAgent.isFollowed ? "Unfollow" : "Follow"}
        </button>
        <button type="button" onClick={handleDeckPing} className="rounded-full border border-amber-700/40 px-2 py-1 text-amber-200/80 hover:bg-amber-500/10">
          {liveStatusDeck.selectedAgent.isPingActive ? "Pinging" : "Ping"}
        </button>
        <button type="button" onClick={handleDeckAttention} className="rounded-full border border-amber-700/40 px-2 py-1 text-amber-200/80 hover:bg-amber-500/10">
          {liveStatusDeck.selectedAgent.isAttentionMarked ? "Clear attention" : "Attention"}
        </button>
      </div>
    ) : null}
  </div>
</div>
```

- [ ] **Step 2: Keep dock precedence compatible with existing overlays**

Retain the existing `!immersiveOverlayActive` guard around the dock. Do not render the dock above immersive overlays, context menus, or furniture edit controls. Keep `pointer-events-none` on the outer stack and `pointer-events-auto` only on the dock panel itself.

- [ ] **Step 3: Add one visible focus cue for Ping without new scene systems**

Use the existing spotlight path instead of adding a new animation system. The `handleDeckPing` action already sets `spotlightAgentId`; keep that behavior and avoid any new mesh or particle feature in V1.

- [ ] **Step 4: Run targeted tests and type/build verification**

Run:

```powershell
npm test -- --run tests/unit/liveStatusDeck.test.ts
npm run typecheck
npm run build
```

Expected:

- `liveStatusDeck.test.ts` passes
- `tsc --noEmit` passes
- `next build` passes

- [ ] **Step 5: Perform manual `/office` verification**

Verify all of these in the browser:

- agent counts still render in the bottom command area
- clicking an agent opens the selected-agent panel
- `Focus` sets the local spotlight cue
- `Follow` toggles the existing follow-cam HUD behavior
- `Ping` highlights the selected agent briefly and clears itself
- `Attention` toggles locally and survives switching to another agent during the session
- immersive overlays still hide the dock
- no gateway-side action is triggered by any deck button

- [ ] **Step 6: Commit the dock UI**

```bash
git add src/features/retro-office/RetroOffice3D.tsx
git commit -m "Add office live status dock"
```
