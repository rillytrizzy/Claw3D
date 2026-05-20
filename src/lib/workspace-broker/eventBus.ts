import type { WorkspaceContract } from "@/lib/workspace-contract/types";

import type { WorkspaceBrokerSnapshotListener } from "@/lib/workspace-broker/types";

export const createWorkspaceEventBus = () => {
  const listeners = new Set<WorkspaceBrokerSnapshotListener>();

  return {
    publish(snapshot: WorkspaceContract) {
      const currentListeners = Array.from(listeners);
      currentListeners.forEach((listener) => {
        try {
          listener(snapshot);
        } catch {
          // Listener failures must not affect broker persistence or lifecycle.
        }
      });
    },
    subscribe(listener: WorkspaceBrokerSnapshotListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
