/**
 * The built-in patterns, as data, separate from the grid component that plays them.
 *
 * Each row is one 16-character step string in the fixed track order kick, snare, hat, clap:
 * "x" is an active step, anything else is empty. `tempo` is the BPM the preset suggests and
 * selecting it also moves the tempo slider there.
 */

export type Preset = {
  name: string;
  tempo: number;
  /** Sixteen characters per track, in the order kick, snare, hat, clap. */
  rows: [string, string, string, string];
};

export const TRACK_ORDER = ["kick", "snare", "hat", "clap"] as const;

export const STEP_COUNT = 16;

/** The pattern on the grid before anything is touched, and the fallback when storage is empty. */
export const DEMO: Preset = {
  name: "Demo groove",
  tempo: 108,
  rows: [
    "x-------x-x-----", // kick
    "----x-------x---", // snare
    "x-x-x-x-x-x-x-x-", // hat
    "------------x---", // clap
  ],
};

export const PRESETS: readonly Preset[] = [
  {
    name: "Four on the floor",
    tempo: 124,
    rows: [
      "x---x---x---x---",
      "----x-------x---",
      "--x---x---x---x-",
      "--------x-------",
    ],
  },
  {
    name: "Boom bap",
    tempo: 90,
    rows: [
      "x-----x-x-------",
      "----x-------x---",
      "x-x-x-x-x-x-x-x-",
      "----------------",
    ],
  },
  {
    name: "Breakbeat",
    tempo: 136,
    rows: [
      "x---------x---x-",
      "----x--x-x---x--",
      "x-xxx-x-x-xxx-x-",
      "----------------",
    ],
  },
  {
    name: "Trap",
    tempo: 140,
    rows: [
      "x-----x---x-----",
      "----x-------x---",
      "x-x-x-xxx-x-xxxx",
      "----x-------x---",
    ],
  },
  {
    name: "House",
    tempo: 122,
    rows: [
      "x---x---x---x---",
      "----------------",
      "x-x-x-x-x-x-x-x-",
      "--x---x---x---x-",
    ],
  },
  {
    name: "Halftime",
    tempo: 82,
    rows: [
      "x---------x-----",
      "--------x-------",
      "x-x-x-x-x-x-x-x-",
      "--------x-------",
    ],
  },
];

/** A preset row string into 16 booleans, tolerating short or malformed data. */
export function parseRow(row: string): boolean[] {
  return Array.from({ length: STEP_COUNT }, (_, step) => row[step] === "x");
}

/** A preset's rows into the boolean grid the machine keeps: one 16-step array per track. */
export function parsePreset(preset: Preset): boolean[][] {
  return preset.rows.map(parseRow);
}
