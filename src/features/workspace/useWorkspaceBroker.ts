"use client";

import { useEffect, useState } from "react";

import { fetchJson } from "@/lib/http";
import type { WorkspaceContract } from "@/lib/workspace-contract/types";

type UseWorkspaceBrokerResult = {
  snapshot: WorkspaceContract | null;
  error: string | null;
};

const parseWorkspaceSnapshot = (raw: string) => {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid workspace snapshot payload.");
  }
  return parsed as WorkspaceContract;
};

export const useWorkspaceBroker = (): UseWorkspaceBrokerResult => {
  const [snapshot, setSnapshot] = useState<WorkspaceContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const eventSource = new EventSource("/api/workspace/events");

    const loadSnapshot = async () => {
      try {
        const payload = await fetchJson<WorkspaceContract>("/api/workspace", {
          cache: "no-store",
        });
        if (cancelled) return;
        setSnapshot(payload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load workspace snapshot.");
      }
    };

    void loadSnapshot();

    eventSource.onmessage = (event) => {
      try {
        const nextSnapshot = parseWorkspaceSnapshot(event.data);
        setSnapshot(nextSnapshot);
        setError(null);
      } catch {
        return;
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setError("Workspace event stream closed.");
      }
    };

    return () => {
      cancelled = true;
      eventSource.close();
    };
  }, []);

  return { snapshot, error };
};
