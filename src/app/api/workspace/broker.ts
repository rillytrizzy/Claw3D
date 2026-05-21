import path from "node:path";

import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";
import type { WorkspaceBroker } from "@/lib/workspace-broker/types";

const WORKSPACE_BROKER_STORE_KEY = "__claw3dWorkspaceBrokerStore";

type WorkspaceBrokerStore = Map<string, WorkspaceBroker>;

const getWorkspaceBrokerStore = () => {
  const globalScope = globalThis as typeof globalThis & {
    [WORKSPACE_BROKER_STORE_KEY]?: WorkspaceBrokerStore;
  };

  if (!globalScope[WORKSPACE_BROKER_STORE_KEY]) {
    globalScope[WORKSPACE_BROKER_STORE_KEY] = new Map();
  }

  return globalScope[WORKSPACE_BROKER_STORE_KEY];
};

export const getWorkspaceBroker = (workspaceRoot = process.cwd()) => {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const brokerStore = getWorkspaceBrokerStore();
  const existingBroker = brokerStore.get(resolvedWorkspaceRoot);

  if (existingBroker) {
    return existingBroker;
  }

  const broker = createWorkspaceBroker({
    workspaceRoot: resolvedWorkspaceRoot,
  });

  brokerStore.set(resolvedWorkspaceRoot, broker);
  return broker;
};
