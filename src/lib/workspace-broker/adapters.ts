import type {
  WorkspaceAdapterMap,
  WorkspaceBrokerActionInput,
} from "@/lib/workspace-broker/types";

const summarizeTarget = (
  prefix: string,
  input: WorkspaceBrokerActionInput,
): string => `${prefix} ${input.target}`;

export const defaultWorkspaceAdapters: WorkspaceAdapterMap = {
  repo: async (input) => ({
    executor: "repo-agent",
    lifecycle: "awaiting_executor",
    resultSummary: summarizeTarget("Queued repo action for", input),
  }),
  terminal: async (input) => ({
    executor: "terminal",
    lifecycle: "running",
    resultSummary: summarizeTarget("Opened terminal target", input),
  }),
  automation: async (input) => ({
    executor: "local-automation",
    lifecycle: "running",
    resultSummary: summarizeTarget("Started automation", input),
  }),
  marketplace: async (input) => ({
    executor: "marketplace",
    lifecycle: "awaiting_executor",
    resultSummary: summarizeTarget("Queued marketplace scope", input),
  }),
  n8n: async (input) => ({
    executor: "n8n",
    lifecycle: "awaiting_executor",
    resultSummary: summarizeTarget("Queued n8n flow", input),
  }),
};
