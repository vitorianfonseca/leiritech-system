import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Global test setup for the Vitest/jsdom component suite.
 *
 * jsdom implements neither the layout APIs that Base UI's positioning code
 * touches nor `matchMedia`, which `next-themes` and the responsive helpers read
 * on mount. Stubbing them here keeps every test file free of boilerplate.
 */

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
    return false;
  };
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}

// Base UI's dialog/popover close sequence waits on the Web Animations API,
// which jsdom does not implement. Reporting "no running animations" lets the
// close transition resolve immediately instead of throwing after teardown.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = function getAnimations(): Animation[] {
    return [];
  };
}

// jsdom cannot follow a real navigation and logs "Not implemented" whenever a
// test clicks a genuine <a href>. Tests assert on the handlers and the href, so
// swallow the default action to keep the output readable.
document.addEventListener(
  "click",
  (event) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a");
    if (anchor?.getAttribute("href")) event.preventDefault();
  },
  true,
);
