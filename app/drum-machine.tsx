"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShareButton } from "@/components/share-button";
import { getAudioContext, getMasterGain, unlockAudio, useAudioStatus } from "@/lib/audio";
import { playDrum, type DrumId } from "@/lib/drums";
import { DEMO, PRESETS, STEP_COUNT, parsePreset } from "@/lib/presets";
import { renderPatternCard } from "@/lib/pattern-card";
import { identity } from "@/app/identity";
import { cn } from "@/lib/utils";

const TRACKS: { id: DrumId; label: string }[] = [
  { id: "kick", label: "Kick" },
  { id: "snare", label: "Snare" },
  { id: "hat", label: "Hat" },
  { id: "clap", label: "Clap" },
];

const MIN_TEMPO = 60;
const MAX_TEMPO = 180;
const DEFAULT_VOLUME = 80;
const STORAGE_KEY = "pocket-beats.pattern.v1";
/** The scheduler wakes this often and schedules this far ahead on the audio clock. */
const TICK_MS = 25;
const LOOKAHEAD_S = 0.12;

type Pattern = boolean[][];
type Snapshot = { pattern: Pattern; name: string; tempo: number; volume: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function emptyPattern(): Pattern {
  return TRACKS.map(() => Array.from({ length: STEP_COUNT }, () => false));
}

function demoPattern(): Pattern {
  return parsePreset(DEMO);
}

/** The saved snapshot, or null when storage is empty, unreadable or malformed. */
function readSnapshot(): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const candidate = data as Partial<Snapshot>;
    const pattern = candidate.pattern;
    const wellFormed =
      Array.isArray(pattern) &&
      pattern.length === TRACKS.length &&
      pattern.every((row) => Array.isArray(row) && row.length === STEP_COUNT && row.every((cell) => typeof cell === "boolean"));
    if (!wellFormed) return null;
    return {
      pattern: pattern.map((row) => [...row]),
      name: typeof candidate.name === "string" ? candidate.name.slice(0, 60) : "",
      tempo: typeof candidate.tempo === "number" ? clamp(Math.round(candidate.tempo), MIN_TEMPO, MAX_TEMPO) : DEMO.tempo,
      volume: typeof candidate.volume === "number" ? clamp(Math.round(candidate.volume), 0, 100) : DEFAULT_VOLUME,
    };
  } catch {
    // Storage unreadable: the demo pattern and defaults carry on, as the spec asks.
    return null;
  }
}

/** Move the master gain to the given percentage, smoothly enough not to click. */
function applyVolume(percent: number): void {
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(percent / 100, ctx.currentTime, 0.015);
}

export function DrumMachine() {
  const [pattern, setPattern] = useState<Pattern>(demoPattern);
  const [name, setName] = useState(DEMO.name);
  const [tempo, setTempo] = useState(DEMO.tempo);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [playing, setPlaying] = useState(false);
  const [displayStep, setDisplayStep] = useState<number | null>(null);
  const [presetName, setPresetName] = useState("");
  const [soundProblem, setSoundProblem] = useState<string | null>(null);
  const [storageProblem, setStorageProblem] = useState<string | null>(null);
  const [lastCleared, setLastCleared] = useState<Pattern | null>(null);

  const audio = useAudioStatus();

  // The sequencer reads these refs on the audio thread side, so a change under a running
  // playhead is picked up at the very next step without restarting anything.
  const patternRef = useRef<Pattern>(pattern);
  const tempoRef = useRef(tempo);
  const volumeRef = useRef(volume);
  const nameRef = useRef(name);
  const loadedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const nextTimeRef = useRef(0);
  const stepRef = useRef(0);
  const queueRef = useRef<{ step: number; time: number }[]>([]);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);
  useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  // Restore the saved pattern, name, tempo and volume after mount. Reading storage during
  // render would break hydration, and the read happens in a microtask so the first paint is
  // the demo pattern either way. Playback is never restored: sound only ever starts from a click.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const saved = readSnapshot();
      if (saved) {
        setPattern(saved.pattern);
        setName(saved.name);
        setTempo(saved.tempo);
        setVolume(saved.volume);
        patternRef.current = saved.pattern;
        tempoRef.current = saved.tempo;
        volumeRef.current = saved.volume;
      }
      loadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((patch: Partial<Snapshot>) => {
    if (!loadedRef.current) return;
    const snapshot: Snapshot = {
      pattern: patternRef.current,
      name: nameRef.current,
      tempo: tempoRef.current,
      volume: volumeRef.current,
      ...patch,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      setStorageProblem(null);
    } catch {
      setStorageProblem("This browser is not saving your pattern between visits.");
    }
  }, []);

  const tick = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    while (nextTimeRef.current < now + LOOKAHEAD_S) {
      const step = stepRef.current;
      const time = nextTimeRef.current;
      TRACKS.forEach((track, row) => {
        if (patternRef.current[row]?.[step]) playDrum(track.id, time);
      });
      queueRef.current.push({ step, time });
      if (queueRef.current.length > 32) queueRef.current.splice(0, queueRef.current.length - 32);
      nextTimeRef.current += 60 / tempoRef.current / 4;
      stepRef.current = (step + 1) % STEP_COUNT;
    }
    // Which step is sounding right now: the last one scheduled at or before this moment.
    let current = -1;
    for (const entry of queueRef.current) {
      if (entry.time <= now + 0.02) current = entry.step;
    }
    if (current >= 0) setDisplayStep((previous) => (previous === current ? previous : current));
  }, []);

  const start = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) {
      setSoundProblem("This browser cannot play sound.");
      return;
    }
    stepRef.current = 0;
    queueRef.current = [];
    nextTimeRef.current = ctx.currentTime + 0.08;
    setDisplayStep(null);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(tick, TICK_MS);
    tick();
    setPlaying(true);
    setSoundProblem(null);
  }, [tick]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    queueRef.current = [];
    stepRef.current = 0;
    setDisplayStep(null);
    setPlaying(false);
  }, []);

  // Stop the timer when the island unmounts; a reload starts from silence by design.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  const handlePlayStop = useCallback(() => {
    if (playing) {
      stop();
      return;
    }
    void (async () => {
      const status = await unlockAudio();
      if (status !== "running") {
        setSoundProblem("Sound is paused in this browser. Press Play again to enable it.");
        return;
      }
      applyVolume(volumeRef.current);
      start();
    })();
  }, [playing, start, stop]);

  const handlePreview = useCallback((id: DrumId) => {
    void (async () => {
      const status = await unlockAudio();
      if (status !== "running") {
        setSoundProblem("Sound is paused in this browser. Press Play again to enable it.");
        return;
      }
      playDrum(id);
    })();
  }, []);

  const toggleStep = useCallback(
    (row: number, step: number) => {
      const next = pattern.map((cells, r) => (r === row ? cells.map((on, s) => (s === step ? !on : on)) : cells));
      setPattern(next);
      persist({ pattern: next });
    },
    [pattern, persist],
  );

  const clearPattern = useCallback(() => {
    const next = emptyPattern();
    setLastCleared(pattern);
    setPattern(next);
    persist({ pattern: next });
  }, [pattern, persist]);

  const undoClear = useCallback(() => {
    if (!lastCleared) return;
    setPattern(lastCleared);
    persist({ pattern: lastCleared });
    setLastCleared(null);
  }, [lastCleared, persist]);

  const randomize = useCallback(() => {
    const next = TRACKS.map(() => Array.from({ length: STEP_COUNT }, () => Math.random() < 0.22));
    next.forEach((cells) => {
      if (!cells.some(Boolean)) cells[Math.floor(Math.random() * STEP_COUNT)] = true;
    });
    let total = next.reduce((sum, cells) => sum + cells.filter(Boolean).length, 0);
    while (total < 8) {
      const row = Math.floor(Math.random() * next.length);
      const step = Math.floor(Math.random() * STEP_COUNT);
      if (!next[row][step]) {
        next[row][step] = true;
        total += 1;
      }
    }
    setPattern(next);
    persist({ pattern: next });
    setLastCleared(null);
  }, [persist]);

  const choosePreset = useCallback(
    (chosen: string) => {
      const preset = PRESETS.find((item) => item.name === chosen);
      if (!preset) return;
      const next = parsePreset(preset);
      setPattern(next);
      setName(preset.name);
      setTempo(preset.tempo);
      tempoRef.current = preset.tempo;
      setPresetName(preset.name);
      setLastCleared(null);
      persist({ pattern: next, name: preset.name, tempo: preset.tempo });
    },
    [persist],
  );

  const handleName = useCallback(
    (value: string) => {
      setName(value);
      persist({ name: value });
    },
    [persist],
  );

  const handleTempo = useCallback(
    (value: number) => {
      setTempo(value);
      tempoRef.current = value;
      persist({ tempo: value });
    },
    [persist],
  );

  const handleVolume = useCallback(
    (value: number) => {
      setVolume(value);
      volumeRef.current = value;
      applyVolume(value);
      persist({ volume: value });
    },
    [persist],
  );

  const shareTitle = `${name.trim() || "Untitled pattern"} · ${identity.name}`;

  const positionText = playing && displayStep !== null ? `Step ${displayStep + 1} / ${STEP_COUNT}` : "Stopped";
  const soundText =
    audio === "running"
      ? "Sound is on."
      : audio === "suspended"
        ? "Sound is paused. Press Play to enable it."
        : audio === "unsupported"
          ? "Sound is not available in this browser."
          : audio === "closed"
            ? "Sound has been closed."
            : "Sound starts when you press Play.";

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Transport and pattern controls" className="flex flex-wrap items-center gap-2">
        <Button size="lg" className="min-w-32" onClick={handlePlayStop}>
          {playing ? <Square className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          {playing ? "Stop" : "Play"}
        </Button>
        <Button variant="outline" onClick={clearPattern}>
          Clear pattern
        </Button>
        <Button variant="outline" onClick={randomize}>
          Randomize
        </Button>
        {lastCleared && (
          <Button variant="ghost" onClick={undoClear}>
            Undo clear
          </Button>
        )}
      </section>

      <dl
        aria-label="Machine state"
        className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-4"
      >
        <div>
          <dt className="text-muted-foreground">State</dt>
          <dd className="font-semibold">{playing ? "Playing" : "Stopped"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Position</dt>
          <dd className="font-semibold">{positionText}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tempo</dt>
          <dd className="font-semibold">{tempo} BPM</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Volume</dt>
          <dd className="font-semibold">{volume}%</dd>
        </div>
      </dl>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {soundText}
      </p>
      {soundProblem && <p className="text-sm text-destructive">{soundProblem}</p>}
      {storageProblem && <p className="text-sm text-destructive">{storageProblem}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tempo-slider">Tempo</Label>
          <div className="flex items-center gap-3">
            <Slider
              id="tempo-slider"
              min={MIN_TEMPO}
              max={MAX_TEMPO}
              step={1}
              value={[tempo]}
              onValueChange={(values) => handleTempo(values[0] ?? tempo)}
              className="flex-1"
              aria-label="Tempo in BPM"
            />
            <span className="w-20 text-right text-sm tabular-nums">{tempo} BPM</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="volume-slider">Master volume</Label>
          <div className="flex items-center gap-3">
            <Slider
              id="volume-slider"
              min={0}
              max={100}
              step={1}
              value={[volume]}
              onValueChange={(values) => handleVolume(values[0] ?? volume)}
              className="flex-1"
              aria-label="Master volume percent"
            />
            <span className="w-20 text-right text-sm tabular-nums">{volume}%</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="preset-picker">Preset pattern</Label>
          <Select value={presetName} onValueChange={choosePreset}>
            <SelectTrigger id="preset-picker" className="w-full">
              <SelectValue placeholder="Choose a pattern" />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((preset) => (
                <SelectItem key={preset.name} value={preset.name}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pattern-name">Pattern name</Label>
          <Input
            id="pattern-name"
            value={name}
            onChange={(event) => handleName(event.target.value)}
            placeholder="Untitled pattern"
            maxLength={60}
          />
        </div>
      </div>

      <section aria-label="Step grid" className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Tap a step to toggle it. The focused step toggles with Enter or Space, and the lit column is the one sounding.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
          <div className="min-w-max">
            <div className="mb-2 flex items-center gap-1">
              <div className="w-28 shrink-0" aria-hidden="true" />
              {Array.from({ length: STEP_COUNT }, (_, step) => (
                <div
                  key={step}
                  className={cn(
                    "w-10 shrink-0 text-center text-[10px] font-medium text-muted-foreground",
                    step % 4 === 0 && step > 0 && "ml-2",
                  )}
                >
                  {step % 4 === 0 ? step / 4 + 1 : "·"}
                </div>
              ))}
            </div>
            {TRACKS.map((track, row) => (
              <div key={track.id} className="mb-1 flex items-center gap-1 last:mb-0">
                <div className="sticky left-0 z-10 flex w-28 shrink-0 items-center justify-between gap-1 bg-card pr-2">
                  <span className="text-sm font-medium">{track.label}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    aria-label={`Preview ${track.label.toLowerCase()} drum`}
                    onClick={() => handlePreview(track.id)}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                {Array.from({ length: STEP_COUNT }, (_, step) => {
                  const on = pattern[row][step];
                  const isCurrent = playing && displayStep === step;
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${track.label} step ${step + 1}, ${on ? "on" : "off"}`}
                      onClick={() => toggleStep(row, step)}
                      className={cn(
                        "h-10 w-10 shrink-0 rounded-md border transition-colors",
                        step % 4 === 0 && step > 0 && "ml-2",
                        on
                          ? "border-primary bg-primary"
                          : "border-border bg-muted/50 hover:bg-muted",
                        isCurrent && "z-10 ring-2 ring-ring",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <ShareButton
        label="Share pattern"
        title={shareTitle}
        text={`A ${tempo} BPM beat made in ${identity.name}`}
        filename="pocket-beat.png"
        makeImage={() =>
          renderPatternCard({
            name,
            tempo,
            rows: TRACKS.map((track, row) => ({ label: track.label, steps: pattern[row] })),
          })
        }
      />
    </div>
  );
}