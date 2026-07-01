import type { OfficeAgent } from "@/features/retro-office/core/types";

type Point = {
  x: number;
  y: number;
};

export const resolveAgentSpawnMotion = ({
  effectiveStatus,
  spawnPoint,
  primaryTarget,
  roamTarget,
}: {
  effectiveStatus: OfficeAgent["status"];
  spawnPoint: Point;
  primaryTarget: Point | null;
  roamTarget: Point;
}): {
  targetX: number;
  targetY: number;
  state: "walking" | "standing";
} => {
  if (effectiveStatus === "error") {
    return {
      targetX: spawnPoint.x,
      targetY: spawnPoint.y,
      state: "standing",
    };
  }

  const target = primaryTarget ?? roamTarget;
  const shouldWalk =
    Math.hypot(target.x - spawnPoint.x, target.y - spawnPoint.y) > 0.001;

  return {
    targetX: target.x,
    targetY: target.y,
    state: shouldWalk ? "walking" : "standing",
  };
};
