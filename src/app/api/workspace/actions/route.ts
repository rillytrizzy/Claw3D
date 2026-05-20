import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";
import type { WorkspaceAdapterKey } from "@/lib/workspace-broker/types";

export const runtime = "nodejs";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

const errorJson = (message: string, status: number) =>
  json({ error: message }, status);

const getWorkspaceBroker = () =>
  createWorkspaceBroker({ workspaceRoot: process.cwd() });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readRequiredString = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === "string" ? value[key].trim() : "";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorJson("Invalid JSON payload.", 400);
  }

  if (!isRecord(body)) {
    return errorJson("Action payload is required.", 400);
  }

  const agentId = readRequiredString(body, "agentId");
  const type = readRequiredString(body, "type");
  const target = readRequiredString(body, "target");
  const adapter = readRequiredString(body, "adapter");
  const payload = isRecord(body.payload) ? body.payload : undefined;

  if (!agentId) {
    return errorJson("agentId is required.", 400);
  }
  if (!type) {
    return errorJson("type is required.", 400);
  }
  if (!target) {
    return errorJson("target is required.", 400);
  }
  if (!adapter) {
    return errorJson("adapter is required.", 400);
  }

  try {
    const action = await getWorkspaceBroker().runAction({
      agentId,
      type,
      target,
      adapter: adapter as WorkspaceAdapterKey,
      payload,
    });

    return json(action);
  } catch (error) {
    console.error("[workspace/actions] POST failed:", error);
    return errorJson(
      error instanceof Error ? error.message : "unknown broker failure",
      500,
    );
  }
}
