import type { WorkspaceContract } from "@/lib/workspace-contract/types";

import type { WorkspaceBrokerSnapshotListener } from "@/lib/workspace-broker/types";

export const createWorkspaceEventBus = () => {
  const listeners = new Set<WorkspaceBrokerSnapshotListener>();

  return {
    publish(snapshot: WorkspaceContract) {
      listeners.forEach((listener) => listener(snapshot));
    },
    subscribe(listener: WorkspaceBrokerSnapshotListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
