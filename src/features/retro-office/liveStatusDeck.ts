import type { OfficeAgent, RenderAgent } from "@/features/retro-office/core/types";

type RenderAgentUiSnapshot = Pick<RenderAgent, "state" | "status">;

type FeedEvent = {
  id: string;
  name: string;
  text: string;
  ts: number;
  kind?: "status" | "reply";
};

export type LiveStatusDeckSummary = {
  gatewayLabel: string;
  counts: { working: number; idle: number; error: number };
  latestEvent: FeedEvent | null;
  selectedAgent: {
    id: string;
    name: string;
    visibleStatus: OfficeAgent["status"];
    sceneState: RenderAgent["state"] | null;
    lastSignalText: string | null;
    isFocused: boolean;
    isFollowed: boolean;
    isAttentionMarked: boolean;
    isPingActive: boolean;
  } | null;
};

export function createAttentionSet(ids: string[] = []): Set<string> {
  return new Set(ids);
}

export function toggleAttentionAgent(current: Set<string>, agentId: string): Set<string> {
  const next = new Set(current);
  if (next.has(agentId)) next.delete(agentId);
  else next.add(agentId);
  return next;
}

export function pruneLiveStatusDeckState(params: {
  agents: readonly Pick<OfficeAgent, "id">[];
  selectedAgentId: string | null;
  pingAgentId: string | null;
  pingExpiresAt: number | null;
  attentionAgentIds: Set<string>;
  nowMs: number;
}) {
  const available = new Set(params.agents.map((agent) => agent.id));
  const selectedAgentId =
    params.selectedAgentId && available.has(params.selectedAgentId)
      ? params.selectedAgentId
      : null;
  const pingStillValid =
    params.pingAgentId &&
    params.pingExpiresAt &&
    params.pingExpiresAt > params.nowMs &&
    available.has(params.pingAgentId);

  return {
    selectedAgentId,
    pingAgentId: pingStillValid ? params.pingAgentId : null,
    pingExpiresAt: pingStillValid ? params.pingExpiresAt : null,
    attentionAgentIds: new Set(
      [...params.attentionAgentIds].filter((agentId) => available.has(agentId)),
    ),
  };
}

export function buildLiveStatusDeckSummary(params: {
  agents: readonly OfficeAgent[];
  renderAgentUiById: Record<string, RenderAgentUiSnapshot | undefined>;
  statusFeedEvents: readonly FeedEvent[];
  gatewayStatus?: string;
  selectedAgentId: string | null;
  followAgentId: string | null;
  spotlightAgentId: string | null;
  attentionAgentIds: Set<string>;
  pingAgentId: string | null;
  pingExpiresAt: number | null;
  nowMs: number;
}): LiveStatusDeckSummary {
  const counts = params.agents.reduce(
    (acc, agent) => {
      acc[agent.status] += 1;
      return acc;
    },
    { working: 0, idle: 0, error: 0 },
  );

  const latestEvent = params.statusFeedEvents[0] ?? null;
  const selectedAgent =
    params.selectedAgentId
      ? params.agents.find((agent) => agent.id === params.selectedAgentId) ?? null
      : null;
  const selectedEvent =
    selectedAgent
      ? params.statusFeedEvents.find((event) => event.id === selectedAgent.id) ?? null
      : null;
  const renderAgent = selectedAgent
    ? params.renderAgentUiById[selectedAgent.id] ?? null
    : null;

  return {
    gatewayLabel: (params.gatewayStatus ?? "unknown").trim() || "unknown",
    counts,
    latestEvent,
    selectedAgent: selectedAgent
      ? {
          id: selectedAgent.id,
          name: selectedAgent.name,
          visibleStatus: renderAgent?.status ?? selectedAgent.status,
          sceneState: renderAgent?.state ?? null,
          lastSignalText: selectedEvent?.text ?? null,
          isFocused: params.spotlightAgentId === selectedAgent.id,
          isFollowed: params.followAgentId === selectedAgent.id,
          isAttentionMarked: params.attentionAgentIds.has(selectedAgent.id),
          isPingActive:
            params.pingAgentId === selectedAgent.id &&
            Boolean(params.pingExpiresAt && params.pingExpiresAt > params.nowMs),
        }
      : null,
  };
}
