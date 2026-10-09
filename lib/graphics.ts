/**
 * What the current browser can actually draw with.
 *
 * Measured in the browser this project is verified with (headless Chromium, no GPU): Canvas 2D,
 * WebGL 1 and WebGL 2 all work — WebGL through SwiftShader's software rasteriser, a real context
 * returning real pixels, roughly an order of magnitude slower than hardware. `navigator.gpu` is
 * absent there.
 *
 * WebGPU is deliberately not a tier here. It is absent where this project is verified, and on
 * visitors' real machines it was unreliable: `navigator.gpu` existing does not mean an adapter or a
 * device can be had, and apps that took that branch rendered nothing. Build on 2D or WebGL.
 *
 * Every function here is safe to call during a server render: they return the pessimistic answer
 * (`"none"`, `false`) when there is no `window`, and the real one after hydration.
 */

export type GraphicsTier = "webgl2" | "webgl" | "2d" | "none";

/** The best context this browser can give, in the order `CanvasStage` would try `["webgl2", "webgl", "2d"]`. */
export function detectGraphicsTier(): GraphicsTier {
  if (typeof window === "undefined") return "none";
  if (hasContext("webgl2")) return "webgl2";
  if (hasContext("webgl")) return "webgl";
  if (hasContext("2d")) return "2d";
  return "none";
}

export function supportsWebGL(): boolean {
  const tier = detectGraphicsTier();
  return tier === "webgl2" || tier === "webgl";
}

/**
 * Whether the visitor has asked for stillness.
 *
 * Anything that moves on its own must consult this and settle into a meaningful static frame —
 * not freeze at frame zero, which for most simulations is an empty one.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A throwaway canvas rather than the real one: asking an element for a `"webgl"` context after it
 * has been given a `"webgl2"` one returns null, so probing the canvas you intend to draw into is
 * how detection ends up reporting failure on a canvas that works perfectly.
 */
function hasContext(kind: "webgl" | "webgl2" | "2d"): boolean {
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    return probe.getContext(kind) !== null;
  } catch {
    return false;
  }
}
