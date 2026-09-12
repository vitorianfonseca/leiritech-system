/**
 * The canvas behind everything.
 *
 * Two blooms of the brand ink, one entering from the top-right and one from
 * the bottom-left, on light paper. Placed on that diagonal so the page has a
 * direction without either bloom sitting under the content that matters.
 *
 * Painted as CSS radial gradients rather than an image or a blurred element:
 * there is nothing for the compositor to redraw on scroll, and the colour
 * reads as light falling on the paper instead of a wash laid over it. Fixed
 * to the viewport so it stays put while the page scrolls under it.
 *
 * It sits at `z-0`, not behind everything: `body` paints the paper colour, so
 * a negative z-index would hide the mesh under it entirely. Content is lifted
 * to `z-10` instead, which puts the blooms between the ground and the page.
 */
export function MeshBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(46rem_32rem_at_100%_0%,var(--signal),transparent_60%)] opacity-[0.16] dark:opacity-[0.13]" />
      <div className="absolute inset-0 bg-[radial-gradient(44rem_30rem_at_0%_100%,var(--signal),transparent_58%)] opacity-[0.14] dark:opacity-[0.11]" />
    </div>
  );
}
