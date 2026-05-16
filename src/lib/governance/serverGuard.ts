import type { GovernancePolicy } from "./policy";

export class GovernanceDeniedError extends Error {
  readonly flag: keyof GovernancePolicy;
  readonly statusHint = 403 as const;

  constructor(flag: keyof GovernancePolicy, label: string) {
    super(`Governance policy denies "${label}" (${flag}).`);
    this.name = "GovernanceDeniedError";
    this.flag = flag;
  }
}

export const assertGovernanceAllowed = (
  policy: GovernancePolicy,
  flag: keyof GovernancePolicy,
  label: string,
): void => {
  if (policy[flag] !== true) {
    throw new GovernanceDeniedError(flag, label);
  }
};

export const governanceDeniedResponse = (
  flag: keyof GovernancePolicy,
): { error: string; code: string; policy: keyof GovernancePolicy } => ({
  error: "This action is disabled by governance policy.",
  code: "governance.denied",
  policy: flag,
});
