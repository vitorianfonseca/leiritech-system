/**
 * Spot illustrations.
 *
 * Drawn rather than sourced, for two reasons. They stay on the product's own
 * palette — blue, lavender, mint, peach — so they read as part of the
 * interface instead of stock art dropped into it. And as inline SVG they
 * inherit the theme, scale without assets, and cost nothing to load.
 *
 * Deliberately objects and not people: a studio's internal tool showing
 * cartoon characters looks like a consumer app wearing a costume. These are
 * abstract, calm, and carry the palette's warmth without the mascot.
 */

import type { SVGProps } from "react";

const ACCENT = "oklch(0.605 0.165 264)";
const ACCENT_SOFT = "oklch(0.900 0.070 264)";
const LAVENDER = "oklch(0.643 0.125 289)";
const LAVENDER_SOFT = "oklch(0.910 0.055 289)";
const MINT = "oklch(0.620 0.095 175)";
const MINT_SOFT = "oklch(0.915 0.055 175)";
const PEACH_SOFT = "oklch(0.920 0.060 57)";

/** Nothing needs you. A settled stack, one piece lifted and checked off. */
export function AllClearIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 120" fill="none" aria-hidden {...props}>
      <ellipse cx="80" cy="103" rx="52" ry="7" fill={LAVENDER_SOFT} opacity="0.55" />
      <rect x="34" y="72" width="92" height="16" rx="8" fill={LAVENDER_SOFT} />
      <rect x="40" y="52" width="80" height="16" rx="8" fill={PEACH_SOFT} />
      <rect x="46" y="32" width="68" height="16" rx="8" fill={MINT_SOFT} />
      <circle cx="114" cy="30" r="17" fill={MINT} />
      <path
        d="M106 30.5l5.5 5.5L123 24.5"
        stroke="white"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="22" r="4" fill={ACCENT_SOFT} />
      <circle cx="132" cy="62" r="3" fill={ACCENT_SOFT} />
    </svg>
  );
}

/** A clear week: an empty grid with the sun over it. */
export function ClearWeekIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 120" fill="none" aria-hidden {...props}>
      <ellipse cx="80" cy="104" rx="48" ry="6" fill={LAVENDER_SOFT} opacity="0.5" />
      <rect x="34" y="34" width="92" height="62" rx="14" fill="white" />
      <rect
        x="34"
        y="34"
        width="92"
        height="62"
        rx="14"
        stroke={LAVENDER_SOFT}
        strokeWidth="2"
      />
      <rect x="34" y="34" width="92" height="16" rx="8" fill={LAVENDER_SOFT} />
      <circle cx="48" cy="42" r="2.4" fill={LAVENDER} />
      <circle cx="58" cy="42" r="2.4" fill={LAVENDER} />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={45 + col * 19}
            y={59 + row * 12}
            width="11"
            height="5"
            rx="2.5"
            fill={LAVENDER_SOFT}
            opacity="0.75"
          />
        )),
      )}
      <circle cx="122" cy="26" r="13" fill={PEACH_SOFT} />
      <circle cx="122" cy="26" r="7" fill={ACCENT} opacity="0.85" />
    </svg>
  );
}

/** Nothing recorded yet: a quiet trail waiting for its first mark. */
export function NoHistoryIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 120" fill="none" aria-hidden {...props}>
      <ellipse cx="80" cy="102" rx="46" ry="6" fill={LAVENDER_SOFT} opacity="0.5" />
      <path
        d="M30 84c18 0 18-22 36-22s18 22 36 22 18-30 28-30"
        stroke={LAVENDER_SOFT}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="7 9"
      />
      <circle cx="30" cy="84" r="6" fill={LAVENDER_SOFT} />
      <circle cx="66" cy="62" r="6" fill={PEACH_SOFT} />
      <circle cx="102" cy="84" r="6" fill={MINT_SOFT} />
      <circle cx="130" cy="54" r="9" fill={ACCENT} />
      <circle cx="130" cy="54" r="3.4" fill="white" />
    </svg>
  );
}

/** Nothing here yet, and something could be. Used by generic empty states. */
export function EmptyBoxIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 120" fill="none" aria-hidden {...props}>
      <ellipse cx="80" cy="102" rx="44" ry="6" fill={LAVENDER_SOFT} opacity="0.5" />
      <path d="M42 56h76l-8 42a6 6 0 01-6 5H56a6 6 0 01-6-5L42 56z" fill="white" />
      <path
        d="M42 56h76l-8 42a6 6 0 01-6 5H56a6 6 0 01-6-5L42 56z"
        stroke={LAVENDER_SOFT}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <rect x="36" y="44" width="88" height="15" rx="7.5" fill={LAVENDER_SOFT} />
      <rect x="70" y="70" width="20" height="4" rx="2" fill={LAVENDER_SOFT} />
      <circle cx="118" cy="32" r="5" fill={ACCENT_SOFT} />
      <circle cx="44" cy="28" r="3.4" fill={MINT_SOFT} />
    </svg>
  );
}
