"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/graphics";

/**
 * The host every canvas in this project sits in.
 *
 * It exists because the things that break a canvas are the same every time, and none of them are
 * what the app is about: the context failing to exist, the backing store not matching the element's
 * size, device pixel ratio, the animation loop outliving the component or running in a hidden tab,
 * and a visitor who has asked for no motion. Those are handled here once.
 *
 * Two rules it enforces:
 *
 * - The frame loop never goes through React state. `start` runs once per acquired context and
 *   returns plain callbacks; the loop calls them from `requestAnimationFrame`. Keep per-frame state
 *   in variables inside `start` (or refs), and push only what the page must *show as text* — a
 *   score, a count — into React, and not every frame.
 * - A canvas that cannot draw never looks like one that worked. `fallback` renders on the server
 *   and stays up until a context exists; if none can be acquired, or the renderer throws, or the
 *   context is lost, the stage says so in words, above the fallback, styled as a failure.
 */

export type StageKind = "2d" | "webgl2" | "webgl";

type ContextOf = {
  "2d": CanvasRenderingContext2D;
  webgl2: WebGL2RenderingContext;
  webgl: WebGLRenderingContext;
};

type StageBase = {
  canvas: HTMLCanvasElement;
  /** CSS pixels — what layout and pointer coordinates are in. */
  width: number;
  height: number;
  /** Backing-store scale, capped at 2. `canvas.width === Math.round(width * dpr)`. */
  dpr: number;
  /** True when the visitor has asked for reduced motion. See `motion`. */
  reducedMotion: boolean;
};

/**
 * What `start` receives. `kind` says which context was acquired, so a stage asked for
 * `mode={["webgl2", "2d"]}` can branch on it and TypeScript narrows `ctx` to match.
 */
export type StageContext<K extends StageKind = StageKind> = K extends StageKind
  ? StageBase & { kind: K; ctx: ContextOf[K] }
  : never;

export type StageRenderer = {
  /**
   * Called once per animation frame. `elapsed` is seconds since start, not counting time the tab
   * was hidden or the stage was paused; `delta` is seconds since the previous frame, capped at 0.1
   * so a stall never teleports a simulation. Omit `frame` for a static drawing.
   */
  frame?: (elapsed: number, delta: number) => void;
  /** Called after every resize, before the next frame. Re-create size-dependent resources here. */
  resize?: (width: number, height: number, dpr: number) => void;
  /** Release GPU resources and listeners here. Always called on unmount and on context loss. */
  dispose?: () => void;
};

type StageState = "starting" | "live" | "unavailable" | "failed" | "lost";

type CanvasStageProps<K extends StageKind> = {
  /**
   * Set up the drawing and return how to drive it. Runs once per acquired context, and again after
   * a lost context is restored (WebGL or 2D), so it must create everything it draws with rather
   * than close over resources from an earlier run. If it, `resize` or `frame` throws, the loop
   * stops and the stage shows a failure.
   */
  start: (stage: StageContext<K>) => StageRenderer | void;
  /**
   * Which context to acquire, or an ordered list to try. Default `"2d"`.
   * `["webgl2", "2d"]` is the real fallback: WebGL where it works, the 2D path where it does not.
   */
  mode?: K | readonly K[];
  /** Shown on the server, kept as the accessible description once live, and shown again if the
   *  canvas cannot draw. Required, deliberately: say what the drawing shows, in words. */
  fallback: React.ReactNode;
  /** Describes the drawing for someone who cannot see it. Required, deliberately. */
  label: string;
  /** Height as a fraction of width (default 0.5625, 16:9), or `"fill"` to fill a parent that has a height. */
  aspect?: number | "fill";
  /**
   * `"decorative"` (default): motion is ornament, so a visitor who asked for reduced motion gets one
   * settled frame. `"essential"`: motion is the product — a game, a simulation the visitor drives —
   * so the loop keeps running and `reducedMotion` is only a hint to tone down effects.
   */
  motion?: "decorative" | "essential";
  /** Stops the loop without tearing the drawing down, e.g. for a Pause button. Time does not advance while paused. */
  paused?: boolean;
  /** Makes the canvas focusable and stops touch scrolling on it, for keyboard and pointer input. */
  interactive?: boolean;
  className?: string;
};

const FAILURE_TITLE: Record<Exclude<StageState, "starting" | "live">, string> = {
  unavailable: "This drawing cannot run in this browser",
  failed: "This drawing failed to start",
  lost: "The drawing stopped",
};

function describeModes(modes: readonly StageKind[]): string {
  const names = modes.map((kind) => (kind === "2d" ? "a 2D canvas" : kind === "webgl2" ? "WebGL 2" : "WebGL"));
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export function CanvasStage<const K extends StageKind = "2d">({
  start,
  mode,
  fallback,
  label,
  aspect = 0.5625,
  motion = "decorative",
  paused = false,
  interactive = false,
  className,
}: CanvasStageProps<K>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(start);
  const pausedRef = useRef(paused);
  const controlRef = useRef<{ sync: () => void } | null>(null);
  const [{ state, detail }, setStatus] = useState<{ state: StageState; detail: string }>({ state: "starting", detail: "" });

  // `start` is almost always an inline arrow function, so it is a new value on every render.
  // Keeping it in a ref is what stops the setup effect from tearing down and re-creating the whole
  // drawing on every parent state change — which, for a stage beside a slider, is every drag event.
  useEffect(() => {
    startRef.current = start;
  });

  // A list literal is a new array every render; the effect keys on its contents instead.
  const modeKey = (mode === undefined ? ["2d"] : Array.isArray(mode) ? mode : [mode]).join(",");

  useEffect(() => {
    pausedRef.current = paused;
    controlRef.current?.sync();
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const modes = modeKey.split(",") as K[];
    let disposed = false;
    // Status reaches React from a microtask rather than the effect body: the canvas setup has to run
    // synchronously, and a setState in an effect body is a lint error that cascades renders.
    const report = (next: StageState, message = "") => queueMicrotask(() => {
      if (!disposed) setStatus({ state: next, detail: message });
    });

    let kind: K | undefined;
    let ctx: RenderingContext | null = null;
    for (const candidate of modes) {
      try {
        ctx = canvas.getContext(candidate, candidate === "2d" ? undefined : { antialias: true });
      } catch {
        ctx = null;
      }
      if (ctx) {
        kind = candidate;
        break;
      }
    }
    if (!ctx || !kind) {
      report("unavailable", `It needs ${describeModes(modes)}, and this browser could not provide one.`);
      return () => { disposed = true; };
    }

    const reducedMotion = prefersReducedMotion();
    const animate = motion === "essential" || !reducedMotion;
    let renderer: StageRenderer | void = undefined;
    // Whether a renderer is running on a live context. Separate from `renderer`, which is undefined
    // for a `start` that draws once and returns nothing.
    let active = false;
    let raf = 0;
    // The clock excludes hidden and paused time, so a tab left in the background does not come back
    // to a simulation that has jumped minutes ahead.
    let elapsed = 0;
    let last = 0;

    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth));
      const height = Math.max(1, Math.round(canvas.clientHeight));
      return { dpr, width, height };
    };

    // Setting `canvas.width` resets a 2D context's transform. Re-applying the DPR scale here is what
    // lets a 2D renderer draw in CSS pixels and never think about the backing store.
    const scale2d = (dpr: number) => {
      if (kind === "2d") (ctx as CanvasRenderingContext2D).setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // Releases the renderer without letting a throwing `dispose` hide the reason it is going away.
    const release = () => {
      active = false;
      const current = renderer;
      renderer = undefined;
      try { current?.dispose?.(); } catch (error) { console.error(error); }
    };

    // A renderer that throws — in `start`, `resize` or any `frame` — is a bug. It is logged as well as
    // shown, and the loop stops: a stage that keeps scheduling a throwing frame and still reports
    // `live` makes a broken drawing indistinguishable from a working one.
    const fail = (error: unknown) => {
      console.error(error);
      stop();
      release();
      report("failed", error instanceof Error ? error.message : String(error));
    };

    // Runs a renderer callback, failing the stage if it throws. Returns false when it did.
    const guarded = (call: () => void) => {
      try {
        call();
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const delta = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      elapsed += delta;
      guarded(() => renderer?.frame?.(elapsed, delta));
    };

    const running = () => animate && !!renderer?.frame && !pausedRef.current && document.visibilityState === "visible";
    const sync = () => {
      if (disposed) return;
      if (running() && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!running() && raf) {
        stop();
      }
    };

    const applySize = () => {
      if (disposed || !active) return;
      const { dpr, width, height } = measure();
      const backingWidth = Math.round(width * dpr);
      const backingHeight = Math.round(height * dpr);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }
      scale2d(dpr);
      guarded(() => {
        renderer?.resize?.(width, height, dpr);
        // Nothing is about to draw the new size when the loop is stopped, so redraw here.
        if (!raf) renderer?.frame?.(elapsed, 0);
      });
    };

    // Acquire-time setup, run on mount and again when a lost context is restored: the context
    // object is the same, but everything created on it (buffers, textures, a 2D transform) is gone.
    const launch = () => {
      const { dpr, width, height } = measure();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      scale2d(dpr);
      const started = guarded(() => {
        renderer = startRef.current({ canvas, ctx, kind, width, height, dpr, reducedMotion } as StageContext<K>);
        renderer?.resize?.(width, height, dpr);
        renderer?.frame?.(0, 0);
      });
      if (!started) return;
      active = true;
      report("live");
      sync();
    };

    launch();

    const observer = new ResizeObserver(applySize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    controlRef.current = { sync };

    // Moving the window to a monitor with a different pixel ratio changes the DPR without changing
    // the element's size, so the ResizeObserver never fires. A resolution query that matches only the
    // current ratio does; it is re-armed for the new ratio each time.
    let resolution: MediaQueryList | undefined;
    const watchResolution = () => {
      resolution?.removeEventListener("change", onResolution);
      resolution = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolution?.addEventListener("change", onResolution);
    };
    function onResolution() {
      watchResolution();
      applySize();
    }
    watchResolution();

    // A lost context leaves a canvas that silently draws nothing. Saying so is the honest response.
    // For WebGL, preventDefault is what allows the browser to offer a restore at all; for a 2D
    // canvas it is the opposite — cancelling `contextlost` refuses the restore — so it is not called.
    let lost = false;
    const onLost = (event: Event) => {
      if (event.type === "webglcontextlost") event.preventDefault();
      // A stage that already failed stays failed: its renderer is a bug, and a restore would rerun it.
      if (disposed || !active) return;
      lost = true;
      stop();
      release();
      report("lost", "The graphics context was lost, usually because the device ran short of graphics memory. It resumes if the browser restores it; otherwise reload the page.");
    };
    const onRestored = () => {
      if (disposed || !lost) return;
      lost = false;
      launch();
    };
    const lostEvent = kind === "2d" ? "contextlost" : "webglcontextlost";
    const restoredEvent = kind === "2d" ? "contextrestored" : "webglcontextrestored";
    canvas.addEventListener(lostEvent, onLost);
    canvas.addEventListener(restoredEvent, onRestored);

    return () => {
      disposed = true;
      stop();
      controlRef.current = null;
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener(lostEvent, onLost);
      canvas.removeEventListener(restoredEvent, onRestored);
      resolution?.removeEventListener("change", onResolution);
      observer.disconnect();
      release();
    };
  }, [modeKey, motion]);

  const live = state === "live";
  const failure = state === "starting" || state === "live" ? null : state;
  const failed = failure !== null;

  return (
    <div
      data-canvas-stage={state}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-card",
        failed ? "border-destructive/60" : "border-border",
        aspect === "fill" && "h-full",
        className,
      )}
      style={aspect === "fill" ? undefined : { aspectRatio: `1 / ${aspect}` }}
    >
      <canvas
        ref={canvasRef}
        role={interactive ? "application" : "img"}
        aria-label={label}
        tabIndex={interactive ? 0 : undefined}
        className={cn(
          "absolute inset-0 h-full w-full",
          live ? "opacity-100" : "opacity-0",
          interactive && "touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
      {/* Kept mounted rather than swapped out: it is the accessible description of the drawing as
          well as the fallback, and unmounting it would leave a route whose only content is a canvas. */}
      <div
        aria-hidden={live}
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-auto p-4 text-center text-sm",
          live && "sr-only",
          failed ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {failure ? (
          <div role="alert" className="flex max-w-md flex-col items-center gap-1">
            <p className="font-semibold text-destructive">{FAILURE_TITLE[failure]}</p>
            <p className="text-muted-foreground">{detail}</p>
          </div>
        ) : null}
        {fallback}
      </div>
    </div>
  );
}
