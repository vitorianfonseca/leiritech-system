/**
 * Shared chart styling tokens.
 *
 * Single source of truth for how chart marks read against the cobalt LeiriTech
 * palette. Bar/Cell/Pie *fills* are softened uniformly so charts feel calm and
 * harmonious with the paper-and-ink surfaces (the dashboard area chart already
 * uses a soft 0.35→0.02 gradient — this brings every other mark to the same
 * register). Strokes, lines, axes, labels and legend swatches stay at full
 * opacity so meaning is never carried by a washed-out fill alone (WCAG: colour
 * is always paired with an icon/label elsewhere).
 */
export const CHART_FILL_OPACITY = 0.6;
