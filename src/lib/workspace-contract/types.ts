export type WorkspaceActionLifecycle =
  | "queued"
  | "routing"
  | "awaiting_executor"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkspaceAgentRecord = {
  id: string;
  name: string;
  role: string;
  repoPath: string | null;
  status: "idle" | "working" | "blocked" | "error" | "offline";
  intentState: WorkspaceActionLifecycle | null;
  currentTask: string | null;
  capabilities: string[];
  availableAutomations: string[];
  terminalTargets: string[];
  marketplaceScopes: string[];
  n8nFlows: string[];
  health: "healthy" | "degraded" | "offline";
  lastEvent: string | null;
  sceneProfile: {
    area: string;
    pose: string;
    attention: boolean;
  };
};

export type WorkspaceContract = {
  workspace: { id: string; label: string; schemaVersion: number; updatedAt: string };
  broker: {
    status: "idle" | "ready" | "degraded";
    adapterAvailability: Record<string, boolean>;
    lastHeartbeatAt: string | null;
    lastError: string | null;
  };
  agents: WorkspaceAgentRecord[];
  actions: Array<{
    id: string;
    agentId: string;
    type: string;
    target: string;
    lifecycle: WorkspaceActionLifecycle;
    createdAt: string;
    updatedAt: string;
    executor: string | null;
    resultSummary: string | null;
    errorSummary: string | null;
  }>;
  sessions: Array<{ id: string; agentId: string; label: string; status: string }>;
  terminal: {
    available: boolean;
    sessions: Array<{ id: string; title: string; status: string }>;
  };
  automations: { available: boolean; running: string[] };
  marketplace: { available: boolean; installs: Array<{ id: string; status: string }> };
  n8n: { available: boolean; runs: Array<{ id: string; status: string }> };
  scene: { focusAgentId: string | null; followAgentId: string | null; attentionAgentIds: string[] };
  history: Array<{ id: string; kind: string; message: string; createdAt: string }>;
};
