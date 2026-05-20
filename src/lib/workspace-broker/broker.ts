import { randomUUID } from "@/lib/uuid";
import { defaultWorkspaceAdapters } from "@/lib/workspace-broker/adapters";
import { createWorkspaceEventBus } from "@/lib/workspace-broker/eventBus";
import type {
  WorkspaceAdapter,
  WorkspaceAdapterKey,
  WorkspaceAdapterMap,
  WorkspaceBroker,
  WorkspaceBrokerActionInput,
} from "@/lib/workspace-broker/types";
import { loadWorkspaceContract, saveWorkspaceContract } from "@/lib/workspace-contract/store";
import type { WorkspaceContract } from "@/lib/workspace-contract/types";

type WorkspaceActionRecord = WorkspaceContract["actions"][number];

const WORKSPACE_ADAPTER_KEYS: WorkspaceAdapterKey[] = [
  "repo",
  "terminal",
  "automation",
  "marketplace",
  "n8n",
];

const createAdapterAvailability = (
  adapterMap: WorkspaceAdapterMap,
): Record<string, boolean> =>
  Object.fromEntries(
    WORKSPACE_ADAPTER_KEYS.map((key) => [key, typeof adapterMap[key] === "function"]),
  );

const createQueuedAction = (
  input: WorkspaceBrokerActionInput,
  createdAt: string,
): WorkspaceActionRecord => ({
  id: randomUUID(),
  agentId: input.agentId,
  type: input.type,
  target: input.target,
  lifecycle: "queued",
  createdAt,
  updatedAt: createdAt,
  executor: null,
  resultSummary: null,
  errorSummary: null,
});

const replaceAction = (
  actions: WorkspaceContract["actions"],
  actionId: string,
  updater: (action: WorkspaceActionRecord) => WorkspaceActionRecord,
): WorkspaceContract["actions"] =>
  actions.map((action) => (action.id === actionId ? updater(action) : action));

const findAction = (
  actions: WorkspaceContract["actions"],
  actionId: string,
): WorkspaceActionRecord => {
  const action = actions.find((entry) => entry.id === actionId);
  if (!action) {
    throw new Error(`Action not found: ${actionId}`);
  }
  return action;
};

const mergeAdapterState = (
  snapshot: WorkspaceContract,
  adapterMap: WorkspaceAdapterMap,
): WorkspaceContract => ({
  ...snapshot,
  broker: {
    ...snapshot.broker,
    adapterAvailability: {
      ...snapshot.broker.adapterAvailability,
      ...createAdapterAvailability(adapterMap),
    },
  },
});

export const createWorkspaceBroker = ({
  workspaceRoot,
  adapters = {},
}: {
  workspaceRoot: string;
  adapters?: Partial<Record<WorkspaceAdapterKey, WorkspaceAdapter>>;
}): WorkspaceBroker => {
  const adapterMap: WorkspaceAdapterMap = {
    ...defaultWorkspaceAdapters,
    ...adapters,
  };
  const eventBus = createWorkspaceEventBus();
  let snapshot = mergeAdapterState(
    loadWorkspaceContract({ workspaceRoot }),
    adapterMap,
  );

  const persist = () => {
    snapshot = saveWorkspaceContract({ workspaceRoot, contract: snapshot });
    eventBus.publish(snapshot);
    return snapshot;
  };

  const mutateAction = (
    actionId: string,
    updater: (action: WorkspaceActionRecord) => WorkspaceActionRecord,
  ): WorkspaceActionRecord => {
    snapshot = {
      ...snapshot,
      actions: replaceAction(snapshot.actions, actionId, updater),
    };
    persist();
    return findAction(snapshot.actions, actionId);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: eventBus.subscribe,
    async runAction(input) {
      const createdAt = new Date().toISOString();
      const action = createQueuedAction(input, createdAt);

      snapshot = {
        ...snapshot,
        broker: {
          ...snapshot.broker,
          status: "ready",
          lastHeartbeatAt: createdAt,
          lastError: null,
        },
        actions: [action, ...snapshot.actions],
      };
      persist();

      try {
        mutateAction(action.id, (current) => ({
          ...current,
          lifecycle: "routing",
          updatedAt: new Date().toISOString(),
        }));

        const adapter = adapterMap[input.adapter];
        if (!adapter) {
          throw new Error(`Missing adapter: ${input.adapter}`);
        }

        const result = await adapter(input);
        return mutateAction(action.id, (current) => ({
          ...current,
          lifecycle: result.lifecycle,
          executor: result.executor,
          resultSummary: result.resultSummary,
          updatedAt: new Date().toISOString(),
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown broker failure";
        mutateAction(action.id, (current) => ({
          ...current,
          lifecycle: "failed",
          errorSummary: message,
          updatedAt: new Date().toISOString(),
        }));
        snapshot = {
          ...snapshot,
          broker: {
            ...snapshot.broker,
            status: "degraded",
            lastError: message,
          },
        };
        persist();
        throw error;
      }
    },
  };
};
