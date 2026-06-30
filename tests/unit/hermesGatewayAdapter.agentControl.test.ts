// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const executeAction = vi.fn();

describe("hermes-gateway-adapter agent control", () => {
  beforeEach(() => {
    executeAction.mockReset();
  });

  it("routes_hermes_action_requests_to_the_agent_controller", async () => {
    executeAction.mockResolvedValue({
      ok: true,
      action: { hook: "autonomic-baseline" },
      exitCode: 0,
      stdout: "done",
      stderr: "",
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1,
    });

    const { handleMethod, setAgentControllerForTests } = await import(
      "../../server/hermes-gateway-adapter.js"
    );
    setAgentControllerForTests({
      executeAction,
      getActionSchema: () => ({
        version: 1,
        supportedHooks: ["autonomic-baseline"],
      }),
    });

    const response = await handleMethod(
      "hermes.action.run",
      {
        action: {
          version: 1,
          type: "rtos.hook.run",
          hook: "autonomic-baseline",
        },
      },
      "req-1",
      () => {},
      { remoteAddress: "127.0.0.1" }
    );

    expect(executeAction).toHaveBeenCalledWith(
      {
        version: 1,
        type: "rtos.hook.run",
        hook: "autonomic-baseline",
      },
      { remoteAddress: "127.0.0.1" }
    );
    expect(response).toMatchObject({
      type: "res",
      id: "req-1",
      ok: true,
      payload: {
        ok: true,
        exitCode: 0,
      },
    });
  });
});
