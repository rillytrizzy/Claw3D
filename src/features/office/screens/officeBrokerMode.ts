import type { AgentStoreSeed } from "@/features/agents/state/store";
import {
  buildFloorRosterState,
  type FloorRosterState,
} from "@/lib/office/floorRoster";
import type { FloorId, FloorProvider } from "@/lib/office/floors";
import type { StudioGatewayAdapterType } from "@/lib/studio/settings";

export const resolveOfficeBrokerModeState = ({
  brokerMode,
  activeFloorId,
  floorRosterCache,
  brokerAgentSeeds,
  selectedAdapterType,
}: {
  brokerMode: boolean;
  activeFloorId: FloorId;
  floorRosterCache: Record<FloorId, FloorRosterState>;
  brokerAgentSeeds: AgentStoreSeed[];
  selectedAdapterType: StudioGatewayAdapterType;
}): {
  floorRosterCache: Record<FloorId, FloorRosterState>;
  navAdapterType: FloorProvider | null;
} => {
  if (!brokerMode) {
    return {
      floorRosterCache,
      navAdapterType: selectedAdapterType as FloorProvider,
    };
  }

  return {
    floorRosterCache: {
      ...floorRosterCache,
      [activeFloorId]: buildFloorRosterState({
        floorId: activeFloorId,
        hydratedAt: Date.now(),
        result: {
          seeds: brokerAgentSeeds,
          suggestedSelectedAgentId: brokerAgentSeeds[0]?.agentId ?? null,
        },
      }),
    },
    navAdapterType: "claw3d",
  };
};

export const resolveBrokerActiveFloorId = (
  brokerMode: boolean,
  floorId: FloorId,
): FloorId => (brokerMode ? "claw3d-runtime" : floorId);
