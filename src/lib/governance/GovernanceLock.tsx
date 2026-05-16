"use client";

import { Lock } from "lucide-react";

type GovernanceLockProps = {
  /** Tooltip / aria-label text shown to the user. */
  label?: string;
  className?: string;
};

/**
 * Inline badge rendered next to UI controls that are disabled by governance
 * policy. Signals "Requires approval" without changing surrounding layout.
 */
export const GovernanceLock = ({
  label = "Requires approval",
  className = "",
}: GovernanceLockProps) => (
  <span
    title={label}
    aria-label={label}
    className={`inline-flex items-center gap-1 rounded border border-amber-700/40 bg-amber-900/20 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-400/80 ${className}`}
  >
    <Lock className="h-2.5 w-2.5 shrink-0" />
    {label}
  </span>
);
