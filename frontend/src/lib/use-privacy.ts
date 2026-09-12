"use client";

import * as React from "react";

/**
 * Hide monetary figures on screen without hiding them from the person.
 *
 * A three-person studio works in cafés, on calls with the screen shared, and
 * next to clients. Every other number in the product is safe to show; the
 * money is not. This masks amounts at render time only — it is a curtain, not
 * a permission. Actual access is decided by BR-008 on the server, and nothing
 * here changes what the API returns.
 *
 * The preference is per-browser on purpose: it describes where you are
 * sitting, not who you are.
 */
export const PRIVACY_KEY = "leiritech.privacy.hideAmounts";
const EVENT = "leiritech:privacy";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PRIVACY_KEY) === "true";
  } catch {
    return false;
  }
}

export function setHideAmounts(on: boolean): void {
  try {
    window.localStorage.setItem(PRIVACY_KEY, String(on));
  } catch {
    /* blocked storage: the toggle still works for this page view */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The mask. Fixed width so a hidden figure does not reflow the layout. */
export const MASK = "••••••";

export function useHideAmounts(): {
  hidden: boolean;
  toggle: (on: boolean) => void;
} {
  // Always false on the server and on first paint, so SSR and hydration agree;
  // the real preference lands in the effect below.
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    const sync = () => setHidden(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { hidden, toggle: setHideAmounts };
}
