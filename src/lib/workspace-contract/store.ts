import fs from "node:fs";

import { createDefaultWorkspaceContract, normalizeWorkspaceContract } from "@/lib/workspace-contract/schema";
import type { WorkspaceContract } from "@/lib/workspace-contract/types";
import {
  ensureWorkspaceDataDir,
  resolveWorkspaceContractPath,
  resolveWorkspaceEventsPath,
} from "@/lib/workspace-contract/paths";

export const loadWorkspaceContract = ({
  workspaceRoot,
}: {
  workspaceRoot: string;
}): WorkspaceContract => {
  const contractPath = resolveWorkspaceContractPath(workspaceRoot);
  if (!fs.existsSync(contractPath)) {
    return createDefaultWorkspaceContract("primary");
  }

  return normalizeWorkspaceContract(JSON.parse(fs.readFileSync(contractPath, "utf8")));
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

  fs.writeFileSync(
    resolveWorkspaceContractPath(workspaceRoot),
    JSON.stringify(nextContract, null, 2),
    "utf8",
  );
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
