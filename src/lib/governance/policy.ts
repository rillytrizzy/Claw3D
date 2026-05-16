export type GovernanceMode = "read_only" | "standard";

export type GovernancePolicy = {
  mode: GovernanceMode;
  allowExternalNetwork: boolean;
  allowProcessLaunch: boolean;
  allowInstalls: boolean;
  allowDownloads: boolean;
  allowCronCreate: boolean;
  allowCronRun: boolean;
  allowAgentSpawn: boolean;
  allowSkillMutation: boolean;
  allowGatewaySsh: boolean;
  allowOpenClawLaunch: boolean;
  allowLocalhostNetwork: boolean;
};

const parseBool = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
};

const resolveMode = (value: string | undefined): GovernanceMode =>
  value === "standard" ? "standard" : "read_only";

/**
 * Resolves the governance policy from a process.env-shaped record.
 * In read_only mode every risky flag defaults to false unless explicitly
 * overridden. ALLOW_LOCALHOST_NETWORK always defaults to true.
 */
export const resolveGovernancePolicy = (
  env: Record<string, string | undefined> = process.env,
): GovernancePolicy => {
  const mode = resolveMode(env.CLAW3D_GOVERNANCE_MODE);
  const allow = mode !== "read_only"; // baseline for risky flags in standard mode

  return {
    mode,
    allowExternalNetwork: parseBool(env.ALLOW_EXTERNAL_NETWORK, allow),
    allowProcessLaunch:   parseBool(env.ALLOW_PROCESS_LAUNCH,   allow),
    allowInstalls:        parseBool(env.ALLOW_INSTALLS,          allow),
    allowDownloads:       parseBool(env.ALLOW_DOWNLOADS,         allow),
    allowCronCreate:      parseBool(env.ALLOW_CRON_CREATE,       allow),
    allowCronRun:         parseBool(env.ALLOW_CRON_RUN,          allow),
    allowAgentSpawn:      parseBool(env.ALLOW_AGENT_SPAWN,       allow),
    allowSkillMutation:   parseBool(env.ALLOW_SKILL_MUTATION,    allow),
    allowGatewaySsh:      parseBool(env.ALLOW_GATEWAY_SSH,       allow),
    allowOpenClawLaunch:  parseBool(env.ALLOW_OPENCLAW_LAUNCH,   allow),
    allowLocalhostNetwork: parseBool(env.ALLOW_LOCALHOST_NETWORK, true),
  };
};

/** Safe deny-all sentinel used as fallback when policy cannot be resolved. */
export const DENY_ALL_POLICY: GovernancePolicy = {
  mode: "read_only",
  allowExternalNetwork:  false,
  allowProcessLaunch:    false,
  allowInstalls:         false,
  allowDownloads:        false,
  allowCronCreate:       false,
  allowCronRun:          false,
  allowAgentSpawn:       false,
  allowSkillMutation:    false,
  allowGatewaySsh:       false,
  allowOpenClawLaunch:   false,
  allowLocalhostNetwork: true,
};
