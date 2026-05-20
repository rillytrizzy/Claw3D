import type {
  WorkspaceActionLifecycle,
  WorkspaceContract,
} from "@/lib/workspace-contract/types";

const LIFECYCLE_ORDER: WorkspaceActionLifecycle[] = [
  "queued",
  "routing",
  "awaiting_executor",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const normalizeActionLifecycle = (value: unknown): WorkspaceActionLifecycle =>
  LIFECYCLE_ORDER.includes(value as WorkspaceActionLifecycle)
    ? (value as WorkspaceActionLifecycle)
    : "queued";

const getLifecycleRank = (value: WorkspaceActionLifecycle): number =>
  LIFECYCLE_ORDER.indexOf(value);

const normalizeWorkspaceAction = (
  value: unknown,
  fallbackUpdatedAt: string,
): NonNullable<WorkspaceContract["actions"][number]> | null => {
  if (!isRecord(value)) return null;

  const id = asString(value.id).trim();
  const agentId = asString(value.agentId).trim();
  const type = asString(value.type).trim();
  const target = asString(value.target).trim();
  if (!id || !agentId || !type || !target) return null;

  return {
    id,
    agentId,
    type,
    target,
    lifecycle: normalizeActionLifecycle(value.lifecycle),
    createdAt: asString(value.createdAt).trim() || fallbackUpdatedAt,
    updatedAt: asString(value.updatedAt).trim() || fallbackUpdatedAt,
    executor: asString(value.executor).trim() || null,
    resultSummary: asString(value.resultSummary).trim() || null,
    errorSummary: asString(value.errorSummary).trim() || null,
  };
};

export const reduceActionLifecycle = (
  current: WorkspaceActionLifecycle,
  next: string,
): WorkspaceActionLifecycle => {
  const nextLifecycle = normalizeActionLifecycle(next);
  return getLifecycleRank(nextLifecycle) > getLifecycleRank(current)
    ? nextLifecycle
    : current;
};

export const createDefaultWorkspaceContract = (
  workspaceId: string,
): WorkspaceContract => ({
  workspace: {
    id: workspaceId,
    label: "Primary Workspace",
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  },
  broker: {
    status: "idle",
    adapterAvailability: {},
    lastHeartbeatAt: null,
    lastError: null,
  },
  agents: [],
  actions: [],
  sessions: [],
  terminal: { available: false, sessions: [] },
  automations: { available: false, running: [] },
  marketplace: { available: false, installs: [] },
  n8n: { available: false, runs: [] },
  scene: { focusAgentId: null, followAgentId: null, attentionAgentIds: [] },
  history: [],
});

export const normalizeWorkspaceContract = (value: unknown): WorkspaceContract => {
  const base = createDefaultWorkspaceContract("primary");
  const input = isRecord(value) ? (value as Partial<WorkspaceContract>) : {};

  return {
    ...base,
    ...input,
    workspace: {
      ...base.workspace,
      ...(input.workspace ?? {}),
      id: asString(input.workspace?.id, base.workspace.id).trim() || base.workspace.id,
    },
    broker: { ...base.broker, ...(input.broker ?? {}) },
    agents: Array.isArray(input.agents) ? input.agents : [],
    actions: Array.isArray(input.actions)
      ? input.actions.flatMap((action) => {
          const normalized = normalizeWorkspaceAction(
            action,
            base.workspace.updatedAt,
          );
          return normalized ? [normalized] : [];
        })
      : [],
    sessions: Array.isArray(input.sessions) ? input.sessions : [],
    terminal: {
      ...base.terminal,
      ...(input.terminal ?? {}),
      sessions: Array.isArray(input.terminal?.sessions) ? input.terminal.sessions : [],
    },
    automations: {
      ...base.automations,
      ...(input.automations ?? {}),
      running: Array.isArray(input.automations?.running)
        ? input.automations.running
        : [],
    },
    marketplace: {
      ...base.marketplace,
      ...(input.marketplace ?? {}),
      installs: Array.isArray(input.marketplace?.installs)
        ? input.marketplace.installs
        : [],
    },
    n8n: {
      ...base.n8n,
      ...(input.n8n ?? {}),
      runs: Array.isArray(input.n8n?.runs) ? input.n8n.runs : [],
    },
    scene: {
      ...base.scene,
      ...(input.scene ?? {}),
      focusAgentId: input.scene?.focusAgentId ?? null,
      followAgentId: input.scene?.followAgentId ?? null,
      attentionAgentIds: Array.isArray(input.scene?.attentionAgentIds)
        ? input.scene.attentionAgentIds
        : [],
    },
    history: Array.isArray(input.history) ? input.history : [],
  };
};
