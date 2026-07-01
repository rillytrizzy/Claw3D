"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  OFFICE_FLOORS,
  getAdjacentEnabledOfficeFloorId,
  listAvailableFloorsForAdapter,
  type FloorDefinition,
  type FloorId,
  type FloorProvider,
} from "@/lib/office/floors";
import type { FloorRosterState } from "@/lib/office/floorRoster";

const DIRECTORY_COLLAPSED_STORAGE_KEY = "claw3d.officeFloorNav.directoryCollapsed";

type OfficeFloorNavProps = {
  activeFloorId: FloorId;
  floorRosterCache: Record<FloorId, FloorRosterState>;
  onSelectFloor: (floorId: FloorId) => void;
  /** The currently selected adapter — controls which runtime floors are shown */
  activeAdapterType?: FloorProvider | null;
};

const PROVIDER_LABEL: Record<FloorProvider, string> = {
  demo: "Demo",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  paperclip: "Paperclip",
  custom: "Custom",
  local: "Local",
  claw3d: "Claw3D",
};

const renderFloorButton = (params: {
  floor: FloorDefinition;
  activeFloorId: FloorId;
  floorRosterCache: Record<FloorId, FloorRosterState>;
  onSelectFloor: (floorId: FloorId) => void;
}) => {
  const { floor, activeFloorId, floorRosterCache, onSelectFloor } = params;
  const active = floor.id === activeFloorId;
  const rosterState = floorRosterCache[floor.id];
  const rosterCount = rosterState?.entries.length ?? 0;
  const rosterStatus = rosterState?.status ?? "idle";

  return (
    <button
      key={floor.id}
      type="button"
      onClick={() => onSelectFloor(floor.id)}
      disabled={!floor.enabled}
      className={[
        "w-full rounded-xl px-3 py-2 text-left transition-colors",
        active ? "hud-surface hud-surface-active" : "hud-surface",
        floor.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-45",
      ].join(" ")}
      aria-pressed={active}
      aria-label={`Select ${floor.label}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {floor.zone === "outside" ? "Destination" : "Floor"}
          </div>
          <div className="truncate text-sm font-semibold text-foreground">{floor.label}</div>
        </div>
        <span
          className={[
            "shrink-0 rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
            active ? "hud-surface-active text-foreground" : "hud-surface text-muted-foreground",
          ].join(" ")}
        >
          {PROVIDER_LABEL[floor.provider]}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
        <span>{floor.shortLabel}</span>
        {floor.enabled ? (
          <span>
            roster {rosterCount} | {rosterStatus}
          </span>
        ) : (
          <span>Locked</span>
        )}
      </div>
    </button>
  );
};

export function OfficeFloorNav({
  activeFloorId,
  floorRosterCache,
  onSelectFloor,
  activeAdapterType,
}: OfficeFloorNavProps) {
  const availableFloors = listAvailableFloorsForAdapter(activeAdapterType ?? null);
  const buildingFloors = availableFloors.filter((f) => f.zone === "building");
  const outsideFloors = availableFloors.filter((f) => f.zone === "outside");

  // Active floor — fall back to lobby if current floor is no longer available
  const activeIsAvailable = availableFloors.some((f) => f.id === activeFloorId);
  const displayActiveFloorId = activeIsAvailable ? activeFloorId : "lobby";

  const activeFloor =
    OFFICE_FLOORS.find((floor) => floor.id === displayActiveFloorId) ?? OFFICE_FLOORS[0];
  const activeRoster = floorRosterCache[activeFloor.id];

  const [directoryCollapsed, setDirectoryCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(DIRECTORY_COLLAPSED_STORAGE_KEY);
      if (stored === "true") setDirectoryCollapsed(true);
    } catch {
      // localStorage may be unavailable (private mode, SSR, etc.); ignore.
    }
  }, []);

  const toggleDirectoryCollapsed = () => {
    setDirectoryCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(DIRECTORY_COLLAPSED_STORAGE_KEY, String(next));
        } catch {
          // Persist is best-effort; collapsed state still works for the session.
        }
      }
      return next;
    });
  };

  return (
    <aside className="pointer-events-none fixed left-4 top-24 z-40 flex w-[240px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      <section className="hud-panel pointer-events-auto rounded-2xl p-3 shadow-2xl">
        <button
          type="button"
          onClick={toggleDirectoryCollapsed}
          className="flex w-full items-center justify-between gap-2 rounded font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={!directoryCollapsed}
          aria-controls="office-floor-directory-body"
          aria-label={
            directoryCollapsed ? "Expand building directory" : "Collapse building directory"
          }
        >
          <span>Building Directory</span>
          {directoryCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
        {!directoryCollapsed ? (
          <div id="office-floor-directory-body">
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="hud-btn rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
                onClick={() => onSelectFloor(getAdjacentEnabledOfficeFloorId(activeFloor.id, -1))}
                aria-label="Switch to previous enabled floor"
              >
                Prev
              </button>
              <button
                type="button"
                className="hud-btn rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
                onClick={() => onSelectFloor(getAdjacentEnabledOfficeFloorId(activeFloor.id, 1))}
                aria-label="Switch to next enabled floor"
              >
                Next
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Building
              </div>
              {buildingFloors.map((floor) =>
                renderFloorButton({
                  floor,
                  activeFloorId: displayActiveFloorId,
                  floorRosterCache,
                  onSelectFloor,
                }),
              )}
            </div>
            {outsideFloors.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Outside
                </div>
                {outsideFloors.map((floor) =>
                  renderFloorButton({
                    floor,
                    activeFloorId: displayActiveFloorId,
                    floorRosterCache,
                    onSelectFloor,
                  }),
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="hud-panel pointer-events-auto rounded-2xl px-3 py-2 shadow-xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Current Floor
        </div>
        <div className="mt-1 text-sm font-semibold text-foreground">{activeFloor.label}</div>
        <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>{PROVIDER_LABEL[activeFloor.provider]}</span>
          <span>
            roster {activeRoster?.entries.length ?? 0} | {activeRoster?.status ?? "idle"}
          </span>
        </div>
      </section>
    </aside>
  );
}
