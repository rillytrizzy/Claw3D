// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/uuid", () => ({
  randomUUID: () => "action-route-1",
}));

import { POST } from "@/app/api/workspace/actions/route";
import { GET as getWorkspace } from "@/app/api/workspace/route";

const makeTempDir = (name: string) =>
  fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const makeRequest = (body?: unknown) =>
  new Request("http://localhost/api/workspace/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

describe("workspace routes", () => {
  const originalCwd = process.cwd();
  let workspaceRoot: string | null = null;

  afterEach(() => {
    process.chdir(originalCwd);
    if (workspaceRoot) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = null;
    }
  });

  it("GET returns the workspace snapshot with no-store caching", async () => {
    workspaceRoot = makeTempDir("workspace-route-get");
    process.chdir(workspaceRoot);

    const response = await getWorkspace();
    const body = (await response.json()) as { workspace?: { id?: string } };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.workspace?.id).toBeDefined();
  });

  it("POST runs a valid action and returns the action JSON", async () => {
    workspaceRoot = makeTempDir("workspace-action-post");
    process.chdir(workspaceRoot);

    const response = await POST(
      makeRequest({
        agentId: "agent-terminal",
        type: "open-terminal",
        target: "docs",
        adapter: "terminal",
      }),
    );
    const body = (await response.json()) as {
      id?: string;
      lifecycle?: string;
      executor?: string | null;
      resultSummary?: string | null;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.id).toBe("action-route-1");
    expect(body.lifecycle).toBe("running");
    expect(body.executor).toBe("terminal");
    expect(body.resultSummary).toContain("docs");
  });

  it("POST rejects empty agentId, type, target, and adapter", async () => {
    workspaceRoot = makeTempDir("workspace-action-post-invalid");
    process.chdir(workspaceRoot);

    const cases = [
      { field: "agentId", body: { agentId: "", type: "open-terminal", target: "docs", adapter: "terminal" } },
      { field: "type", body: { agentId: "agent-terminal", type: "", target: "docs", adapter: "terminal" } },
      { field: "target", body: { agentId: "agent-terminal", type: "open-terminal", target: "", adapter: "terminal" } },
      { field: "adapter", body: { agentId: "agent-terminal", type: "open-terminal", target: "docs", adapter: "" } },
    ] as const;

    for (const testCase of cases) {
      const response = await POST(makeRequest(testCase.body));
      const payload = (await response.json()) as { error?: string };

      expect(response.status).toBe(400);
      expect(payload.error).toContain(testCase.field);
    }
  });
});
