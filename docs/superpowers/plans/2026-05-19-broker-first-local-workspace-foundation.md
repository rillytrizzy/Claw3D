# Broker-First Local Workspace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local broker-backed workspace foundation that makes Claw3D feel live without OpenClaw, stores shared runtime truth in one local contract file, and gives Command Nexus a stable seam to consume the same agent/action state.

**Architecture:** Add a file-backed workspace contract and thin broker layer inside `claw3d`, expose that broker through local API routes plus an SSE event stream, then make `OfficeScreen`/`RetroOffice3D` consume broker state in a non-OpenClaw mode. Finish by wiring `command-nexus-dashboard` to the shared contract instead of its current simulated runtime header/status path.

**Tech Stack:** Next.js 16 route handlers, TypeScript, React 19, Vitest, file-backed JSON state, Server-Sent Events, Vite React app in `../command-nexus-dashboard`

---

## File Structure

### Claw3D repo

- Create: `src/lib/workspace-contract/types.ts`
  Responsibility: shared broker/contract types used by store, routes, and UI adapters.
- Create: `src/lib/workspace-contract/schema.ts`
  Responsibility: default contract shape plus normalization and mutation helpers.
- Create: `src/lib/workspace-contract/paths.ts`
  Responsibility: resolve the local workspace contract file and event-log paths without reusing OpenClaw state paths.
- Create: `src/lib/workspace-contract/store.ts`
  Responsibility: read/write the contract file safely and append broker event records.
- Create: `src/lib/workspace-broker/types.ts`
  Responsibility: broker action, adapter, and event payload types.
- Create: `src/lib/workspace-broker/eventBus.ts`
  Responsibility: in-process subscription registry for SSE and broker updates.
- Create: `src/lib/workspace-broker/adapters.ts`
  Responsibility: route normalized actions to terminal, repo, automation, marketplace, and `n8n` adapter stubs.
- Create: `src/lib/workspace-broker/broker.ts`
  Responsibility: validate actions, mutate lifecycle state, call adapters, and publish events.
- Create: `src/lib/office/workspaceAdapter.ts`
  Responsibility: map workspace contract agent records into `OfficeAgent`/scene-facing shapes used by `OfficeScreen` and `RetroOffice3D`.
- Create: `src/features/workspace/useWorkspaceBroker.ts`
  Responsibility: fetch broker state, subscribe to SSE, and submit actions from the browser.
- Create: `src/app/api/workspace/route.ts`
  Responsibility: return the normalized workspace snapshot.
- Create: `src/app/api/workspace/events/route.ts`
  Responsibility: stream broker events over SSE.
- Create: `src/app/api/workspace/actions/route.ts`
  Responsibility: accept broker action requests and return normalized lifecycle payloads.
- Modify: `src/features/office/screens/OfficeScreen.tsx`
  Responsibility: add broker mode, bypass the OpenClaw connect overlay when broker mode is enabled, and build office agents from the workspace contract.
- Modify: `src/features/retro-office/RetroOffice3D.tsx`
  Responsibility: show broker-backed runtime labels and action states instead of OpenClaw-only copy when broker mode is active.
- Modify: `src/app/api/health/route.ts`
  Responsibility: include broker health in the service status payload.
- Test: `tests/unit/workspaceContractSchema.test.ts`
- Test: `tests/unit/workspaceContractStore.test.ts`
- Test: `tests/unit/workspaceBroker.test.ts`
- Test: `tests/unit/workspaceActionsRoute.test.ts`
- Test: `tests/unit/workspaceEventsRoute.test.ts`
- Test: `tests/unit/workspaceAdapter.test.ts`

### Command Nexus repo

- Create: `../command-nexus-dashboard/src/lib/workspaceBrokerClient.js`
  Responsibility: read the shared workspace snapshot from the broker or local contract path and normalize runtime state for dashboard consumers.
- Modify: `../command-nexus-dashboard/src/lib/dataProviders.js`
  Responsibility: merge broker-backed runtime state into `runtimeStatus`.
- Modify: `../command-nexus-dashboard/src/lib/useDashboardData.js`
  Responsibility: preserve polling behavior while refreshing broker-backed runtime state.
- Modify: `../command-nexus-dashboard/src/components/RuntimeHeaderStrip.jsx`
  Responsibility: replace the simulated agent ticker with broker-backed agent/action state.
- Modify: `../command-nexus-dashboard/src/components/SystemStatusPanel.jsx`
  Responsibility: show broker health, adapter availability, and degraded subsystem states.

## Task 1: Define the shared workspace contract and schema helpers

**Files:**
- Create: `src/lib/workspace-contract/types.ts`
- Create: `src/lib/workspace-contract/schema.ts`
- Test: `tests/unit/workspaceContractSchema.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
import { describe, expect, it } from "vitest";

import {
  createDefaultWorkspaceContract,
  normalizeWorkspaceContract,
  reduceActionLifecycle,
} from "@/lib/workspace-contract/schema";

describe("workspace contract schema", () => {
  it("creates a default contract with broker, agents, actions, and scene state", () => {
    const contract = createDefaultWorkspaceContract("primary");

    expect(contract.workspace.id).toBe("primary");
    expect(contract.broker.status).toBe("idle");
    expect(contract.agents).toEqual([]);
    expect(contract.actions).toEqual([]);
    expect(contract.scene.focusAgentId).toBeNull();
  });

  it("normalizes unknown lifecycle states back to queued", () => {
    const contract = normalizeWorkspaceContract({
      workspace: { id: "primary" },
      actions: [{ id: "a1", agentId: "alpha", lifecycle: "weird-state" }],
    });

    expect(contract.actions[0]?.lifecycle).toBe("queued");
  });

  it("reduces hybrid lifecycle transitions deterministically", () => {
    expect(reduceActionLifecycle("queued", "routing")).toBe("routing");
    expect(reduceActionLifecycle("routing", "running")).toBe("running");
    expect(reduceActionLifecycle("running", "succeeded")).toBe("succeeded");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- --run tests/unit/workspaceContractSchema.test.ts`
Expected: FAIL with `Cannot find module '@/lib/workspace-contract/schema'`

- [ ] **Step 3: Write the minimal contract types and schema helpers**

```ts
// src/lib/workspace-contract/types.ts
export type WorkspaceActionLifecycle =
  | "queued"
  | "routing"
  | "awaiting_executor"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkspaceAgentRecord = {
  id: string;
  name: string;
  role: string;
  repoPath: string | null;
  status: "idle" | "working" | "blocked" | "error" | "offline";
  intentState: WorkspaceActionLifecycle | null;
  currentTask: string | null;
  capabilities: string[];
  availableAutomations: string[];
  terminalTargets: string[];
  marketplaceScopes: string[];
  n8nFlows: string[];
  health: "healthy" | "degraded" | "offline";
  lastEvent: string | null;
  sceneProfile: {
    area: string;
    pose: string;
    attention: boolean;
  };
};

export type WorkspaceContract = {
  workspace: { id: string; label: string; schemaVersion: number; updatedAt: string };
  broker: {
    status: "idle" | "ready" | "degraded";
    adapterAvailability: Record<string, boolean>;
    lastHeartbeatAt: string | null;
    lastError: string | null;
  };
  agents: WorkspaceAgentRecord[];
  actions: Array<{
    id: string;
    agentId: string;
    type: string;
    target: string;
    lifecycle: WorkspaceActionLifecycle;
    createdAt: string;
    updatedAt: string;
    executor: string | null;
    resultSummary: string | null;
    errorSummary: string | null;
  }>;
  sessions: Array<{ id: string; agentId: string; label: string; status: string }>;
  terminal: { available: boolean; sessions: Array<{ id: string; title: string; status: string }> };
  automations: { available: boolean; running: string[] };
  marketplace: { available: boolean; installs: Array<{ id: string; status: string }> };
  n8n: { available: boolean; runs: Array<{ id: string; status: string }> };
  scene: { focusAgentId: string | null; followAgentId: string | null; attentionAgentIds: string[] };
  history: Array<{ id: string; kind: string; message: string; createdAt: string }>;
};
```

```ts
// src/lib/workspace-contract/schema.ts
import type { WorkspaceActionLifecycle, WorkspaceContract } from "@/lib/workspace-contract/types";

const LIFECYCLE_ORDER: WorkspaceActionLifecycle[] = [
  "queued",
  "routing",
  "awaiting_executor",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export const reduceActionLifecycle = (
  current: WorkspaceActionLifecycle,
  next: string,
): WorkspaceActionLifecycle => {
  return LIFECYCLE_ORDER.includes(next as WorkspaceActionLifecycle)
    ? (next as WorkspaceActionLifecycle)
    : current;
};

export const createDefaultWorkspaceContract = (workspaceId: string): WorkspaceContract => ({
  workspace: {
    id: workspaceId,
    label: "Primary Workspace",
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  },
  broker: {
    status: "idle",
    adapterAvailability: {},
    lastHeartbeatAt: null,
    lastError: null,
  },
  agents: [],
  actions: [],
  sessions: [],
  terminal: { available: false, sessions: [] },
  automations: { available: false, running: [] },
  marketplace: { available: false, installs: [] },
  n8n: { available: false, runs: [] },
  scene: { focusAgentId: null, followAgentId: null, attentionAgentIds: [] },
  history: [],
});

export const normalizeWorkspaceContract = (value: unknown): WorkspaceContract => {
  const base = createDefaultWorkspaceContract("primary");
  const input = value && typeof value === "object" ? (value as Partial<WorkspaceContract>) : {};
  return {
    ...base,
    ...input,
    workspace: {
      ...base.workspace,
      ...(input.workspace ?? {}),
      id: input.workspace?.id?.trim() || base.workspace.id,
    },
    broker: { ...base.broker, ...(input.broker ?? {}) },
    agents: Array.isArray(input.agents) ? input.agents : [],
    actions: Array.isArray(input.actions)
      ? input.actions.map((action) => ({
          ...action,
          lifecycle: reduceActionLifecycle("queued", action.lifecycle),
        }))
      : [],
    scene: { ...base.scene, ...(input.scene ?? {}) },
  };
};
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run test -- --run tests/unit/workspaceContractSchema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-contract/types.ts src/lib/workspace-contract/schema.ts tests/unit/workspaceContractSchema.test.ts
git commit -m "Add workspace contract schema"
```

## Task 2: Add file-backed contract storage and broker event logging

**Files:**
- Create: `src/lib/workspace-contract/paths.ts`
- Create: `src/lib/workspace-contract/store.ts`
- Test: `tests/unit/workspaceContractStore.test.ts`

- [ ] **Step 1: Write the failing storage test**

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendWorkspaceEvent,
  loadWorkspaceContract,
  saveWorkspaceContract,
} from "@/lib/workspace-contract/store";

describe("workspace contract store", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-contract-"));

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes and reloads the shared workspace contract", () => {
    const saved = saveWorkspaceContract({
      workspaceRoot: tempDir,
      contract: {
        workspace: { id: "primary", label: "Primary Workspace", schemaVersion: 1, updatedAt: new Date().toISOString() },
        broker: { status: "ready", adapterAvailability: {}, lastHeartbeatAt: null, lastError: null },
        agents: [],
        actions: [],
        sessions: [],
        terminal: { available: false, sessions: [] },
        automations: { available: false, running: [] },
        marketplace: { available: false, installs: [] },
        n8n: { available: false, runs: [] },
        scene: { focusAgentId: null, followAgentId: null, attentionAgentIds: [] },
        history: [],
      },
    });

    const loaded = loadWorkspaceContract({ workspaceRoot: tempDir });
    expect(loaded.workspace.id).toBe(saved.workspace.id);
    expect(loaded.broker.status).toBe("ready");
  });

  it("appends broker events as jsonl entries", () => {
    const event = appendWorkspaceEvent({
      workspaceRoot: tempDir,
      event: { id: "evt-1", kind: "broker.ready", message: "Broker ready", createdAt: new Date().toISOString() },
    });

    expect(event.id).toBe("evt-1");
    expect(fs.readFileSync(path.join(tempDir, ".claw3d-workspace", "events.jsonl"), "utf8")).toContain("broker.ready");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- --run tests/unit/workspaceContractStore.test.ts`
Expected: FAIL with `Cannot find module '@/lib/workspace-contract/store'`

- [ ] **Step 3: Implement path resolution and safe file-backed persistence**

```ts
// src/lib/workspace-contract/paths.ts
import fs from "node:fs";
import path from "node:path";

export const resolveWorkspaceDataDir = (workspaceRoot: string) =>
  path.join(workspaceRoot, ".claw3d-workspace");

export const resolveWorkspaceContractPath = (workspaceRoot: string) =>
  path.join(resolveWorkspaceDataDir(workspaceRoot), "workspace-contract.json");

export const resolveWorkspaceEventsPath = (workspaceRoot: string) =>
  path.join(resolveWorkspaceDataDir(workspaceRoot), "events.jsonl");

export const ensureWorkspaceDataDir = (workspaceRoot: string) => {
  fs.mkdirSync(resolveWorkspaceDataDir(workspaceRoot), { recursive: true });
};
```

```ts
// src/lib/workspace-contract/store.ts
import fs from "node:fs";

import { createDefaultWorkspaceContract, normalizeWorkspaceContract } from "@/lib/workspace-contract/schema";
import type { WorkspaceContract } from "@/lib/workspace-contract/types";
import {
  ensureWorkspaceDataDir,
  resolveWorkspaceContractPath,
  resolveWorkspaceEventsPath,
} from "@/lib/workspace-contract/paths";

export const loadWorkspaceContract = ({
  workspaceRoot,
}: {
  workspaceRoot: string;
}): WorkspaceContract => {
  const contractPath = resolveWorkspaceContractPath(workspaceRoot);
  if (!fs.existsSync(contractPath)) {
    return createDefaultWorkspaceContract("primary");
  }
  return normalizeWorkspaceContract(JSON.parse(fs.readFileSync(contractPath, "utf8")));
};

export const saveWorkspaceContract = ({
  workspaceRoot,
  contract,
}: {
  workspaceRoot: string;
  contract: WorkspaceContract;
}) => {
  ensureWorkspaceDataDir(workspaceRoot);
  const nextContract = normalizeWorkspaceContract({
    ...contract,
    workspace: { ...contract.workspace, updatedAt: new Date().toISOString() },
  });
  fs.writeFileSync(resolveWorkspaceContractPath(workspaceRoot), JSON.stringify(nextContract, null, 2), "utf8");
  return nextContract;
};

export const appendWorkspaceEvent = ({
  workspaceRoot,
  event,
}: {
  workspaceRoot: string;
  event: { id: string; kind: string; message: string; createdAt: string };
}) => {
  ensureWorkspaceDataDir(workspaceRoot);
  fs.appendFileSync(resolveWorkspaceEventsPath(workspaceRoot), `${JSON.stringify(event)}\n`, "utf8");
  return event;
};
```

- [ ] **Step 4: Run the focused store test**

Run: `npm run test -- --run tests/unit/workspaceContractStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-contract/paths.ts src/lib/workspace-contract/store.ts tests/unit/workspaceContractStore.test.ts
git commit -m "Add workspace contract storage"
```

## Task 3: Build the thin broker, adapters, and lifecycle tests

**Files:**
- Create: `src/lib/workspace-broker/types.ts`
- Create: `src/lib/workspace-broker/eventBus.ts`
- Create: `src/lib/workspace-broker/adapters.ts`
- Create: `src/lib/workspace-broker/broker.ts`
- Test: `tests/unit/workspaceBroker.test.ts`

- [ ] **Step 1: Write the failing broker test**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";

describe("workspace broker", () => {
  it("routes an action through queued, routing, and running states", async () => {
    const broker = createWorkspaceBroker({
      workspaceRoot: process.cwd(),
      adapters: {
        terminal: async () => ({ executor: "terminal", lifecycle: "running", resultSummary: "Opened shell" }),
      },
    });

    const result = await broker.runAction({
      agentId: "alpha",
      type: "terminal.open",
      target: "repo-shell",
      adapter: "terminal",
    });

    expect(result.lifecycle).toBe("running");
    expect(result.executor).toBe("terminal");
    expect(broker.getSnapshot().actions[0]?.lifecycle).toBe("running");
  });

  it("marks the broker degraded when an adapter throws", async () => {
    const broker = createWorkspaceBroker({
      workspaceRoot: process.cwd(),
      adapters: {
        n8n: async () => {
          throw new Error("n8n_unreachable");
        },
      },
    });

    await expect(
      broker.runAction({ agentId: "alpha", type: "n8n.trigger", target: "sync-flow", adapter: "n8n" }),
    ).rejects.toThrow("n8n_unreachable");

    expect(broker.getSnapshot().broker.status).toBe("degraded");
    expect(broker.getSnapshot().broker.lastError).toContain("n8n_unreachable");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- --run tests/unit/workspaceBroker.test.ts`
Expected: FAIL with `Cannot find module '@/lib/workspace-broker/broker'`

- [ ] **Step 3: Implement the thin broker and adapter contract**

```ts
// src/lib/workspace-broker/types.ts
import type { WorkspaceActionLifecycle, WorkspaceContract } from "@/lib/workspace-contract/types";

export type WorkspaceBrokerActionInput = {
  agentId: string;
  type: string;
  target: string;
  adapter: "repo" | "terminal" | "automation" | "marketplace" | "n8n";
  payload?: Record<string, unknown>;
};

export type WorkspaceAdapterResult = {
  executor: string;
  lifecycle: Extract<WorkspaceActionLifecycle, "awaiting_executor" | "running" | "succeeded">;
  resultSummary: string | null;
};

export type WorkspaceAdapter = (input: WorkspaceBrokerActionInput) => Promise<WorkspaceAdapterResult>;

export type WorkspaceBroker = {
  getSnapshot(): WorkspaceContract;
  runAction(input: WorkspaceBrokerActionInput): Promise<WorkspaceContract["actions"][number]>;
  subscribe(listener: (snapshot: WorkspaceContract) => void): () => void;
};
```

```ts
// src/lib/workspace-broker/eventBus.ts
import type { WorkspaceContract } from "@/lib/workspace-contract/types";

export const createWorkspaceEventBus = () => {
  const listeners = new Set<(snapshot: WorkspaceContract) => void>();
  return {
    publish(snapshot: WorkspaceContract) {
      listeners.forEach((listener) => listener(snapshot));
    },
    subscribe(listener: (snapshot: WorkspaceContract) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
```

```ts
// src/lib/workspace-broker/adapters.ts
import type { WorkspaceAdapter } from "@/lib/workspace-broker/types";

export const defaultWorkspaceAdapters: Record<string, WorkspaceAdapter> = {
  repo: async (input) => ({
    executor: "repo-agent",
    lifecycle: "awaiting_executor",
    resultSummary: `Queued repo action for ${input.target}`,
  }),
  terminal: async (input) => ({
    executor: "terminal",
    lifecycle: "running",
    resultSummary: `Opened terminal target ${input.target}`,
  }),
  automation: async (input) => ({
    executor: "local-automation",
    lifecycle: "running",
    resultSummary: `Started automation ${input.target}`,
  }),
  marketplace: async (input) => ({
    executor: "marketplace",
    lifecycle: "awaiting_executor",
    resultSummary: `Queued marketplace scope ${input.target}`,
  }),
  n8n: async (input) => ({
    executor: "n8n",
    lifecycle: "awaiting_executor",
    resultSummary: `Queued n8n flow ${input.target}`,
  }),
};
```

```ts
// src/lib/workspace-broker/broker.ts
import { randomUUID } from "@/lib/uuid";
import { createDefaultWorkspaceContract } from "@/lib/workspace-contract/schema";
import { loadWorkspaceContract, saveWorkspaceContract } from "@/lib/workspace-contract/store";
import { createWorkspaceEventBus } from "@/lib/workspace-broker/eventBus";
import { defaultWorkspaceAdapters } from "@/lib/workspace-broker/adapters";
import type { WorkspaceBroker, WorkspaceBrokerActionInput, WorkspaceAdapter } from "@/lib/workspace-broker/types";

export const createWorkspaceBroker = ({
  workspaceRoot,
  adapters = {},
}: {
  workspaceRoot: string;
  adapters?: Partial<Record<string, WorkspaceAdapter>>;
}): WorkspaceBroker => {
  const eventBus = createWorkspaceEventBus();
  let snapshot = loadWorkspaceContract({ workspaceRoot });
  if (!snapshot.workspace.id) {
    snapshot = createDefaultWorkspaceContract("primary");
  }
  const adapterMap = { ...defaultWorkspaceAdapters, ...adapters };

  const persist = () => {
    snapshot = saveWorkspaceContract({ workspaceRoot, contract: snapshot });
    eventBus.publish(snapshot);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: eventBus.subscribe,
    async runAction(input: WorkspaceBrokerActionInput) {
      const action = {
        id: randomUUID(),
        agentId: input.agentId,
        type: input.type,
        target: input.target,
        lifecycle: "queued" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executor: null,
        resultSummary: null,
        errorSummary: null,
      };
      snapshot = {
        ...snapshot,
        broker: { ...snapshot.broker, status: "ready", lastHeartbeatAt: new Date().toISOString(), lastError: null },
        actions: [action, ...snapshot.actions],
      };
      persist();

      const adapter = adapterMap[input.adapter];
      if (!adapter) {
        throw new Error(`Missing adapter: ${input.adapter}`);
      }

      try {
        snapshot.actions[0] = { ...snapshot.actions[0], lifecycle: "routing", updatedAt: new Date().toISOString() };
        persist();
        const result = await adapter(input);
        snapshot.actions[0] = {
          ...snapshot.actions[0],
          lifecycle: result.lifecycle,
          executor: result.executor,
          resultSummary: result.resultSummary,
          updatedAt: new Date().toISOString(),
        };
        persist();
        return snapshot.actions[0];
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown broker failure";
        snapshot.broker = { ...snapshot.broker, status: "degraded", lastError: message };
        snapshot.actions[0] = {
          ...snapshot.actions[0],
          lifecycle: "failed",
          errorSummary: message,
          updatedAt: new Date().toISOString(),
        };
        persist();
        throw error;
      }
    },
  };
};
```

- [ ] **Step 4: Run the focused broker test**

Run: `npm run test -- --run tests/unit/workspaceBroker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-broker/types.ts src/lib/workspace-broker/eventBus.ts src/lib/workspace-broker/adapters.ts src/lib/workspace-broker/broker.ts tests/unit/workspaceBroker.test.ts
git commit -m "Add workspace broker core"
```

## Task 4: Expose the broker through local API routes and health reporting

**Files:**
- Create: `src/app/api/workspace/route.ts`
- Create: `src/app/api/workspace/events/route.ts`
- Create: `src/app/api/workspace/actions/route.ts`
- Modify: `src/app/api/health/route.ts`
- Test: `tests/unit/workspaceActionsRoute.test.ts`
- Test: `tests/unit/workspaceEventsRoute.test.ts`

- [ ] **Step 1: Write failing route tests**

```ts
// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

let GET_WORKSPACE: typeof import("@/app/api/workspace/route")["GET"];
let POST_ACTION: typeof import("@/app/api/workspace/actions/route")["POST"];

beforeAll(async () => {
  ({ GET: GET_WORKSPACE } = await import("@/app/api/workspace/route"));
  ({ POST: POST_ACTION } = await import("@/app/api/workspace/actions/route"));
});

describe("/api/workspace routes", () => {
  it("returns the workspace snapshot", async () => {
    const response = await GET_WORKSPACE(new Request("http://localhost/api/workspace"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ workspace: expect.any(Object) }));
  });

  it("validates action input before routing", async () => {
    const response = await POST_ACTION(
      new Request("http://localhost/api/workspace/actions", {
        method: "POST",
        body: JSON.stringify({ agentId: "", type: "", target: "", adapter: "" }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- --run tests/unit/workspaceActionsRoute.test.ts tests/unit/workspaceEventsRoute.test.ts`
Expected: FAIL with missing route modules

- [ ] **Step 3: Implement snapshot, action, events, and health routes**

```ts
// src/app/api/workspace/route.ts
import { NextResponse } from "next/server";
import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";

export const runtime = "nodejs";

const broker = createWorkspaceBroker({ workspaceRoot: process.cwd() });

export async function GET() {
  return NextResponse.json(broker.getSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
```

```ts
// src/app/api/workspace/actions/route.ts
import { NextResponse } from "next/server";
import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";

export const runtime = "nodejs";

const broker = createWorkspaceBroker({ workspaceRoot: process.cwd() });

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const target = typeof body.target === "string" ? body.target.trim() : "";
  const adapter = typeof body.adapter === "string" ? body.adapter.trim() : "";
  if (!agentId || !type || !target || !adapter) {
    return NextResponse.json({ error: "agentId, type, target, and adapter are required." }, { status: 400 });
  }
  try {
    const action = await broker.runAction({
      agentId,
      type,
      target,
      adapter: adapter as "repo" | "terminal" | "automation" | "marketplace" | "n8n",
      payload: typeof body.payload === "object" && body.payload ? (body.payload as Record<string, unknown>) : undefined,
    });
    return NextResponse.json(action, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Broker action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

```ts
// src/app/api/workspace/events/route.ts
import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const broker = createWorkspaceBroker({ workspaceRoot: process.cwd() });

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(broker.getSnapshot())}\n\n`));
      const unsubscribe = broker.subscribe((snapshot) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`));
      });
      return () => unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
```

```ts
// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";

export const runtime = "nodejs";

export async function GET() {
  const broker = createWorkspaceBroker({ workspaceRoot: process.cwd() });
  const snapshot = broker.getSnapshot();
  return NextResponse.json(
    {
      ok: true,
      service: "claw3d",
      broker: {
        status: snapshot.broker.status,
        lastHeartbeatAt: snapshot.broker.lastHeartbeatAt,
        lastError: snapshot.broker.lastError,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 4: Run the focused route tests**

Run: `npm run test -- --run tests/unit/workspaceActionsRoute.test.ts tests/unit/workspaceEventsRoute.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/workspace/route.ts src/app/api/workspace/events/route.ts src/app/api/workspace/actions/route.ts src/app/api/health/route.ts tests/unit/workspaceActionsRoute.test.ts tests/unit/workspaceEventsRoute.test.ts
git commit -m "Expose workspace broker routes"
```

## Task 5: Make OfficeScreen and RetroOffice3D run in broker mode

**Files:**
- Create: `src/lib/office/workspaceAdapter.ts`
- Create: `src/features/workspace/useWorkspaceBroker.ts`
- Modify: `src/features/office/screens/OfficeScreen.tsx`
- Modify: `src/features/retro-office/RetroOffice3D.tsx`
- Test: `tests/unit/workspaceAdapter.test.ts`

- [ ] **Step 1: Write the failing adapter test**

```ts
import { describe, expect, it } from "vitest";

import { mapWorkspaceAgentsToOfficeAgents } from "@/lib/office/workspaceAdapter";

describe("workspaceAdapter", () => {
  it("maps broker-backed agents into office agents with visible status", () => {
    const agents = mapWorkspaceAgentsToOfficeAgents([
      {
        id: "alpha",
        name: "Alpha",
        role: "builder",
        repoPath: "C:/Users/b_bar/claw3d",
        status: "working",
        intentState: "running",
        currentTask: "Patch office route",
        capabilities: [],
        availableAutomations: [],
        terminalTargets: [],
        marketplaceScopes: [],
        n8nFlows: [],
        health: "healthy",
        lastEvent: "terminal running",
        sceneProfile: { area: "desk", pose: "walking", attention: false },
      },
    ]);

    expect(agents[0]).toEqual(expect.objectContaining({
      id: "alpha",
      name: "Alpha",
      status: "working",
    }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- --run tests/unit/workspaceAdapter.test.ts`
Expected: FAIL with `Cannot find module '@/lib/office/workspaceAdapter'`

- [ ] **Step 3: Add the workspace adapter and browser hook**

```ts
// src/lib/office/workspaceAdapter.ts
import type { WorkspaceAgentRecord } from "@/lib/workspace-contract/types";
import type { OfficeAgent } from "@/features/retro-office/core/types";

export const mapWorkspaceAgentsToOfficeAgents = (
  agents: WorkspaceAgentRecord[],
): OfficeAgent[] =>
  agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    status:
      agent.status === "working"
        ? "working"
        : agent.status === "error"
        ? "error"
        : "idle",
    color: agent.health === "degraded" ? "#f59e0b" : "#60a5fa",
    item: agent.currentTask ?? agent.role,
  }));
```

```ts
// src/features/workspace/useWorkspaceBroker.ts
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/http";
import type { WorkspaceContract } from "@/lib/workspace-contract/types";

export const useWorkspaceBroker = () => {
  const [snapshot, setSnapshot] = useState<WorkspaceContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;
    fetchJson<WorkspaceContract>("/api/workspace")
      .then((next) => {
        if (!closed) setSnapshot(next);
      })
      .catch((err) => {
        if (!closed) setError(err instanceof Error ? err.message : "Failed to load workspace.");
      });

    const source = new EventSource("/api/workspace/events");
    source.onmessage = (event) => {
      try {
        setSnapshot(JSON.parse(event.data) as WorkspaceContract);
      } catch {}
    };
    source.onerror = () => setError("Workspace event stream disconnected.");

    return () => {
      closed = true;
      source.close();
    };
  }, []);

  return { snapshot, error };
};
```

- [ ] **Step 4: Wire broker mode into OfficeScreen and RetroOffice3D**

```tsx
// src/features/office/screens/OfficeScreen.tsx
import { useWorkspaceBroker } from "@/features/workspace/useWorkspaceBroker";
import { mapWorkspaceAgentsToOfficeAgents } from "@/lib/office/workspaceAdapter";

const WORKSPACE_BROKER_MODE = true;

export function OfficeScreen({ showOpenClawConsole = true }: OfficeScreenProps) {
  const { snapshot: workspaceSnapshot } = useWorkspaceBroker();
  const brokerOfficeAgents = useMemo(
    () => mapWorkspaceAgentsToOfficeAgents(workspaceSnapshot?.agents ?? []),
    [workspaceSnapshot],
  );

  const allVisibleAgents = WORKSPACE_BROKER_MODE ? brokerOfficeAgents : existingVisibleAgents;
  const showGatewayConnectOverlay =
    !WORKSPACE_BROKER_MODE &&
    connectPromptReady &&
    status === "disconnected" &&
    !agentsLoaded &&
    (shouldPromptForConnect || showDelayedGatewayConnectOverlay);

  return (
    <RetroOffice3D
      agents={allVisibleAgents}
      gatewayStatus={WORKSPACE_BROKER_MODE ? workspaceSnapshot?.broker.status ?? "idle" : status}
      officeTitle={WORKSPACE_BROKER_MODE ? "Broker Workspace" : officeTitle}
      showOpenClawConsole={showOpenClawConsole}
      /* keep existing props */
    />
  );
}
```

```tsx
// src/features/retro-office/RetroOffice3D.tsx
<div
  className="rounded-md border border-amber-600/30 bg-[#120a05]/80 px-3 py-2 text-[11px] text-amber-100/85"
  title={`Runtime: broker (${gatewayStatus})`}
>
  broker • {gatewayStatus}
</div>
```

- [ ] **Step 5: Verify the adapter test and targeted build surfaces**

Run: `npm run test -- --run tests/unit/workspaceAdapter.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: existing unrelated test-type failures may remain, but no new errors from `workspace-contract`, `workspace-broker`, `OfficeScreen`, or `RetroOffice3D`

Run: `npm run build`
Expected: successful Next build with the known optional `openclaw` warning only

- [ ] **Step 6: Commit**

```bash
git add src/lib/office/workspaceAdapter.ts src/features/workspace/useWorkspaceBroker.ts src/features/office/screens/OfficeScreen.tsx src/features/retro-office/RetroOffice3D.tsx tests/unit/workspaceAdapter.test.ts
git commit -m "Add broker-backed office mode"
```

## Task 6: Replace Command Nexus simulated runtime with broker-backed runtime truth

**Files:**
- Create: `../command-nexus-dashboard/src/lib/workspaceBrokerClient.js`
- Modify: `../command-nexus-dashboard/src/lib/dataProviders.js`
- Modify: `../command-nexus-dashboard/src/lib/useDashboardData.js`
- Modify: `../command-nexus-dashboard/src/components/RuntimeHeaderStrip.jsx`
- Modify: `../command-nexus-dashboard/src/components/SystemStatusPanel.jsx`

- [ ] **Step 1: Add a broker client in Command Nexus**

```js
// ../command-nexus-dashboard/src/lib/workspaceBrokerClient.js
const WORKSPACE_BROKER_URL = "http://127.0.0.1:3000/api/workspace";

export async function fetchWorkspaceBrokerSnapshot() {
  const response = await fetch(WORKSPACE_BROKER_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Workspace broker request failed with status ${response.status}.`);
  }
  return response.json();
}

export function mapWorkspaceToDashboardRuntime(snapshot) {
  const agents = Array.isArray(snapshot?.agents) ? snapshot.agents : [];
  return {
    agents: agents.map((agent) => ({
      id: agent.id,
      label: agent.name,
      status:
        agent.status === "working"
          ? "active"
          : agent.health === "degraded"
          ? "blocked"
          : agent.status === "offline"
          ? "not-connected"
          : "idle",
      task: agent.currentTask || agent.lastEvent || "Standing by",
      tools: agent.capabilities || [],
    })),
    runtimeStatus: {
      mode: "broker",
      syncStatus: snapshot?.broker?.status || "idle",
      syncLabel: snapshot?.broker?.status === "degraded" ? "Broker degraded" : "Broker active",
      adapterWarnings: snapshot?.broker?.lastError ? [snapshot.broker.lastError] : [],
      terminalMode: snapshot?.terminal?.available ? "broker-routed" : "broker-unavailable",
      brokerHealth: snapshot?.broker ?? null,
    },
  };
}
```

- [ ] **Step 2: Merge broker data into `getDashboardData`**

```js
// ../command-nexus-dashboard/src/lib/dataProviders.js
import { fetchWorkspaceBrokerSnapshot, mapWorkspaceToDashboardRuntime } from "./workspaceBrokerClient";

export async function getDashboardData() {
  const [liveSocial, liveYouTube, workspaceSnapshot] = await Promise.all([
    fetchSocialAnalytics(connectorState),
    fetchYouTubeData(),
    fetchWorkspaceBrokerSnapshot().catch(() => null),
  ]);

  const workspaceRuntime = mapWorkspaceToDashboardRuntime(workspaceSnapshot);

  return {
    ...existingData,
    runtimeAgents: workspaceRuntime.agents,
    runtimeStatus: {
      ...existingRuntimeStatus,
      ...workspaceRuntime.runtimeStatus,
    },
  };
}
```

- [ ] **Step 3: Swap the simulated runtime header to broker agents**

```jsx
// ../command-nexus-dashboard/src/components/RuntimeHeaderStrip.jsx
const { data } = useDashboardData();
const runtimeAgents = useMemo(
  () =>
    (data?.runtimeAgents || []).map((agent) => ({
      ...agent,
      runtimeTask: agent.task || "Standing by",
    })),
  [data],
);
```

```jsx
// ../command-nexus-dashboard/src/components/SystemStatusPanel.jsx
const brokerHealth = runtimeStatus.brokerHealth ?? null;

{
  title: "Runtime",
  items: [
    { label: "Mode", value: runtimeStatus.mode ?? "broker", tone: syncTone },
    { label: "Sync", value: runtimeStatus.syncLabel ?? "Broker active", tone: syncTone },
    { label: "Broker", value: brokerHealth?.status ?? "Unknown", tone: brokerHealth?.status === "degraded" ? "amber" : "lime" },
    { label: "Terminal", value: runtimeStatus.terminalMode ?? "broker-unavailable", tone: "violet" },
  ],
}
```

- [ ] **Step 4: Verify the dashboard build**

Run: `git -C ..\command-nexus-dashboard status --short`
Expected: only the five approved dashboard files are modified

Run: `npm --prefix ..\command-nexus-dashboard run build`
Expected: PASS

- [ ] **Step 5: Commit the dashboard-side runtime integration**

```bash
git -C ..\command-nexus-dashboard add src/lib/workspaceBrokerClient.js src/lib/dataProviders.js src/lib/useDashboardData.js src/components/RuntimeHeaderStrip.jsx src/components/SystemStatusPanel.jsx
git -C ..\command-nexus-dashboard commit -m "Use broker-backed runtime state"
```

## Task 7: End-to-end verification and cleanup

**Files:**
- Modify: `src/app/api/health/route.ts`
- Modify: `src/features/office/screens/OfficeScreen.tsx`
- Modify: `../command-nexus-dashboard/src/lib/dataProviders.js`

- [ ] **Step 1: Verify targeted Claw3D tests**

Run: `npm run test -- --run tests/unit/workspaceContractSchema.test.ts tests/unit/workspaceContractStore.test.ts tests/unit/workspaceBroker.test.ts tests/unit/workspaceActionsRoute.test.ts tests/unit/workspaceEventsRoute.test.ts tests/unit/workspaceAdapter.test.ts`
Expected: PASS

- [ ] **Step 2: Verify Claw3D runtime surfaces**

Run: `npm run build`
Expected: PASS with the known optional `openclaw` warning only

Run: `npm run dev`
Expected: local app starts on port `3000`

Manual checks:

- open `/office`
- confirm no OpenClaw connect overlay appears in broker mode
- confirm the bottom dock shows broker status
- confirm at least one broker-routed action transitions through `queued` and `routing`
- confirm a degraded adapter state surfaces visibly

- [ ] **Step 3: Verify Command Nexus sees the same truth**

Run: `npm --prefix ..\command-nexus-dashboard run build`
Expected: PASS

Manual checks:

- open Command Nexus
- confirm runtime header shows broker-backed agents instead of local simulated cycling
- confirm System Status shows broker health and terminal mode
- confirm the same agent/action state visible in Claw3D is reflected in Command Nexus

- [ ] **Step 4: Check staged file boundaries before final commits**

Run: `git status --short`
Expected: no unexpected Claw3D files staged

Run: `git -C ..\command-nexus-dashboard status --short`
Expected: no unexpected dashboard files staged

- [ ] **Step 5: Final commit if cleanup edits were needed**

```bash
git add src/app/api/health/route.ts src/features/office/screens/OfficeScreen.tsx
git commit -m "Polish broker workspace verification fixes"
```

## Self-Review

### Spec coverage

- Shared workspace contract: covered by Task 1 and Task 2
- Thin broker, policy seam, adapter routing, event stream: covered by Task 3 and Task 4
- Claw3D live workspace behavior without OpenClaw: covered by Task 5
- Command Nexus consuming the same truth: covered by Task 6
- Verification across both surfaces: covered by Task 7

### Placeholder scan

- No `TODO`, `TBD`, or deferred filler language remains in task steps.
- Each task names exact files and exact commands.
- Code steps include concrete code blocks instead of prose-only implementation instructions.

### Type consistency

- Contract lifecycle states are introduced in Task 1 and reused consistently in Task 3.
- `WorkspaceAgentRecord` is the source shape for both broker routes and the office adapter.
- `runtimeAgents` and `runtimeStatus` are the only new dashboard-side data provider fields referenced later.

