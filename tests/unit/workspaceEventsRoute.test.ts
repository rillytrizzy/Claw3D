// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/workspace/events/route";

const makeTempDir = (name: string) =>
  fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

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
});
