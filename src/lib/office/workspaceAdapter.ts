import type { OfficeAgent } from "@/features/retro-office/core/types";
import type { AgentStoreSeed } from "@/features/agents/state/store";
import type { WorkspaceAgentRecord } from "@/lib/workspace-contract/types";
import { buildAgentMainSessionKey } from "@/lib/gateway/GatewayClient";

const stringToColor = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hex = (hash & 0x00ffffff).toString(16).toUpperCase();
  return `#${"000000".slice(hex.length)}${hex}`;
};

const normalizeStatus = (agent: WorkspaceAgentRecord): OfficeAgent["status"] => {
  if (agent.status === "error" || agent.health === "degraded") {
    return "error";
  }
  if (agent.status === "working") {
    return "working";
  }
  return "idle";
};

const getDetails = (agent: WorkspaceAgentRecord) => {
  const raw = agent.currentTask ?? agent.lastEvent ?? agent.role;
  return raw.trim().replace(/\s+/g, " ");
};

const getColor = (agent: WorkspaceAgentRecord) => {
  if (agent.status === "error" || agent.health === "degraded") {
    return "#ef4444";
  }
  if (agent.status === "working") {
    return "#22c55e";
  }
  if (agent.status === "offline") {
    return "#64748b";
  }
  if (agent.status === "blocked") {
    return "#f59e0b";
  }
  return stringToColor(`${agent.health}:${agent.status}`);
};

export const mapWorkspaceAgentsToOfficeAgents = (
  agents: WorkspaceAgentRecord[],
): OfficeAgent[] =>
  agents.map((agent) => {
    const detail = getDetails(agent);
    return {
      id: agent.id,
      name: agent.name,
      subtitle: detail,
      status: normalizeStatus(agent),
      color: getColor(agent),
      item: detail,
      avatarProfile: null,
    };
  });

export const mapWorkspaceAgentsToAgentSeeds = (
  agents: WorkspaceAgentRecord[],
): AgentStoreSeed[] =>
  agents.map((agent) => ({
    agentId: agent.id,
    name: agent.name,
    runtimeName: "Claw3D Broker",
    identityName: agent.name,
    sessionDisplayName: agent.name,
    role: agent.role,
    sessionKey: buildAgentMainSessionKey(agent.id, "main"),
    avatarSeed: agent.id,
    avatarProfile: null,
    model: agent.capabilities[0] ?? null,
    thinkingLevel: agent.health,
    toolCallingEnabled: agent.capabilities.length > 0,
    showThinkingTraces: false,
  }));
