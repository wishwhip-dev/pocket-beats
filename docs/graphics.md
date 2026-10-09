# Canvas and 3D

`@/components/canvas-stage` is the host every canvas in this project sits in, and `three` is
installed for when a scene needs 3D. Do not hand-roll a `<canvas>` with its own resize and frame
loop: the stage already does sizing, device pixel ratio, the loop, pausing in a hidden tab,
reduced motion, context loss and the failure state, and a second copy of that is where canvas
bugs come from.

## 2D, the default

```tsx
"use client";

import { CanvasStage } from "@/components/canvas-stage";

<CanvasStage
  label="Twelve dots orbiting the centre."
  fallback={<p>Twelve dots orbiting the centre of the stage.</p>}
  start={({ ctx, width, height }) => {
    let w = width;
    let h = height;
    return {
      resize: (nextWidth, nextHeight) => { w = nextWidth; h = nextHeight; },
      frame: (elapsed) => {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < 12; i++) {
          const angle = elapsed * 0.6 + (i / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(w / 2 + Math.cos(angle) * h * 0.3, h / 2 + Math.sin(angle) * h * 0.3, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    };
  }}
/>
```

A 2D renderer draws in **CSS pixels**. The stage sizes the backing store to the device pixel ratio
and re-applies the scale after every resize, so never multiply by `dpr` yourself and never set
`canvas.width`.

## WebGL, opt-in, with a real fallback

Ask for an ordered list and branch on `kind`. TypeScript narrows `ctx` for each branch.

```tsx
<CanvasStage
  mode={["webgl2", "2d"]}
  label="A cube rotating slowly."
  fallback={<p>A cube, rotating.</p>}
  start={(stage) => {
    if (stage.kind === "2d") return flatCube(stage.ctx);   // the same idea, drawn in 2D
    return threeCube(stage.canvas, stage.dpr);              // stage.ctx is WebGL2RenderingContext here
  }}
/>
```

```tsx
import * as THREE from "three";

function threeCube(canvas: HTMLCanvasElement, dpr: number) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 3;
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshNormalMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return {
    resize: (w: number, h: number) => { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    frame: (t: number) => { mesh.rotation.set(t * 0.4, t * 0.6, 0); renderer.render(scene, camera); },
    dispose: () => { geometry.dispose(); material.dispose(); renderer.dispose(); },
  };
}
```

three.js needs WebGL 2, so its path is the `"webgl2"` branch. If you only ask for
`mode="webgl2"` and it is unavailable, the stage shows its failure state — honest, but nothing to
look at. List `"2d"` after it whenever the idea can be drawn flat.

## The props

- **`start`** sets the drawing up and returns `{ frame?, resize?, dispose? }`. It runs once per
  acquired context. `resize` is called once straight after it and after every size change;
  `frame(elapsed, delta)` runs every animation frame. `elapsed` skips time the tab was hidden or
  the stage was paused; `delta` is capped at 0.1 s. **Dispose every geometry, material, texture,
  renderer and listener you create.**
- **`label`** is the canvas's accessible name. A canvas is opaque to anything that cannot see it.
- **`fallback`** — see below.
- **`aspect`** sets the height as a fraction of the width (default `0.5625`, 16:9), or `"fill"` to
  fill a parent that has a height (a full-screen game). Do not reach for `h-[320px]`: the stage
  sizes itself from this, and a fixed height fights it.
- **`mode`** — `"2d"` (default), `"webgl2"`, `"webgl"`, or a list to try in order.
- **`motion`** — `"decorative"` (default) or `"essential"`. See *Reduced motion*.
- **`paused`** stops the loop without tearing the drawing down. Wire a Pause button to it.
- **`interactive`** makes the canvas focusable and stops touch scrolling on it. Set it when the
  canvas takes keyboard or pointer input.

## The frame loop is not React

`start` runs once. Everything that changes per frame — positions, velocities, the particle list —
lives in variables inside `start`, never in `useState`. A `setState` per frame re-renders the page
sixty times a second and is the most common reason a canvas app stutters.

What the page must *show as text* — a score, a level, a parameter's value — does go into React,
but only when it changes, not every frame. Input goes the other way through a ref:

```tsx
const speed = useRef(1);           // a slider writes speed.current; frame() reads it
<Slider onValueChange={([v]) => { speed.current = v; setSpeedLabel(v); }} ... />
```

Pointer and keyboard listeners are added in `start` (on `stage.canvas`, or `window` for keys) and
removed in `dispose`. Pointer coordinates are CSS pixels: `event.offsetX`, `event.offsetY`.

## What this browser can actually do

These were **measured in the verification browser** — headless Chromium, no GPU — not inferred
from flags.

| | |
| --- | --- |
| Canvas 2D | **works**, at normal speed |
| WebGL 1 and WebGL 2 | **work**, through SwiftShader's software rasteriser — real pixels, roughly an order of magnitude slower than hardware |
| `navigator.gpu` (WebGPU) | **absent**, under every flag combination tried |

So: **nothing in this project may require WebGPU**, and do not build a WebGPU path at all. It is
not only missing where your work is checked: on visitors' real machines it was unreliable — a
`navigator.gpu` that exists but yields no adapter, or a device that is lost — and apps built on it
rendered nothing. `vgpu` and other headless WebGPU renderers are not available either. WebGL 2
covers everything a WebGPU path would have been for here.

Software rasterising is slow. Keep geometry small, prefer a few thousand triangles to a few
hundred thousand, and do not expect sixty frames a second from WebGL there. A 2D canvas with a
few thousand shapes per frame is fine.

## `fallback` is not decoration, and failure is not hidden

`fallback` renders on the server and stays on screen until a context has been acquired, and it
stays in the page afterwards as the drawing's accessible description. Make it say what the drawing
shows — the conclusion, the numbers, the rules of the game.

If no context can be acquired, if the renderer throws (in `start`, `resize` or any `frame`), or if
the context is lost, the stage shows a failure message in words, styled as an error, above the
fallback. It never looks like a working drawing, and you should not try to make it: a blank or
decorative box where the drawing should be is how a broken canvas passes for one that works. A
renderer that throws is also logged as an error and its loop stops, because it is a bug. A lost
context that the browser restores (WebGL or 2D) runs `start` again, so `start` must create every
resource it draws with rather than reuse one from an earlier run.

## Reduced motion

`reducedMotion` is passed into your renderer.

- **`motion="decorative"`** (the default, for ambient animation): a visitor who asked for reduced
  motion gets **one settled frame** — not frame zero, which for most simulations is empty. Draw the
  finished state when `reducedMotion` is true.
- **`motion="essential"`** (a game, a simulation the visitor drives): the loop keeps running,
  because stopping it would break the product. Use `reducedMotion` to drop screen shake, flashing
  and parallax.

## Client component

Canvas work is client-side. The file needs `"use client"`, and `CanvasStage` already is one. Keep
the page itself a server component that renders the client piece.

## Picking the medium

| Reach for | When the thing being shown is |
| --- | --- |
| a chart component, if the project ships one | a quantity against a dimension — series, distributions, comparisons |
| DOM/SVG | discrete, labelled or clickable — states, small counts, diagrams, menus |
| `CanvasStage` in 2D | continuous motion, many moving things, games, generative drawing |
| `CanvasStage` + `three` (WebGL 2) | depth, lighting, 3D geometry — with a 2D path behind it |

Reach for 3D when the idea *is* spatial, not to make something flat look more impressive.
