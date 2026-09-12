"use client";

import * as React from "react";
import {
  getSoundVolume,
  isSoundEnabled,
  playSound,
  setSoundEnabled,
  setSoundVolume,
  type SoundCue,
} from "./sound";

/**
 * Read and control the sound system from a component.
 *
 * `play` is safe to call unconditionally — it no-ops when sound is off, so
 * call sites stay free of `if (soundOn)` noise. State stays in sync across
 * components (and across tabs) by listening for both the in-page settings
 * event and `storage`.
 */
export function useSound() {
  const [enabled, setEnabledState] = React.useState(false);
  const [volume, setVolumeState] = React.useState(0.5);

  React.useEffect(() => {
    const sync = () => {
      setEnabledState(isSoundEnabled());
      setVolumeState(getSoundVolume());
    };
    sync(); // after mount only: localStorage is not available during SSR
    window.addEventListener("leiritech:sound-settings", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("leiritech:sound-settings", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const play = React.useCallback((cue: SoundCue) => playSound(cue), []);

  const toggle = React.useCallback((on: boolean) => {
    setSoundEnabled(on);
    // Confirm the change audibly — the only honest way to preview a toggle.
    if (on) playSound("success");
  }, []);

  const changeVolume = React.useCallback((v: number) => {
    setSoundVolume(v);
  }, []);

  return { enabled, volume, play, toggle, changeVolume };
}
