import { describe, expect, it } from "vitest";

import { resolveAgentSpawnMotion } from "@/features/retro-office/core/agentSpawnMotion";

describe("resolveAgentSpawnMotion", () => {
  it("routes new idle agents without assigned desks onto a roam target", () => {
    const result = resolveAgentSpawnMotion({
      effectiveStatus: "idle",
      spawnPoint: { x: 120, y: 180 },
      primaryTarget: null,
      roamTarget: { x: 360, y: 420 },
    });

    expect(result).toEqual({
      targetX: 360,
      targetY: 420,
      state: "walking",
    });
  });

  it("routes new working agents without assigned desks onto a roam target", () => {
    const result = resolveAgentSpawnMotion({
      effectiveStatus: "working",
      spawnPoint: { x: 140, y: 220 },
      primaryTarget: null,
      roamTarget: { x: 420, y: 340 },
    });

    expect(result).toEqual({
      targetX: 420,
      targetY: 340,
      state: "walking",
    });
  });

  it("keeps explicit desk targets when they exist", () => {
    const result = resolveAgentSpawnMotion({
      effectiveStatus: "working",
      spawnPoint: { x: 140, y: 220 },
      primaryTarget: { x: 200, y: 260 },
      roamTarget: { x: 420, y: 340 },
    });

    expect(result).toEqual({
      targetX: 200,
      targetY: 260,
      state: "walking",
    });
  });
});
