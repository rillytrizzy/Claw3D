"use client";

import { useMemo } from "react";
import { DENY_ALL_POLICY, type GovernancePolicy } from "./policy";

const parseBool = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
};

/**
 * Resolves the governance policy from NEXT_PUBLIC_ env vars that are baked
 * into the client bundle at build time. Defaults to read_only / deny-all so
 * the app is safe even if no vars are set.
 */
export const resolveClientGovernancePolicy = (): GovernancePolicy => {
  try {
    const mode =
      process.env.NEXT_PUBLIC_CLAW3D_GOVERNANCE_MODE === "standard"
        ? ("standard" as const)
        : ("read_only" as const);
    const allow = mode !== "read_only";

    return {
      mode,
      allowExternalNetwork:  parseBool(process.env.NEXT_PUBLIC_ALLOW_EXTERNAL_NETWORK,  allow),
      allowProcessLaunch:    parseBool(process.env.NEXT_PUBLIC_ALLOW_PROCESS_LAUNCH,    allow),
      allowInstalls:         parseBool(process.env.NEXT_PUBLIC_ALLOW_INSTALLS,          allow),
      allowDownloads:        parseBool(process.env.NEXT_PUBLIC_ALLOW_DOWNLOADS,         allow),
      allowCronCreate:       parseBool(process.env.NEXT_PUBLIC_ALLOW_CRON_CREATE,       allow),
      allowCronRun:          parseBool(process.env.NEXT_PUBLIC_ALLOW_CRON_RUN,          allow),
      allowAgentSpawn:       parseBool(process.env.NEXT_PUBLIC_ALLOW_AGENT_SPAWN,       allow),
      allowSkillMutation:    parseBool(process.env.NEXT_PUBLIC_ALLOW_SKILL_MUTATION,    allow),
      allowGatewaySsh:       parseBool(process.env.NEXT_PUBLIC_ALLOW_GATEWAY_SSH,       allow),
      allowOpenClawLaunch:   parseBool(process.env.NEXT_PUBLIC_ALLOW_OPENCLAW_LAUNCH,   allow),
      allowLocalhostNetwork: parseBool(process.env.NEXT_PUBLIC_ALLOW_LOCALHOST_NETWORK, true),
    };
  } catch {
    return DENY_ALL_POLICY;
  }
};

/** React hook — stable reference, resolves once per render cycle. */
export const useGovernancePolicy = (): GovernancePolicy =>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(resolveClientGovernancePolicy, []);
