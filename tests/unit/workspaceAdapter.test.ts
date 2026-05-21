import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mapWorkspaceAgentsToOfficeAgents } from "@/lib/office/workspaceAdapter";
import type { WorkspaceAgentRecord } from "@/lib/workspace-contract/types";
import { useWorkspaceBroker } from "@/features/workspace/useWorkspaceBroker";
import { fetchJson } from "@/lib/http";

vi.mock("@/lib/http", () => ({
  fetchJson: vi.fn(),
}));

const mockedFetchJson = vi.mocked(fetchJson);

const makeAgent = (overrides: Partial<WorkspaceAgentRecord>): WorkspaceAgentRecord => ({
  id: "agent-1",
  name: "Agent One",
  role: "planner",
  repoPath: "/tmp/workspace",
  status: "idle",
  intentState: null,
  currentTask: null,
  capabilities: [],
  availableAutomations: [],
  terminalTargets: [],
  marketplaceScopes: [],
  n8nFlows: [],
  health: "healthy",
  lastEvent: null,
  sceneProfile: { area: "desk", pose: "standing", attention: false },
  ...overrides,
});

const makeSnapshot = (agents: WorkspaceAgentRecord[] = []) => ({
  workspace: {
    id: "primary",
    label: "Primary Workspace",
    schemaVersion: 1,
    updatedAt: "2026-05-21T00:00:00.000Z",
  },
  broker: {
    status: "ready" as const,
    adapterAvailability: {},
    lastHeartbeatAt: null,
    lastError: null,
  },
  agents,
  actions: [],
  sessions: [],
  terminal: { available: false, sessions: [] },
  automations: { available: false, running: [] },
  marketplace: { available: false, installs: [] },
  n8n: { available: false, runs: [] },
  scene: { focusAgentId: null, followAgentId: null, attentionAgentIds: [] },
  history: [],
});

class MockEventSource {
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];

  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readyState = 0;
  url: string;
  close = vi.fn(() => {
    this.readyState = MockEventSource.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  MockEventSource.instances = [];
});

describe("workspace adapter", () => {
  it("maps a workspace agent into an office agent with normalized status", () => {
    const [officeAgent] = mapWorkspaceAgentsToOfficeAgents([
      makeAgent({
        id: "agent-working",
        name: "Ada",
        status: "working",
        health: "healthy",
        currentTask: "Review launch checklist",
      }),
    ]);

    expect(officeAgent).toMatchObject({
      id: "agent-working",
      name: "Ada",
      status: "working",
      subtitle: "Review launch checklist",
      item: "Review launch checklist",
    });
    expect(officeAgent?.color).toBe("#22c55e");
  });

  it("maps degraded health to an error office agent", () => {
    const [officeAgent] = mapWorkspaceAgentsToOfficeAgents([
      makeAgent({
        id: "agent-degraded",
        name: "Babbage",
        status: "idle",
        health: "degraded",
        lastEvent: "Gateway latency rising",
      }),
    ]);

    expect(officeAgent).toMatchObject({
      id: "agent-degraded",
      name: "Babbage",
      status: "error",
      subtitle: "Gateway latency rising",
      item: "Gateway latency rising",
    });
  });
});

describe("useWorkspaceBroker", () => {
  it("loads the workspace, subscribes to events, ignores malformed events, and closes on unmount", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const initialSnapshot = makeSnapshot([
      makeAgent({ id: "initial", name: "Initial" }),
    ]);
    const eventSnapshot = makeSnapshot([
      makeAgent({ id: "event", name: "Event Agent" }),
    ]);
    mockedFetchJson.mockResolvedValue(initialSnapshot);

    const { result, unmount } = renderHook(() => useWorkspaceBroker());

    await waitFor(() => {
      expect(result.current.snapshot?.agents[0]?.id).toBe("initial");
    });

    expect(MockEventSource.instances).toHaveLength(1);
    const eventSource = MockEventSource.instances[0]!;
    expect(eventSource.url).toBe("/api/workspace/events");

    act(() => {
      eventSource.onmessage?.({ data: "{broken" } as MessageEvent<string>);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.snapshot?.agents[0]?.id).toBe("initial");

    act(() => {
      eventSource.onmessage?.({
        data: JSON.stringify(eventSnapshot),
      } as MessageEvent<string>);
    });

    await waitFor(() => {
      expect(result.current.snapshot?.agents[0]?.id).toBe("event");
    });

    unmount();
    expect(eventSource.close).toHaveBeenCalledTimes(1);
  });
});
