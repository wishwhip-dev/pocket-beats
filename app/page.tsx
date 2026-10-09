import { StarterScene } from "./starter-scene";

/**
 * The placeholder. Replace it, and delete `starter-scene.tsx` with it.
 *
 * It is a server component on purpose: the heading and the text below render on the server, so the
 * route has readable content before any script runs, and the drawing is a client island inside it.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Ready to draw</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Describe this canvas app in the task goal.
        </h1>
        <p className="text-lg text-muted-foreground">
          The coding agent will replace this starter scene with the requested visual, toy or game.
        </p>
      </div>
      <StarterScene />
    </main>
  );
}
