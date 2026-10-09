# Working in this project

A reviewed Next.js App Router starter for something drawn: a visual, a toy, a simulation or a
game. It builds and runs as-is; `app/page.tsx` and `app/starter-scene.tsx` are a placeholder meant
to be replaced by the product you are asked for.

Read this instead of exploring. It is the whole setup.

## What this project is for

An interactive drawing on a canvas: a visual, an animation, a simulation or a small game, in 2D or WebGL. It can remember a few small values, such as a high score or settings, but keeps no records.

Good for: games and playful toys, including a saved high score or settings; generative art and animation; physics, particle and other simulations; interactive visualisations and 3D scenes (WebGL); instruments and sound toys.

Not built for: saving records or history between visits (only a few small values, such as a high score or settings); accounts or sign-in; calling outside services or APIs.

A request that needs one of these is outside what this project can deliver as it stands: plan the closest thing it can, and say plainly what was left out.

## Stack

Next.js App Router · TypeScript · Tailwind CSS · shadcn/ui · 14 shadcn/ui components pre-installed (dialog, select, table, card, form inputs, tabs, alert) · 11 more shadcn/ui components (accordion, collapsible, popover, progress, radio group, scroll area, slider, switch, toggle, toggle group, tooltip) · Canvas 2D and WebGL through CanvasStage · three.js (WebGL 2, software-rendered in the verification browser) · no WebGPU · Web Audio (one shared AudioContext in lib/audio.ts; sound starts on a user gesture) · MediaDevices microphone and MediaRecorder (requestMicrophone, recordMicrophone) · File API (FileDrop to choose, drop or paste files; lib/files.ts to read, check, resize and save them) · MediaDevices camera (CameraView and lib/camera.ts; opened from a button, never on load) · Web Share (ShareButton and lib/share.ts: a result drawn to an image and shared or saved, a link shared or copied).

## Layout

```
app/identity.ts              the app's name, description and colour; the title, icons, manifest and share image read it. Change them here.
app/layout.tsx               root layout — <html>/<body>, <Providers>, and metadata read from identity.ts.
app/page.tsx                 the placeholder page, a server component. Replace it.
app/starter-scene.tsx        the placeholder drawing (client). Replace or delete it.
app/globals.css              Tailwind entry and the dark design tokens.
app/providers.tsx            "use client" — composed from this project's modules. Already wired into layout.
types/webgpu.d.ts            WebGPU types, for type-checking only. Nothing here may require WebGPU.
template.capabilities.json   what this template ships, declared for the planner. Keep it accurate.
components/ui/               the shadcn components, already themed. See docs/components.md.
lib/utils.ts                 cn() — the className merge helper every shadcn component expects.
components.json              shadcn config: new-york, neutral, rsc, aliases @/components and @/lib.
components/canvas-stage.tsx  the canvas host. Pass it a renderer; do not hand-roll a canvas.
lib/graphics.ts              what the current browser can draw with (2D, WebGL). No WebGPU.
lib/audio.ts                 the shared AudioContext, unlock, mute, microphone request and recording. Use it; do not create another context.
components/file-drop.tsx     the file chooser and drop zone. Use it for every upload; do not hand-roll an input.
lib/files.ts                 read, check, resize, show and save files.
components/camera-view.tsx   camera preview, photo capture and its states. Use it rather than calling getUserMedia.
lib/camera.ts                request, attach, capture and stop a camera stream.
components/share-button.tsx  the share control, with its outcome shown as text. Use it; do not call navigator.share.
lib/share.ts                 draw a share card, share or save an image, share or copy a link.
```

`@/*` resolves to the project root (`tsconfig.json` paths). Import as `@/components/canvas-stage`.

The app's name, description and colour live in `app/identity.ts`; change them there, never in
`layout.tsx`. The title, the icons, the manifest and the share image all read it.

**That list is the entire project.** There is nothing else to discover, so do not spend steps
exploring for it. If you want to see the conventions before writing, the ones worth opening are
`app/starter-scene.tsx`, `components/canvas-stage.tsx` and `app/globals.css`.

## What this project ships

Each of these is already installed and already wired up. **Read the document before building on
one** — it carries the worked code, so you do not have to derive it, and it says what the thing
cannot do as well as what it can.

- **Component kit.** 14 shadcn/ui components, the design tokens they need, and the cn() helper. Read `docs/components.md` before building on it.
- **Canvas and 3D.** A canvas host (2D by default, WebGL opt-in with a 2D fallback) that handles sizing, DPR, the frame loop, hidden tabs, reduced motion and failure, plus three.js. Read `docs/graphics.md` before building on it.
- **Sound.** Web Audio set up properly: one shared context unlocked on a user gesture, hidden-tab handling, and the microphone with a visible denied state, recording and a level meter. Read `docs/audio.md` before building on it.
- **Files.** Choosing, dropping and pasting files through one component, plus helpers that check a file by opening it, shrink photos, show Blobs and save them. Read `docs/files.md` before building on it.
- **Camera.** The camera opened from a button, with a live preview, photo capture, a visible blocked or unavailable state, and its tracks stopped when done. Read `docs/camera.md` before building on it.
- **Sharing.** Share a result as an image sized for stories, posts or link previews, or share a link, with a save or copy fallback where the device has no share sheet. Read `docs/share.md` before building on it.

Nothing outside the stack above is set up. In particular, unless a document above says otherwise,
there is no database, no authentication and no external API. What may be saved between visits is
stated under *What the finished app must do*.

## Drawing

**Every canvas goes in `<CanvasStage>`.** It sizes the canvas to its element and the device pixel
ratio, runs the frame loop outside React, pauses it when the tab is hidden, honours reduced motion,
and shows an honest failure message when a context cannot be had. `docs/graphics.md` has the API
and worked examples; read it before writing a renderer.

**Only what is drawn needs a canvas.** A word game, a quiz, or a card or board game of clickable
cells is usually better as ordinary elements — buttons and a grid styled with Tailwind — which are
readable, focusable and clickable for free; use a canvas for what is genuinely drawn or animated.

**2D first.** A 2D canvas is the default and is right for most games, generative drawing,
particles and simulations. Use WebGL (three.js) when the idea needs depth or lighting, and give it
a 2D path behind it with `mode={["webgl2", "2d"]}` whenever the idea can be drawn flat.

**No WebGPU, at all.** It is absent in the browser your work is checked in, and on visitors' real
machines it was unreliable — apps built on it showed nothing. Do not write a WebGPU path, do not
install a WebGPU renderer, do not use `vgpu`. WebGL 2 covers everything WebGPU would have been
for here.

**The verification browser runs headless with no GPU, and is slow at WebGL.** It renders WebGL in software, roughly an order of
magnitude slower than a GPU: budget a few thousand triangles, not a million. 2D is unaffected.

**Per-frame state is not React state.** Positions, velocities and particle lists live in variables
inside the renderer. React holds what the page shows as text — a score, a level, a setting — and is
updated when that changes, not every frame.

## Conventions

**Server components by default.** The page is a server component that renders a client island
(`"use client"`) holding the stage and its controls. Keep the client boundary as low as you can.

**Tailwind v4 has no `tailwind.config.js`.** Configuration lives in CSS. Add design tokens with
`@theme` in `app/globals.css`; there is no JS config file to edit and creating one does nothing.
The theme is dark, with one palette on `:root`: style with tokens (`bg-card`,
`text-muted-foreground`), never with `dark:` variants, which never activate here.

**Dependencies.** `npm install <pkg>` works — there is a real shell with network access. Install
what the task genuinely needs rather than reimplementing it (a physics engine, a noise function),
and prefer a package that ships its own types. Large fixed data — levels, palettes, sprite maps —
belongs in its own module under `lib/`, separate from the component that draws it.

**Lint runs after you finish, and two rules fail most runs.**
`react-hooks/set-state-in-effect`: never call a state setter directly in a `useEffect` body.
Setting state inside a callback the effect subscribes to — an event listener, a timer, a promise's
`.then` — is allowed. `react/no-unescaped-entities`: a bare `'` or `"` in JSX text fails lint, so
"Don't" is written `Don&apos;t` (or `{"Don't"}`).

**Hydration.** The server renders every client component too, and its HTML must match the first
client render. Never read the current time, `Math.random()`, the window size or `window` during
render. Randomness that shapes what is drawn belongs inside the renderer, which only runs in the
browser; seed it with a constant if the first frame must be the same every time.

**`params` and `searchParams` are Promises (Next 16).** In a page, layout or `generateMetadata`,
type them as `Promise<{ id: string }>` and `await` them; reading `params.id` directly fails the
build.

## What the finished app must do

When you finish, the supervisor runs `npm install`, `npm test --if-present`, `npm run lint
--if-present` and `npm run build`, then opens the built app in a headless browser **and uses it**.
You cannot run that browser and should not try to imitate it; you pass it by building an app that
meets these requirements:

- **Every route renders visible content and throws nothing** — not on load, and not while it is
  being used. No uncaught exceptions, console errors or failed requests.
- **The drawing is visible on first load, without any input.** A game shows its board or title
  scene with a Start button, a visual shows itself moving. A stage that stays blank until something
  is clicked looks exactly like one that is broken.
- **The main interaction starts from a visible, enabled button with an honest text label**: "Start
  game", "Play", "Add particles", "Randomise". It sits on the page itself, not behind a menu or a
  hover. An icon-only button carries an `aria-label` that says the same. Keyboard and pointer
  controls on the canvas are listed on screen ("Arrow keys to steer, Space to jump"), and the
  canvas takes them only when it has focus or the game is running — pass `interactive` to the stage.
- **What matters is readable as text, outside the canvas.** Score, lives, level, the current value
  of every control, "Game over" and the final score: rendered in the DOM next to the stage and
  updated when they change. A canvas is pixels; nothing but eyes can read it.
- **Controls change what is drawn.** A slider, toggle or button that alters the scene does so
  visibly and immediately, and its current value is shown beside it.
- **A canvas that cannot draw says so.** `CanvasStage` shows a failure message when no context can
  be had; keep its `fallback` meaningful (what the drawing shows, the rules of the game) and never
  dress a failure up as a finished drawing.
- **Sound, if any, starts from a button and its state is visible.** Nothing is audible before a
  click, and the page shows whether sound is on. If *What this project ships* lists sound, its
  document has the pattern; follow it.
- **Every page renders when opened directly by its URL**, with no sign-in and no prior navigation,
  and the main flow works there. Nothing the product needs exists only behind a dynamic route such
  as `/items/[id]` or a query string.
- **Only small values may be saved between visits** — a high score, the settings, the last level
  reached — in `localStorage`, under keys named for this app. Read them after the page mounts (never
  during render, which breaks hydration) and carry on with defaults when storage is unavailable or
  the value is unreadable. Nothing richer: no lists of records and no history, because this project
  has no database. A value offered as saved that is gone after a reload is a lie to the person using
  the app.
- **The page title is the app's name from `app/identity.ts`**; the check reads it and a placeholder
  title counts against you. Keep the name and description there true to what the app became.
- **The check records any read of `navigator.gpu`**, and WebGPU access counts against you unless the
  goal explicitly asks for WebGPU.
- **Destructive actions say so in their label**: Delete, Remove, Clear, Reset, Discard, Sign out,
  Log out, Export, Download, Import, Undo. These are never pressed during the check, so none of them
  can be the only way into what a page does — and a control that hides one behind a harmless label
  is a lie to the person using the app. Import and Export mean moving the app's whole data set in or
  out; a control that loads a file as content — a photo, a document, a JSON file to open — is
  "Choose file", "Add photo" or "Load JSON", is pressed like any other control, and is never
  labelled Import.

`npm run build` passing is not evidence the product works — the untouched starter passes all four
commands. Neither is a page that renders: a game whose Start button throws renders perfectly. What
is judged is the running application, being used.

## Do not

- **Do not scaffold a new application over this one.** No `create-next-app`, no second `app/`
  directory. Build on what is here.
- **Do not run a dev server.** `next dev` / `npm run dev` are blocked. Use `npm run build` to
  check your work compiles.
- **Do not install Playwright, Puppeteer or Selenium.** Browser automation is blocked; the
  verification step above is how the page gets opened.
- **Do not reimplement something this project already ships.** A second canvas host, a second
  frame loop or a second AudioContext is wasted steps and a second source of bugs.
- **Do not require WebGPU or a GPU.** See *Drawing*.
- **Do not delete this file**, any document named above, or `template.capabilities.json`. The
  first two are the briefing for every later task on this repository; the third is how the planner
  knows what this project can do before it writes a single criterion.
