"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Volume2, VolumeX } from "lucide-react";
import { useSound } from "@/lib/use-sound";

/**
 * Sound is opt-in. Nobody agreed to noise by opening a work tool, so the
 * switch starts off and the only way it makes a sound is if someone asks
 * for one — including the confirmation cue when they turn it on.
 */
export function SoundPreference() {
  const t = useTranslations("profile.preferences.sound");
  const { enabled, volume, toggle, changeVolume, play } = useSound();

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-heading text-base font-semibold text-foreground">
          {t("title")}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <label
          htmlFor="sound-enabled"
          className="flex items-center justify-between gap-3 p-4"
        >
          <span className="flex items-center gap-2.5">
            {enabled ? (
              <Volume2 className="size-4 text-signal" aria-hidden />
            ) : (
              <VolumeX className="size-4 text-muted-foreground" aria-hidden />
            )}
            <span className="font-medium text-foreground">{t("label")}</span>
          </span>

          <input
            id="sound-enabled"
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-6 w-11 shrink-0 rounded-full bg-muted transition-colors duration-[var(--duration-fast)] peer-checked:bg-signal peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card motion-reduce:transition-none"
          >
            <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow-sm transition-transform duration-[var(--duration-fast)] [transition-timing-function:var(--ease-spring)] peer-checked:translate-x-5 motion-reduce:transition-none" />
          </span>
        </label>

        {enabled ? (
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3">
              <label
                htmlFor="sound-volume"
                className="text-sm text-muted-foreground"
              >
                {t("volume")}
              </label>
              <input
                id="sound-volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                onPointerUp={() => play("click")}
                className="h-1.5 flex-1 appearance-none rounded-full bg-muted accent-signal"
              />
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>

            <button
              type="button"
              onClick={() => play("taskComplete")}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
            >
              {t("preview")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
