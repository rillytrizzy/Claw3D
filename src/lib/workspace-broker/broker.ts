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
import type {
  WorkspaceAgentRecord,
  WorkspaceContract,
} from "@/lib/workspace-contract/types";

type WorkspaceActionRecord = WorkspaceContract["actions"][number];

const WORKSPACE_ADAPTER_KEYS: WorkspaceAdapterKey[] = [
  "repo",
  "terminal",
  "automation",
  "marketplace",
  "n8n",
];

// Canonical office roster — the AI team. Seeded when the persisted contract is
// empty so the roster survives a contract reset (persistence in code).
const createDefaultWorkspaceAgents = (workspaceRoot: string): WorkspaceAgentRecord[] => [
  {
    id: "agent-hermes",
    name: "Hermes",
    role: "gateway",
    repoPath: workspaceRoot,
    status: "working",
    intentState: "running",
    currentTask: "RTOS gateway live on :18789 (6 hooks)",
    capabilities: ["terminal.open", "automation.run", "n8n.trigger"],
    availableAutomations: ["workspace-refresh"],
    terminalTargets: ["workspace-shell"],
    marketplaceScopes: ["local-tools"],
    n8nFlows: ["daily-sync"],
    health: "healthy",
    lastEvent: "Adapter health ok — 6 RTOS hooks registered",
    sceneProfile: { area: "ops", pose: "standing", attention: false },
  },
  {
    id: "agent-claude-code",
    name: "Claude Code",
    role: "builder",
    repoPath: workspaceRoot,
    status: "working",
    intentState: "running",
    currentTask: "Implementation / codebase work",
    capabilities: ["repo.run", "terminal.open"],
    availableAutomations: ["local-script"],
    terminalTargets: ["workspace-shell"],
    marketplaceScopes: [],
    n8nFlows: [],
    health: "healthy",
    lastEvent: "Broker roster loaded",
    sceneProfile: { area: "builder", pose: "standing", attention: false },
  },
  {
    id: "agent-codex",
    name: "Codex",
    role: "code-writer",
    repoPath: workspaceRoot,
    status: "idle",
    intentState: null,
    currentTask: "Vault git writer / script execution — standing by",
    capabilities: ["repo.run"],
    availableAutomations: ["local-script"],
    terminalTargets: [],
    marketplaceScopes: [],
    n8nFlows: [],
    health: "healthy",
    lastEvent: "Broker roster loaded",
    sceneProfile: { area: "builder", pose: "standing", attention: false },
  },
  {
    id: "agent-agy",
    name: "Agy",
    role: "scribe",
    repoPath: null,
    status: "idle",
    intentState: null,
    currentTask: "Gemini scribe — documentation sync",
    capabilities: [],
    availableAutomations: [],
    terminalTargets: [],
    marketplaceScopes: [],
    n8nFlows: [],
    health: "healthy",
    lastEvent: "Broker roster loaded",
    sceneProfile: { area: "automation", pose: "standing", attention: false },
  },
  {
    id: "agent-claude",
    name: "Claude",
    role: "planner",
    repoPath: null,
    status: "idle",
    intentState: null,
    currentTask: "Planning & AFK steering",
    capabilities: [],
    availableAutomations: [],
    terminalTargets: [],
    marketplaceScopes: [],
    n8nFlows: [],
    health: "healthy",
    lastEvent: "Broker roster loaded",
    sceneProfile: { area: "workspace", pose: "standing", attention: false },
  },
  {
    id: "agent-chatgpt",
    name: "ChatGPT",
    role: "assistant",
    repoPath: null,
    status: "idle",
    intentState: null,
    currentTask: "Assistant — presence (wire via custom runtime to activate)",
    capabilities: [],
    availableAutomations: [],
    terminalTargets: [],
    marketplaceScopes: [],
    n8nFlows: [],
    health: "healthy",
    lastEvent: "Broker roster loaded",
    sceneProfile: { area: "workspace", pose: "standing", attention: false },
  },
  {
    id: "agent-gemini",
    name: "Gemini",
    role: "research",
    repoPath: null,
    status: "idle",
    intentState: null,
    currentTask: "Research — presence (wire via custom runtime to activate)",
    capabilities: [],
    availableAutomations: [],
    terminalTargets: [],
    marketplaceScopes: [],
    n8nFlows: [],
    health: "healthy",
    lastEvent: "Broker roster loaded",
    sceneProfile: { area: "workspace", pose: "standing", attention: false },
  },
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
  workspaceRoot: string,
): WorkspaceContract => ({
  ...snapshot,
  agents:
    snapshot.agents.length > 0
      ? snapshot.agents
      : createDefaultWorkspaceAgents(workspaceRoot),
  broker: {
    ...snapshot.broker,
    adapterAvailability: {
      ...snapshot.broker.adapterAvailability,
      ...createAdapterAvailability(adapterMap),
    },
  },
});

const createFallbackAgent = (
  agentId: string,
  workspaceRoot: string,
): WorkspaceAgentRecord => ({
  id: agentId,
  name: agentId,
  role: "workspace-agent",
  repoPath: workspaceRoot,
  status: "idle",
  intentState: null,
  currentTask: null,
  capabilities: [],
  availableAutomations: [],
  terminalTargets: [],
  marketplaceScopes: [],
  n8nFlows: [],
  health: "healthy",
  lastEvent: null,
  sceneProfile: { area: "workspace", pose: "standing", attention: false },
});

const statusForLifecycle = (
  lifecycle: WorkspaceActionRecord["lifecycle"],
): WorkspaceAgentRecord["status"] => {
  if (lifecycle === "failed") return "error";
  if (lifecycle === "succeeded" || lifecycle === "cancelled") return "idle";
  return "working";
};

const updateAgentForAction = ({
  agents,
  action,
  workspaceRoot,
  eventText,
}: {
  agents: WorkspaceAgentRecord[];
  action: WorkspaceActionRecord;
  workspaceRoot: string;
  eventText: string;
}): WorkspaceAgentRecord[] => {
  const existingAgents = agents.some((agent) => agent.id === action.agentId)
    ? agents
    : [...agents, createFallbackAgent(action.agentId, workspaceRoot)];

  return existingAgents.map((agent) => {
    if (agent.id !== action.agentId) return agent;
    return {
      ...agent,
      status: statusForLifecycle(action.lifecycle),
      intentState: action.lifecycle,
      currentTask: `${action.type}: ${action.target}`,
      health: action.lifecycle === "failed" ? "degraded" : "healthy",
      lastEvent: eventText,
      sceneProfile: {
        ...agent.sceneProfile,
        attention: action.lifecycle === "failed",
      },
    };
  });
};

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
    workspaceRoot,
  );

  const persist = () => {
    snapshot = saveWorkspaceContract({ workspaceRoot, contract: snapshot });
    eventBus.publish(snapshot);
    return snapshot;
  };

  const transitionAction = (
    actionId: string,
    updater: (action: WorkspaceActionRecord) => WorkspaceActionRecord,
    eventText: string,
  ): WorkspaceActionRecord => {
    const actions = replaceAction(snapshot.actions, actionId, updater);
    const updatedAction = findAction(actions, actionId);

    snapshot = {
      ...snapshot,
      actions,
      agents: updateAgentForAction({
        agents: snapshot.agents,
        action: updatedAction,
        workspaceRoot,
        eventText,
      }),
    };
    persist();
    return updatedAction;
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
      snapshot = {
        ...snapshot,
        agents: updateAgentForAction({
          agents: snapshot.agents,
          action,
          workspaceRoot,
          eventText: `Queued ${input.type} for ${input.target}`,
        }),
      };
      persist();

      try {
        transitionAction(
          action.id,
          (current) => ({
            ...current,
            lifecycle: "routing",
            updatedAt: new Date().toISOString(),
          }),
          `Routing ${input.type} to ${input.adapter}`,
        );

        const adapter = adapterMap[input.adapter];
        if (!adapter) {
          throw new Error(`Missing adapter: ${input.adapter}`);
        }

        const result = await adapter(input);
        const completedAction = transitionAction(
          action.id,
          (current) => ({
            ...current,
            lifecycle: result.lifecycle,
            executor: result.executor,
            resultSummary: result.resultSummary,
            updatedAt: new Date().toISOString(),
          }),
          result.resultSummary ?? `${input.type} ${result.lifecycle}`,
        );
        return completedAction;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown broker failure";
        snapshot = {
          ...snapshot,
          actions: replaceAction(snapshot.actions, action.id, (current) => ({
            ...current,
            lifecycle: "failed",
            errorSummary: message,
            updatedAt: new Date().toISOString(),
          })),
          broker: {
            ...snapshot.broker,
            status: "degraded",
            lastError: message,
          },
        };
        const failedAction = findAction(snapshot.actions, action.id);
        snapshot = {
          ...snapshot,
          agents: updateAgentForAction({
            agents: snapshot.agents,
            action: failedAction,
            workspaceRoot,
            eventText: message,
          }),
        };
        persist();
        throw error;
      }
    },
  };
};
