// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/workspace/events/route";
import { POST } from "@/app/api/workspace/actions/route";
import type { WorkspaceContract } from "@/lib/workspace-contract/types";

const makeTempDir = (name: string) =>
  fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const makeActionRequest = (body: unknown) =>
  new Request("http://localhost/api/workspace/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const decodeSnapshotChunk = (value: Uint8Array) => {
  const text = new TextDecoder().decode(value);
  const payload = text
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);

  return {
    text,
    snapshot: payload ? (JSON.parse(payload) as WorkspaceContract) : null,
  };
};

describe("workspace events route", () => {
  const originalCwd = process.cwd();
  let workspaceRoot: string | null = null;

  afterEach(() => {
    process.chdir(originalCwd);
    if (workspaceRoot) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = null;
    }
  });

  it("returns an SSE stream with an initial data event", async () => {
    workspaceRoot = makeTempDir("workspace-events-route");
    process.chdir(workspaceRoot);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("connection")).toBe("keep-alive");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const firstChunk = await reader?.read();
    const text = new TextDecoder().decode(firstChunk?.value);

    expect(firstChunk?.done).toBe(false);
    expect(text.startsWith("data: ")).toBe(true);

    await reader?.cancel();
  });

  it("streams action updates after the initial snapshot", async () => {
    workspaceRoot = makeTempDir("workspace-events-route-action");
    process.chdir(workspaceRoot);

    const response = await GET();
    const reader = response.body?.getReader();

    expect(reader).toBeDefined();

    const initialChunk = await reader?.read();
    const initialSnapshot = initialChunk?.value
      ? decodeSnapshotChunk(initialChunk.value).snapshot
      : null;

    expect(initialChunk?.done).toBe(false);
    expect(initialSnapshot?.actions).toHaveLength(0);

    const actionResponse = await POST(
      makeActionRequest({
        agentId: "agent-terminal",
        type: "open-terminal",
        target: "docs",
        adapter: "terminal",
      }),
    );

    expect(actionResponse.status).toBe(200);

    const updateChunk = await reader?.read();
    const updateSnapshot = updateChunk?.value
      ? decodeSnapshotChunk(updateChunk.value).snapshot
      : null;
    const matchingAction = updateSnapshot?.actions.find(
      (action) =>
        action.agentId === "agent-terminal" &&
        action.type === "open-terminal" &&
        action.target === "docs",
    );

    expect(updateChunk?.done).toBe(false);
    expect(matchingAction).toBeDefined();
    expect(["queued", "routing", "running"]).toContain(
      matchingAction?.lifecycle,
    );

    await reader?.cancel();
  });
});
