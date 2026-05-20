// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("@/lib/uuid", () => ({
  randomUUID: () => "action-1",
}));

import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";
import { loadWorkspaceContract } from "@/lib/workspace-contract/store";

describe("workspace broker", () => {
  let workspaceRoot: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (workspaceRoot) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("routes a terminal action and leaves it running under the terminal executor", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-broker-"));
    const broker = createWorkspaceBroker({ workspaceRoot });
    const snapshots: string[] = [];

    const unsubscribe = broker.subscribe((snapshot) => {
      snapshots.push(snapshot.actions[0]?.lifecycle ?? "none");
    });

    const action = await broker.runAction({
      agentId: "agent-terminal",
      type: "open-terminal",
      target: "docs",
      adapter: "terminal",
    });

    unsubscribe();

    expect(action.id).toBe("action-1");
    expect(action.lifecycle).toBe("running");
    expect(action.executor).toBe("terminal");
    expect(action.resultSummary).toBe("Opened terminal target docs");
    expect(broker.getSnapshot().broker.status).toBe("ready");
    expect(broker.getSnapshot().broker.lastHeartbeatAt).not.toBeNull();
    expect(snapshots).toEqual(["queued", "routing", "running"]);

    const persisted = loadWorkspaceContract({ workspaceRoot });
    expect(persisted.broker.status).toBe("ready");
    expect(persisted.broker.adapterAvailability).toMatchObject({
      repo: true,
      terminal: true,
      automation: true,
      marketplace: true,
      n8n: true,
    });
    expect(persisted.actions[0]).toMatchObject({
      id: "action-1",
      lifecycle: "running",
      executor: "terminal",
      resultSummary: "Opened terminal target docs",
      errorSummary: null,
    });
  });

  it("degrades broker state and records the error when the n8n adapter throws", async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-broker-"));
    const error = new Error("n8n offline");
    const broker = createWorkspaceBroker({
      workspaceRoot,
      adapters: {
        n8n: vi.fn(async () => {
          throw error;
        }),
      },
    });

    await expect(
      broker.runAction({
        agentId: "agent-automation",
        type: "run-flow",
        target: "daily-sync",
        adapter: "n8n",
      }),
    ).rejects.toThrowError(error);

    expect(broker.getSnapshot().broker.status).toBe("degraded");
    expect(broker.getSnapshot().broker.lastError).toBe("n8n offline");
    expect(broker.getSnapshot().actions[0]).toMatchObject({
      id: "action-1",
      lifecycle: "failed",
      executor: null,
      resultSummary: null,
      errorSummary: "n8n offline",
    });

    const persisted = loadWorkspaceContract({ workspaceRoot });
    expect(persisted.broker.status).toBe("degraded");
    expect(persisted.broker.lastError).toBe("n8n offline");
    expect(persisted.actions[0]).toMatchObject({
      id: "action-1",
      lifecycle: "failed",
      errorSummary: "n8n offline",
    });
  });
});
