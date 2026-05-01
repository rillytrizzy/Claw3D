import type {
  CryptoRoomRoute,
  FacingPoint,
  FurnitureItem,
} from "@/features/retro-office/core/types";

// Bounding box of the data-driven crypto room as authored in furnitureDefaults.
// The room is in the upper-left quadrant of the canvas (x: 260-438, y: 40-270),
// and is entered through a door at (x: 420-460, y: 150) opening to the east hall.
const CRYPTO_ROOM_BOUNDS = {
  minX: 260,
  maxX: 438,
  minY: 40,
  maxY: 270,
} as const;

export const CRYPTO_ROOM_DEFAULT_TARGET: FacingPoint = {
  x: 313,
  y: 200,
  facing: 0,
};

const CRYPTO_ROOM_DOOR_OUTER_TARGET: FacingPoint = {
  x: 478,
  y: 168,
  facing: Math.PI,
};

const CRYPTO_ROOM_DOOR_INNER_TARGET: FacingPoint = {
  x: 410,
  y: 168,
  facing: Math.PI,
};

const DOOR_APPROACH_RADIUS = 64;
const DOOR_INNER_SNAP_RADIUS = 22;

const isInsideRoom = (x: number, y: number): boolean =>
  x >= CRYPTO_ROOM_BOUNDS.minX &&
  x <= CRYPTO_ROOM_BOUNDS.maxX &&
  y >= CRYPTO_ROOM_BOUNDS.minY &&
  y <= CRYPTO_ROOM_BOUNDS.maxY;

export const resolveCryptoRoomRoute = (
  x: number,
  y: number,
  stationTarget: FacingPoint = CRYPTO_ROOM_DEFAULT_TARGET,
): CryptoRoomRoute => {
  const insideRoom =
    isInsideRoom(x, y) ||
    Math.hypot(
      x - CRYPTO_ROOM_DOOR_INNER_TARGET.x,
      y - CRYPTO_ROOM_DOOR_INNER_TARGET.y,
    ) < DOOR_INNER_SNAP_RADIUS;
  if (insideRoom) {
    return {
      stage: "terminal",
      targetX: stationTarget.x,
      targetY: stationTarget.y,
      facing: stationTarget.facing,
    };
  }

  const withinDoorThreshold =
    Math.hypot(
      x - CRYPTO_ROOM_DOOR_OUTER_TARGET.x,
      y - CRYPTO_ROOM_DOOR_OUTER_TARGET.y,
    ) < DOOR_APPROACH_RADIUS;
  if (withinDoorThreshold) {
    return {
      stage: "door_inner",
      targetX: CRYPTO_ROOM_DOOR_INNER_TARGET.x,
      targetY: CRYPTO_ROOM_DOOR_INNER_TARGET.y,
      facing: CRYPTO_ROOM_DOOR_INNER_TARGET.facing,
    };
  }

  return {
    stage: "door_outer",
    targetX: CRYPTO_ROOM_DOOR_OUTER_TARGET.x,
    targetY: CRYPTO_ROOM_DOOR_OUTER_TARGET.y,
    facing: CRYPTO_ROOM_DOOR_OUTER_TARGET.facing,
  };
};

export const getCryptoTerminalLocation = (
  items: FurnitureItem[],
): FacingPoint | null => {
  // Pick the first crypto_terminal in the authored room. The agent stands one tile
  // in front of the terminal facing it. Terminal facing 0/180 means the screen is
  // along the y-axis, so the agent stands offset along y; facing 90/270 means the
  // screen is along the x-axis, so the agent stands offset along x.
  const terminal = items.find((item) => item.type === "crypto_terminal");
  if (!terminal) return null;
  const facingDeg = ((terminal.facing ?? 0) % 360 + 360) % 360;
  const facingRad = (facingDeg * Math.PI) / 180;
  const offset = 28;
  // The data uses degrees with 0 = north, 90 = east. We want a standing point in
  // FRONT of the terminal screen; the screen faces the same direction as the item.
  const standX = terminal.x + 16 + Math.sin(facingRad + Math.PI) * offset;
  const standY = terminal.y + 16 + Math.cos(facingRad + Math.PI) * -offset;
  return {
    x: Math.max(
      CRYPTO_ROOM_BOUNDS.minX + 16,
      Math.min(CRYPTO_ROOM_BOUNDS.maxX - 16, standX),
    ),
    y: Math.max(
      CRYPTO_ROOM_BOUNDS.minY + 16,
      Math.min(CRYPTO_ROOM_BOUNDS.maxY - 16, standY),
    ),
    facing: facingRad,
  };
};
