import { getWorkspaceBroker } from "@/app/api/workspace/broker";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getWorkspaceBroker().getSnapshot(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
