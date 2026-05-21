import { NextResponse } from "next/server";
import { getWorkspaceBroker } from "@/app/api/workspace/broker";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = getWorkspaceBroker().getSnapshot();

  return NextResponse.json(
    {
      ok: true,
      service: "claw3d",
      broker: {
        status: snapshot.broker.status,
        lastHeartbeatAt: snapshot.broker.lastHeartbeatAt,
        lastError: snapshot.broker.lastError,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
