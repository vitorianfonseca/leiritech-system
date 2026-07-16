"use client";

import * as React from "react";
import type {
  ActiveTimer,
  StoppedTimer,
  TimerContextValue,
  TimerTask,
} from "./types";

/**
 * App-wide single-active-timer state (BR-040).
 *
 * Mount `<TimerProvider>` high in the tree (AppProviders) so every surface —
 * My Work (#27), Tasks (#34), Time Tracking (#35) — reads and mutates the SAME
 * timer. Starting a timer while another runs auto-stops the first, guaranteeing
 * exactly one running timer at the state layer; callers layer a confirm UX on
 * top by inspecting `active` before calling `start`.
 *
 * State lives in a module-level external store consumed via
 * `useSyncExternalStore` — this keeps SSR and hydration consistent without
 * `setState`-in-effect, mirrors the active timer to localStorage (so it
 * survives navigation/reload with accurate elapsed time), ticks once per second
 * while running, and stays in sync across browser tabs.
 */

const STORAGE_KEY = "aurea.timer.active";

interface Snapshot {
  active: ActiveTimer | null;
  /** Wall-clock stamp that advances the elapsed display each tick. */
  now: number;
  /** True once the store has hydrated from storage on the client. */
  ready: boolean;
}

/** Stable server snapshot — identical reference every call (required). */
const SERVER_SNAPSHOT: Snapshot = { active: null, now: 0, ready: false };

let snapshot: Snapshot = { active: null, now: Date.now(), ready: false };
const listeners = new Set<() => void>();
let tickId: number | null = null;
let hydrated = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function set(next: Snapshot): void {
  snapshot = next;
  syncTicking();
  emit();
}

function syncTicking(): void {
  if (typeof window === "undefined") return;
  if (snapshot.active && tickId === null) {
    tickId = window.setInterval(() => {
      set({ ...snapshot, now: Date.now() });
    }, 1000);
  } else if (!snapshot.active && tickId !== null) {
    window.clearInterval(tickId);
    tickId = null;
  }
}

function readStored(): ActiveTimer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveTimer>;
    if (
      typeof parsed?.taskId === "string" &&
      typeof parsed?.taskTitle === "string" &&
      typeof parsed?.startedAt === "number"
    ) {
      return {
        taskId: parsed.taskId,
        taskTitle: parsed.taskTitle,
        projectId: parsed.projectId,
        projectName: parsed.projectName,
        startedAt: parsed.startedAt,
      };
    }
  } catch {
    // Corrupt payload — ignore and start clean.
  }
  return null;
}

function persist(active: ActiveTimer | null): void {
  if (typeof window === "undefined") return;
  try {
    if (active) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode / quota) — timer still works in-memory.
  }
}

function hydrateOnce(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const stored = readStored();
  set({ active: stored, now: Date.now(), ready: true });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // First subscriber hydrates from storage and wires cross-tab sync.
  hydrateOnce();
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    set({ active: readStored(), now: Date.now(), ready: true });
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return SERVER_SNAPSHOT;
}

function finish(current: ActiveTimer | null, endedAt: number): StoppedTimer | null {
  if (!current) return null;
  return {
    taskId: current.taskId,
    taskTitle: current.taskTitle,
    projectId: current.projectId,
    projectName: current.projectName,
    startedAt: current.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - current.startedAt),
  };
}

/** Start timing a task, auto-stopping any running timer (single-active). */
function startTimer(task: TimerTask): StoppedTimer | null {
  const now = Date.now();
  const finished =
    snapshot.active && snapshot.active.taskId !== task.taskId
      ? finish(snapshot.active, now)
      : null;
  const next: ActiveTimer = { ...task, startedAt: now };
  persist(next);
  set({ active: next, now, ready: true });
  return finished;
}

/** Stop the active timer, returning its finished segment. */
function stopTimer(): StoppedTimer | null {
  const now = Date.now();
  const finished = finish(snapshot.active, now);
  persist(null);
  set({ active: null, now, ready: true });
  return finished;
}

const TimerContext = React.createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const snap = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const isRunning = React.useCallback(
    (taskId: string) => snap.active?.taskId === taskId,
    [snap.active]
  );

  const elapsedMs = snap.active ? Math.max(0, snap.now - snap.active.startedAt) : 0;

  const value = React.useMemo<TimerContextValue>(
    () => ({
      active: snap.active,
      elapsedMs,
      ready: snap.ready,
      isRunning,
      start: startTimer,
      stop: stopTimer,
    }),
    [snap.active, snap.ready, elapsedMs, isRunning]
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer(): TimerContextValue {
  const ctx = React.useContext(TimerContext);
  if (!ctx) {
    throw new Error("useTimer must be used within a <TimerProvider>.");
  }
  return ctx;
}

/** Format elapsed milliseconds as H:MM:SS (or MM:SS under an hour). */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
