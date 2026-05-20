// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendWorkspaceEvent,
  loadWorkspaceContract,
  saveWorkspaceContract,
} from "@/lib/workspace-contract/store";

describe("workspace contract store", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-contract-"));

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes and reloads the shared workspace contract", () => {
    const saved = saveWorkspaceContract({
      workspaceRoot: tempDir,
      contract: {
        workspace: {
          id: "primary",
          label: "Primary Workspace",
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
        },
        broker: { status: "ready", adapterAvailability: {}, lastHeartbeatAt: null, lastError: null },
        agents: [],
        actions: [],
        sessions: [],
        terminal: { available: false, sessions: [] },
        automations: { available: false, running: [] },
        marketplace: { available: false, installs: [] },
        n8n: { available: false, runs: [] },
        scene: { focusAgentId: null, followAgentId: null, attentionAgentIds: [] },
        history: [],
      },
    });

    const loaded = loadWorkspaceContract({ workspaceRoot: tempDir });
    expect(loaded.workspace.id).toBe(saved.workspace.id);
    expect(loaded.broker.status).toBe("ready");
  });

  it("loads a default contract when the file is missing", () => {
    const loaded = loadWorkspaceContract({ workspaceRoot: tempDir });

    expect(loaded.workspace.id).toBe("primary");
    expect(loaded.broker.status).toBe("idle");
  });

  it("falls back to a default contract for malformed content", () => {
    fs.mkdirSync(path.join(tempDir, ".claw3d-workspace"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".claw3d-workspace", "workspace-contract.json"),
      "{",
      "utf8",
    );

    const loaded = loadWorkspaceContract({ workspaceRoot: tempDir });

    expect(loaded.workspace.id).toBe("primary");
    expect(loaded.broker.status).toBe("idle");
  });

  it("surfaces real read failures instead of defaulting", () => {
    const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw error;
    });

    expect(() => loadWorkspaceContract({ workspaceRoot: tempDir })).toThrowError(error);
  });

  it("appends broker events as jsonl entries", () => {
    const event = appendWorkspaceEvent({
      workspaceRoot: tempDir,
      event: {
        id: "evt-1",
        kind: "broker.ready",
        message: "Broker ready",
        createdAt: new Date().toISOString(),
      },
    });

    expect(event.id).toBe("evt-1");
    expect(fs.readFileSync(path.join(tempDir, ".claw3d-workspace", "events.jsonl"), "utf8")).toContain(
      "broker.ready",
    );
  });
});
