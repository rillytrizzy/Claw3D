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

  it("ignores malformed action entries and normalizes unknown lifecycle states back to queued", () => {
    const contract = normalizeWorkspaceContract({
      workspace: { id: "primary" },
      actions: [
        null,
        {
          id: "a1",
          agentId: "alpha",
          type: "dispatch",
          target: "workspace",
          lifecycle: "weird-state",
        },
      ],
    });

    expect(contract.actions).toHaveLength(1);
    expect(contract.actions[0]?.lifecycle).toBe("queued");
  });

  it("excludes incomplete object-shaped action entries", () => {
    const contract = normalizeWorkspaceContract({
      workspace: { id: "primary" },
      actions: [
        {
          id: "a1",
          agentId: "alpha",
          lifecycle: "running",
        },
      ],
    });

    expect(contract.actions).toEqual([]);
  });

  it("reduces hybrid lifecycle transitions deterministically without regressing", () => {
    expect(reduceActionLifecycle("queued", "routing")).toBe("routing");
    expect(reduceActionLifecycle("routing", "running")).toBe("running");
    expect(reduceActionLifecycle("running", "succeeded")).toBe("succeeded");
    expect(reduceActionLifecycle("succeeded", "running")).toBe("succeeded");
  });
});
