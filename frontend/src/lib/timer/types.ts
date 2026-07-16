/**
 * Shared timer models (BR-040/BR-043).
 *
 * The single-active-timer contract is app-wide: only ONE timer may run at a
 * time across the whole application. These types are consumed by the
 * `TimerProvider`/`useTimer` hook and by any surface that starts, stops or
 * displays the active timer (issue #27 My Work, #34 Tasks, #35 Time Tracking).
 * Integration (#35) persists stopped entries to the backend without changing
 * these shapes.
 */

/** The work item a timer is attributed to (BR-043 — attribution). */
export interface TimerTask {
  taskId: string;
  taskTitle: string;
  projectId?: string;
  projectName?: string;
}

/** A currently-running timer. `startedAt` is an epoch-ms wall-clock stamp so
 * elapsed time recomputes correctly across navigation and reloads. */
export interface ActiveTimer extends TimerTask {
  /** Epoch milliseconds when the timer started. */
  startedAt: number;
}

/** A finished timer segment, ready to be recorded as a time entry (#35). */
export interface StoppedTimer extends TimerTask {
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface TimerContextValue {
  /** The single running timer, or null when idle. */
  active: ActiveTimer | null;
  /** Live elapsed milliseconds for the active timer (0 when idle). */
  elapsedMs: number;
  /** True once the provider has hydrated from storage (avoids SSR mismatch). */
  ready: boolean;
  /** Whether a given task is the one currently being timed. */
  isRunning: (taskId: string) => boolean;
  /**
   * Start timing a task. Enforces the single-active contract: any running
   * timer is stopped first and its finished segment is returned so the caller
   * can record/attribute it. Callers that want a confirmation UX should check
   * `active` and confirm BEFORE calling this.
   */
  start: (task: TimerTask) => StoppedTimer | null;
  /** Stop the active timer, returning its finished segment (or null if idle). */
  stop: () => StoppedTimer | null;
}
