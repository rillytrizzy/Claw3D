import fs from "node:fs";
import path from "node:path";

export const resolveWorkspaceDataDir = (workspaceRoot: string) =>
  path.join(workspaceRoot, ".claw3d-workspace");

export const resolveWorkspaceContractPath = (workspaceRoot: string) =>
  path.join(resolveWorkspaceDataDir(workspaceRoot), "workspace-contract.json");

export const resolveWorkspaceEventsPath = (workspaceRoot: string) =>
  path.join(resolveWorkspaceDataDir(workspaceRoot), "events.jsonl");

export const ensureWorkspaceDataDir = (workspaceRoot: string) => {
  fs.mkdirSync(resolveWorkspaceDataDir(workspaceRoot), { recursive: true });
};
