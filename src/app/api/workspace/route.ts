import { createWorkspaceBroker } from "@/lib/workspace-broker/broker";

export const runtime = "nodejs";

const getWorkspaceBroker = () =>
  createWorkspaceBroker({ workspaceRoot: process.cwd() });

export async function GET() {
  return Response.json(getWorkspaceBroker().getSnapshot(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
