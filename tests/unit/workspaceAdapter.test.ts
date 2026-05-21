import { describe, expect, it } from "vitest";

import { mapWorkspaceAgentsToOfficeAgents } from "@/lib/office/workspaceAdapter";
import type { WorkspaceAgentRecord } from "@/lib/workspace-contract/types";

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
