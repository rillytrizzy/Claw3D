"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Moon, Sparkles, Sun } from "lucide-react";

const THEME_STORAGE_KEY = "claw3d-theme";
const LEGACY_STORAGE_KEY = "theme";

export type ThemeId = "midnight" | "clean" | "neon";

type ThemeOption = {
  id: ThemeId;
  label: string;
  icon: typeof Moon;
};

const THEMES: ThemeOption[] = [
  { id: "midnight", label: "Midnight HQ", icon: Moon },
  { id: "clean", label: "Clean Light", icon: Sun },
  { id: "neon", label: "Neon", icon: Sparkles },
];

const isThemeId = (value: string | null): value is ThemeId =>
  value === "midnight" || value === "clean" || value === "neon";

const getStoredTheme = (): ThemeId => {
  if (typeof window === "undefined") return "midnight";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemeId(stored)) return stored;
  // Migrate the legacy binary key ("light" | "dark").
  const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy === "light") return "clean";
  if (legacy === "dark") return "midnight";
  return "midnight";
};

const applyTheme = (id: ThemeId) => {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-theme", id);
  // Keep `.dark` in sync so Tailwind `dark:` utilities (and any legacy
  // consumers) follow the palette — midnight and neon are dark looks.
  el.classList.toggle("dark", id !== "clean");
};

export const ThemeToggle = () => {
  // SSR-stable default; the stored value is applied after mount to avoid a
  // hydration mismatch (the inline script in layout.tsx handles first paint).
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initial = getStoredTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, id);
    }
    setOpen(false);
  };

  const active = THEMES.find((option) => option.id === theme) ?? THEMES[0];
  const ActiveIcon = active.icon;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${active.label}`}
        className="ui-btn-icon ui-btn-icon-xs"
        data-testid="theme-picker-toggle"
      >
        <ActiveIcon className="h-3 w-3" />
      </button>
      {open ? (
        <div
          className="ui-card ui-menu-popover absolute right-0 top-9 z-[260] min-w-40 p-1"
          role="menu"
        >
          {THEMES.map((option) => {
            const OptionIcon = option.icon;
            const selected = option.id === theme;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => selectTheme(option.id)}
                data-testid={`theme-option-${option.id}`}
                className="ui-btn-ghost flex w-full items-center gap-2 border-transparent px-3 py-2 text-left text-xs font-medium tracking-normal text-foreground"
              >
                <OptionIcon className="h-3.5 w-3.5 opacity-80" />
                <span className="flex-1">{option.label}</span>
                {selected ? <Check className="h-3.5 w-3.5 opacity-90" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const CYCLE_ORDER: ThemeId[] = ["midnight", "clean", "neon"];

/**
 * Compact single-button theme control that cycles midnight -> clean -> neon.
 * Styled to match the RetroOffice3D overlay toolbar; pass `className` to
 * override. Shares the same persistence/apply logic as {@link ThemeToggle}.
 */
export const ThemeCycleButton = ({ className }: { className?: string }) => {
  const [theme, setTheme] = useState<ThemeId>("midnight");

  useEffect(() => {
    const initial = getStoredTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const cycle = () => {
    // Read the live value from the DOM (the source of truth) rather than the
    // React state closure, so rapid successive clicks advance correctly.
    const current =
      (document.documentElement.getAttribute("data-theme") as ThemeId | null) ?? theme;
    const index = CYCLE_ORDER.indexOf(current);
    const next = CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length];
    setTheme(next);
    applyTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
  };

  const active = THEMES.find((option) => option.id === theme) ?? THEMES[0];
  const ActiveIcon = active.icon;

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${active.label} — click to change`}
      aria-label={`Theme: ${active.label}`}
      data-testid="theme-cycle-button"
      className={
        className ??
        "flex h-7 w-7 items-center justify-center rounded-md border border-amber-900/20 bg-[#1c1610]/80 text-amber-500/40 backdrop-blur-sm transition-all hover:text-amber-400"
      }
    >
      <ActiveIcon size={12} />
    </button>
  );
};
