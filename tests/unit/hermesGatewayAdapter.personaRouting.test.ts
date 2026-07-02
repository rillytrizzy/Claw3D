// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// OPENAI_API_KEY is read once at module-load time in persona-vendors.js
// (matching the existing HERMES_API_KEY pattern in hermes-gateway-adapter.js),
// so it must be cleared from process.env AND the module registry reset
// before import to get a hermetic result independent of the ambient
// environment (which may have its own OPENAI_API_KEY set).
let savedOpenAiKey: string | undefined;

describe("hermes-gateway-adapter persona routing", () => {
  beforeEach(() => {
    savedOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    if (savedOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedOpenAiKey;
  });

  it("routes agent:agent-chatgpt:main sessions to the ChatGPT persona, not the Hermes orchestrator", async () => {
    const { handleMethod } = await import("../../server/hermes-gateway-adapter.js");
    const sendEvent = vi.fn();

    const response = await handleMethod(
      "chat.send",
      { sessionKey: "agent:agent-chatgpt:main", message: "hello" },
      "req-persona-1",
      sendEvent,
      // handleMethod's requestSource param has no JSDoc type (its `= null`
      // default infers `null`); cast matches the same pre-existing pattern
      // in hermesGatewayAdapter.agentControl.test.ts.
      { remoteAddress: "127.0.0.1", headers: {} } as never
    );

    expect(response).toMatchObject({ type: "res", id: "req-persona-1", ok: true, payload: { status: "started" } });

    await vi.waitFor(() => {
      expect(
        sendEvent.mock.calls.some(
          ([frame]) => frame.event === "chat" && frame.payload?.state === "error"
        )
      ).toBe(true);
    });

    const errorFrame = sendEvent.mock.calls
      .map(([frame]) => frame)
      .find((frame) => frame.event === "chat" && frame.payload?.state === "error");

    // The routing bug this guards against: before the fix, this sessionKey
    // fell through to the Hermes orchestrator (AGENT_ID) instead of
    // resolving to agent-chatgpt, so it would never hit the OpenAI persona
    // path or produce this specific "not configured" message.
    expect(errorFrame.payload.errorMessage).toContain("OPENAI_API_KEY not configured");
  });
});
