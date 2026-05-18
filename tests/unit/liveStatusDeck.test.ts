import { describe, expect, it } from "vitest";

import {
  buildLiveStatusDeckSummary,
  createAttentionSet,
  pruneLiveStatusDeckState,
  toggleAttentionAgent,
} from "@/features/retro-office/liveStatusDeck";

const agents = [
  { id: "alpha", name: "Alpha", status: "working", color: "#f59e0b", item: "desk" },
  { id: "beta", name: "Beta", status: "idle", color: "#60a5fa", item: "desk" },
  { id: "gamma", name: "Gamma", status: "error", color: "#f87171", item: "desk" },
] as const;

describe("liveStatusDeck helpers", () => {
  it("builds aggregate counts and selected-agent detail", () => {
    const summary = buildLiveStatusDeckSummary({
      agents,
      renderAgentUiById: {
        alpha: { state: "walking", status: "working" },
        beta: { state: "standing", status: "idle" },
        gamma: { state: "away", status: "error" },
      },
      statusFeedEvents: [
        { id: "alpha", name: "Alpha", text: "Opened GitHub review", ts: 50_000 },
        { id: "beta", name: "Beta", text: "Waiting for input", ts: 40_000 },
      ],
      gatewayStatus: "connected",
      selectedAgentId: "alpha",
      followAgentId: "beta",
      spotlightAgentId: "alpha",
      attentionAgentIds: new Set(["gamma"]),
      pingAgentId: "alpha",
      pingExpiresAt: 60_000,
      nowMs: 55_000,
    });

    expect(summary.counts).toEqual({ working: 1, idle: 1, error: 1 });
    expect(summary.selectedAgent).toEqual(
      expect.objectContaining({
        id: "alpha",
        visibleStatus: "working",
        sceneState: "walking",
        lastSignalText: "Opened GitHub review",
        isFollowed: false,
        isFocused: true,
        isAttentionMarked: false,
        isPingActive: true,
      }),
    );
    expect(summary.gatewayLabel).toBe("connected");
  });

  it("clears stale selection and ping state when the agent is no longer present", () => {
    const next = pruneLiveStatusDeckState({
      agents,
      selectedAgentId: "missing",
      pingAgentId: "missing",
      pingExpiresAt: 10_000,
      attentionAgentIds: new Set(["alpha", "missing"]),
      nowMs: 11_000,
    });

    expect(next.selectedAgentId).toBeNull();
    expect(next.pingAgentId).toBeNull();
    expect(next.pingExpiresAt).toBeNull();
    expect([...next.attentionAgentIds]).toEqual(["alpha"]);
  });

  it("toggles attention markers without mutating the original set", () => {
    const original = createAttentionSet(["alpha"]);
    const added = toggleAttentionAgent(original, "beta");
    const removed = toggleAttentionAgent(added, "alpha");

    expect([...original]).toEqual(["alpha"]);
    expect([...added].sort()).toEqual(["alpha", "beta"]);
    expect([...removed]).toEqual(["beta"]);
  });
});
