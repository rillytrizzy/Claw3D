// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

describe("agent-controller", () => {
  it("normalizes_and_validates_allowed_hook_actions", async () => {
    const { normalizeActionRequest } = await import("../../server/agent-controller.js");

    expect(
      normalizeActionRequest({
        version: 1,
        type: "rtos.hook.run",
        hook: "autonomic-baseline",
        args: ["-Mode", "fast"],
      })
    ).toMatchObject({
      version: 1,
      type: "rtos.hook.run",
      hook: "autonomic-baseline",
      args: ["-Mode", "fast"],
    });

    expect(() =>
      normalizeActionRequest({
        version: 1,
        type: "rtos.hook.run",
        hook: "not-real",
      })
    ).toThrow(/Unsupported hook/);
  });

  it("rejects_non_local_sources_by_default", async () => {
    const { validateRequestSource } = await import("../../server/agent-controller.js");

    expect(
      validateRequestSource({
        remoteAddress: "127.0.0.1",
        origin: "http://localhost:3000",
      })
    ).toMatchObject({ allowed: true });

    expect(
      validateRequestSource({
        remoteAddress: "10.0.0.25",
        origin: "https://remote.example",
      })
    ).toMatchObject({
      allowed: false,
      reason: "remote_address_not_allowed",
    });
  });

  it("requires_a_configured_shared_secret_for_action_execution", async () => {
    const { validateRequestSource } = await import("../../server/agent-controller.js");

    expect(
      validateRequestSource(
        {
          remoteAddress: "127.0.0.1",
          headers: {},
        },
        { env: {} }
      )
    ).toMatchObject({
      allowed: false,
      reason: "shared_secret_required",
    });

    expect(
      validateRequestSource(
        {
          remoteAddress: "127.0.0.1",
          headers: { "x-hermes-action-key": "wrong" },
        },
        { env: { HERMES_ACTION_SHARED_SECRET: "expected" } }
      )
    ).toMatchObject({
      allowed: false,
      reason: "shared_secret_required",
    });

    expect(
      validateRequestSource(
        {
          remoteAddress: "127.0.0.1",
          headers: { "x-hermes-action-key": "expected" },
        },
        { env: { HERMES_ACTION_SHARED_SECRET: "expected" } }
      )
    ).toMatchObject({ allowed: true });
  });

  it("executes_hooks_via_powershell_without_shell_interpolation", async () => {
    const spawn = vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: (event: string, handler: (value?: number) => void) => {
        if (event === "close") handler(0);
      },
      kill: vi.fn(),
    }));

    const { createAgentController } = await import("../../server/agent-controller.js");

    const controller = createAgentController({
      spawn,
      now: () => 1234,
      env: { HERMES_ACTION_SHARED_SECRET: "test-secret" },
    });

    const result = await controller.executeAction(
      {
        version: 1,
        type: "rtos.hook.run",
        hook: "memory-recall",
        args: ["-Topic", "gateway"],
      },
      {
        remoteAddress: "127.0.0.1",
        headers: { "x-hermes-action-key": "test-secret" },
      }
    );

    expect(spawn).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "C:\\tools\\rtos-hooks\\memory-recall.ps1",
        "-Topic",
        "gateway",
      ]),
      expect.objectContaining({
        shell: false,
      })
    );
    expect(result).toMatchObject({
      ok: true,
      action: {
        hook: "memory-recall",
      },
      exitCode: 0,
    });
  });
});
