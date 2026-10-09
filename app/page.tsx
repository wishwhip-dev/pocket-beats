import { DrumMachine } from "./drum-machine";

/**
 * The drum machine. A server component on purpose: the heading and description render on the
 * server, and the interactive machine is a client island inside it.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Four-track step sequencer</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{identity.name}</h1>
        <p className="text-muted-foreground">
          Tap steps into the grid, press Play to hear the loop, and share the pattern to Stories as a picture.
        </p>
      </header>
      <DrumMachine />
    </main>
  );
}
