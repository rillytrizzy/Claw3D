import fs from "node:fs";

import { createDefaultWorkspaceContract, normalizeWorkspaceContract } from "@/lib/workspace-contract/schema";
import type { WorkspaceContract } from "@/lib/workspace-contract/types";
import {
  ensureWorkspaceDataDir,
  resolveWorkspaceContractPath,
  resolveWorkspaceContractTempPath,
  resolveWorkspaceEventsPath,
} from "@/lib/workspace-contract/paths";

const isWorkspaceContractFallbackError = (error: unknown): boolean => {
  if (error instanceof SyntaxError) {
    return true;
  }

  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT",
  );
};

export const loadWorkspaceContract = ({
  workspaceRoot,
}: {
  workspaceRoot: string;
}): WorkspaceContract => {
  const contractPath = resolveWorkspaceContractPath(workspaceRoot);
  try {
    return normalizeWorkspaceContract(JSON.parse(fs.readFileSync(contractPath, "utf8")));
  } catch (error) {
    if (isWorkspaceContractFallbackError(error)) {
      return createDefaultWorkspaceContract("primary");
    }

    throw error;
  }
};

export const saveWorkspaceContract = ({
  workspaceRoot,
  contract,
}: {
  workspaceRoot: string;
  contract: WorkspaceContract;
}) => {
  ensureWorkspaceDataDir(workspaceRoot);
  const nextContract = normalizeWorkspaceContract({
    ...contract,
    workspace: { ...contract.workspace, updatedAt: new Date().toISOString() },
  });
  const contractPath = resolveWorkspaceContractPath(workspaceRoot);
  const tempPath = resolveWorkspaceContractTempPath(
    workspaceRoot,
    `${process.pid}-${Date.now()}`,
  );

  fs.writeFileSync(tempPath, JSON.stringify(nextContract, null, 2), "utf8");
  fs.renameSync(tempPath, contractPath);
  return nextContract;
};

export const appendWorkspaceEvent = ({
  workspaceRoot,
  event,
}: {
  workspaceRoot: string;
  event: { id: string; kind: string; message: string; createdAt: string };
}) => {
  ensureWorkspaceDataDir(workspaceRoot);
  fs.appendFileSync(
    resolveWorkspaceEventsPath(workspaceRoot),
    `${JSON.stringify(event)}\n`,
    "utf8",
  );
  return event;
};
