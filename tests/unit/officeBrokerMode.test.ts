import { describe, expect, it } from "vitest";

import { createFloorRosterCache } from "@/lib/office/floorRoster";
import {
  resolveBrokerActiveFloorId,
  resolveOfficeBrokerModeState,
} from "@/features/office/screens/officeBrokerMode";
import type { AgentStoreSeed } from "@/features/agents/state/store";

const makeSeed = (overrides: Partial<AgentStoreSeed> = {}): AgentStoreSeed => ({
  agentId: "agent-terminal",
  name: "Terminal Operator",
  runtimeName: "Claw3D Broker",
  identityName: "Terminal Operator",
  sessionDisplayName: "Terminal Operator",
  role: "terminal-control",
  sessionKey: "workspace:agent-terminal",
  avatarSeed: "agent-terminal",
  avatarProfile: null,
  model: "terminal.open",
  thinkingLevel: "healthy",
  toolCallingEnabled: true,
  showThinkingTraces: false,
  ...overrides,
});

describe("resolveOfficeBrokerModeState", () => {
  it("pins the floor nav to the claw3d adapter and injects broker roster state", () => {
    const result = resolveOfficeBrokerModeState({
      brokerMode: true,
      activeFloorId: "claw3d-runtime",
      floorRosterCache: createFloorRosterCache(),
      brokerAgentSeeds: [makeSeed()],
      selectedAdapterType: "openclaw",
    });

    expect(result.navAdapterType).toBe("claw3d");
    expect(result.floorRosterCache["claw3d-runtime"]).toMatchObject({
      floorId: "claw3d-runtime",
      provider: "claw3d",
      status: "loaded",
      selectedAgentId: "agent-terminal",
    });
    expect(result.floorRosterCache["claw3d-runtime"]?.entries).toHaveLength(1);
  });

  it("leaves the existing floor nav state untouched outside broker mode", () => {
    const initialCache = createFloorRosterCache();
    const result = resolveOfficeBrokerModeState({
      brokerMode: false,
      activeFloorId: "lobby",
      floorRosterCache: initialCache,
      brokerAgentSeeds: [makeSeed()],
      selectedAdapterType: "openclaw",
    });

    expect(result.navAdapterType).toBe("openclaw");
    expect(result.floorRosterCache).toBe(initialCache);
  });
});

describe("resolveBrokerActiveFloorId", () => {
  it("pins broker mode to the claw3d runtime floor regardless of saved preference", () => {
    expect(resolveBrokerActiveFloorId(true, "lobby")).toBe("claw3d-runtime");
    expect(resolveBrokerActiveFloorId(true, "openclaw-ground")).toBe("claw3d-runtime");
  });

  it("preserves the saved floor outside broker mode", () => {
    expect(resolveBrokerActiveFloorId(false, "openclaw-ground")).toBe("openclaw-ground");
  });
});
