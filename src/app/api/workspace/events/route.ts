import { getWorkspaceBroker } from "@/app/api/workspace/broker";
import type { WorkspaceContract } from "@/lib/workspace-contract/types";

export const runtime = "nodejs";

const encodeSnapshot = (
  encoder: TextEncoder,
  snapshot: WorkspaceContract,
) => encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`);

export async function GET() {
  const broker = getWorkspaceBroker();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const publish = (snapshot: WorkspaceContract) => {
        try {
          controller.enqueue(encodeSnapshot(encoder, snapshot));
        } catch {
          unsubscribe?.();
          unsubscribe = null;
        }
      };

      publish(broker.getSnapshot());
      unsubscribe = broker.subscribe(publish);
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
