// @vitest-environment node

import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const executeAction = vi.fn();
let server: http.Server | null = null;

function listen(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(0, "127.0.0.1", () => {
      const address = server?.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not resolve test server address."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

describe("hermes-gateway-adapter HTTP actions", () => {
  afterEach(async () => {
    executeAction.mockReset();
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
    server = null;
  });

  it("maps_action_run_outcomes_to_200_400_and_403", async () => {
    const { createHttpRequestHandler, setAgentControllerForTests } = await import(
      "../../server/hermes-gateway-adapter.js"
    );
    setAgentControllerForTests({
      executeAction,
      getActionSchema: () => ({
        version: 1,
        type: "rtos.hook.run",
        supportedHooks: [{ hook: "memory-recall" }],
      }),
    });

    const baseUrl = await listen(createHttpRequestHandler());

    executeAction.mockResolvedValueOnce({ ok: true, action: { hook: "memory-recall" } });
    const ok = await fetch(`${baseUrl}/actions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hermes-action-key": "secret" },
      body: JSON.stringify({
        version: 1,
        type: "rtos.hook.run",
        hook: "memory-recall",
      }),
    });
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({ ok: true });

    const invalidError = new Error('Unsupported hook "not-real".');
    executeAction.mockRejectedValueOnce(invalidError);
    const invalid = await fetch(`${baseUrl}/actions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hermes-action-key": "secret" },
      body: JSON.stringify({
        version: 1,
        type: "rtos.hook.run",
        hook: "not-real",
      }),
    });
    expect(invalid.status).toBe(400);

    const forbiddenError = new Error("Request source rejected: origin_not_allowed.");
    (forbiddenError as Error & { code?: string }).code = "origin_not_allowed";
    executeAction.mockRejectedValueOnce(forbiddenError);
    const forbidden = await fetch(`${baseUrl}/actions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hermes-action-key": "secret" },
      body: JSON.stringify({
        version: 1,
        type: "rtos.hook.run",
        hook: "memory-recall",
      }),
    });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({
      ok: false,
      code: "origin_not_allowed",
    });
  });
});
