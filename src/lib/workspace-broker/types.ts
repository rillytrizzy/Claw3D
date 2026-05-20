import type {
  WorkspaceActionLifecycle,
  WorkspaceContract,
} from "@/lib/workspace-contract/types";

export type WorkspaceAdapterKey =
  | "repo"
  | "terminal"
  | "automation"
  | "marketplace"
  | "n8n";

export type WorkspaceBrokerActionInput = {
  agentId: string;
  type: string;
  target: string;
  adapter: WorkspaceAdapterKey;
  payload?: Record<string, unknown>;
};

export type WorkspaceAdapterResult = {
  executor: string;
  lifecycle: Extract<
    WorkspaceActionLifecycle,
    "awaiting_executor" | "running" | "succeeded"
  >;
  resultSummary: string | null;
};

export type WorkspaceAdapter = (
  input: WorkspaceBrokerActionInput,
) => Promise<WorkspaceAdapterResult>;

export type WorkspaceAdapterMap = Record<WorkspaceAdapterKey, WorkspaceAdapter>;

export type WorkspaceBrokerSnapshotListener = (
  snapshot: WorkspaceContract,
) => void;

export type WorkspaceBroker = {
  getSnapshot(): WorkspaceContract;
  runAction(
    input: WorkspaceBrokerActionInput,
  ): Promise<WorkspaceContract["actions"][number]>;
  subscribe(listener: WorkspaceBrokerSnapshotListener): () => void;
};
